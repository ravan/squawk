import type { CaptureActivity } from '../../src/capture/controller';
import {
  clampPalettePosition,
  palettePositionForPointer,
} from '../../src/core/palette-drag';
import type {
  BoxSize,
  PaletteDragStart,
  PalettePosition,
} from '../../src/core/palette-drag';
import { SquawkColorSchema } from '../../src/core/model';
import type {
  SessionState,
  SquawkColor,
  StrokeStyle,
  StrokeWidth,
  Tool,
} from '../../src/core/model';
import { activeTool } from '../../src/core/session';
import { strokePattern } from '../../src/core/stroke-pattern';
import type { ToastView } from './toast';

export type PaletteCallbacks = Readonly<{
  setTool: (tool: Tool) => void;
  setColor: (color: SquawkColor) => void;
  toggleFillStyle: () => void;
  setStrokeWidth: (strokeWidth: StrokeWidth) => void;
  setStrokeStyle: (strokeStyle: StrokeStyle) => void;
  undo: () => void;
  clear: () => void;
  capture: () => void;
  close: () => void;
}>;
export type PaletteView = Readonly<{
  element: HTMLDivElement;
  render: (state: SessionState, activity: CaptureActivity) => void;
  constrainToViewport: () => void;
}>;

type ActiveDrag = Readonly<{
  pointerId: number;
  start: PaletteDragStart;
}>;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PALETTE_MARGIN = 8;
const COLOR_OPTIONS: readonly Readonly<{
  color: SquawkColor;
  symbol: string;
  name: string;
}>[] = [
  { color: '#1e1e1e', symbol: '⚫', name: 'Black' },
  { color: '#e03131', symbol: '🔴', name: 'Red' },
  { color: '#2f9e44', symbol: '🟢', name: 'Green' },
  { color: '#1971c2', symbol: '🔵', name: 'Blue' },
  { color: '#f08c00', symbol: '🟠', name: 'Orange' },
  { color: '#ffffff', symbol: '⚪', name: 'White' },
];
const STROKE_WIDTHS: readonly StrokeWidth[] = [2, 4, 6];
const STROKE_STYLES: readonly StrokeStyle[] = ['solid', 'dashed', 'dotted'];

function viewportSize(): BoxSize {
  return { width: window.innerWidth, height: window.innerHeight };
}

function setPalettePosition(
  palette: HTMLDivElement,
  position: PalettePosition,
): void {
  palette.style.left = `${String(position.x)}px`;
  palette.style.top = `${String(position.y)}px`;
  palette.style.bottom = 'auto';
  palette.style.transform = 'none';
}

function createButton(
  label: string,
  text: string,
  title = label,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.ariaLabel = label;
  button.title = title;
  button.textContent = text;
  return button;
}

function createColorSelect(
  onColorChange: (color: SquawkColor) => void,
  signal: AbortSignal,
): Readonly<{
  element: HTMLDivElement;
  select: HTMLSelectElement;
  swatch: HTMLSpanElement;
}> {
  const element = document.createElement('div');
  element.className = 'color-select';

  const swatch = document.createElement('span');
  swatch.className = 'color-swatch';

  const chevron = document.createElement('span');
  chevron.className = 'color-select-chevron';
  chevron.ariaHidden = 'true';
  chevron.textContent = '⌄';

  const select = document.createElement('select');
  select.ariaLabel = 'Color';
  select.title = 'Color';
  for (const { color, symbol, name } of COLOR_OPTIONS) {
    const option = document.createElement('option');
    option.value = color;
    option.textContent = `${symbol} ${name}`;
    select.append(option);
  }
  select.addEventListener(
    'change',
    () => {
      onColorChange(SquawkColorSchema.parse(select.value));
    },
    { signal },
  );

  element.append(swatch, chevron, select);
  return { element, select, swatch };
}

function createStrokeStyleSample(strokeStyle: StrokeStyle): SVGSVGElement {
  const sample = document.createElementNS(SVG_NAMESPACE, 'svg');
  sample.classList.add('stroke-style-sample');
  sample.setAttribute('viewBox', '0 0 26 8');
  sample.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG_NAMESPACE, 'line');
  line.setAttribute('x1', '1');
  line.setAttribute('y1', '4');
  line.setAttribute('x2', '25');
  line.setAttribute('y2', '4');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '2');
  const pattern = strokePattern(strokeStyle, 2);
  line.setAttribute('stroke-linecap', pattern.lineCap);
  if (pattern.style !== 'solid') {
    line.setAttribute('stroke-dasharray', pattern.dashArray.join(' '));
  }
  sample.append(line);
  return sample;
}

function textSizeName(strokeWidth: StrokeWidth): 'S' | 'M' | 'L' {
  switch (strokeWidth) {
    case 2:
      return 'S';
    case 4:
      return 'M';
    case 6:
      return 'L';
  }
}

export function createPalette(
  callbacks: PaletteCallbacks,
  toast: ToastView,
  signal: AbortSignal,
): PaletteView {
  const shell = document.createElement('div');
  shell.className = 'palette-shell';

  const palette = document.createElement('div');
  palette.className = 'palette';
  palette.role = 'toolbar';
  palette.ariaLabel = 'Squawk palette';

  toast.element.className = 'toast';

  const grip = createButton('Drag Squawk palette', '⠿');
  grip.className = 'grip';

  const interact = createButton('Interact', '☝', 'Interact with page');
  interact.addEventListener(
    'click',
    () => {
      callbacks.setTool('interact');
    },
    { signal },
  );

  const select = createButton('Select', '↖');
  select.addEventListener(
    'click',
    () => {
      callbacks.setTool('select');
    },
    { signal },
  );

  const rectangle = createButton('Rectangle', '□');
  rectangle.addEventListener(
    'click',
    () => {
      callbacks.setTool('rect');
    },
    { signal },
  );

  const ellipse = createButton('Ellipse', '○');
  ellipse.addEventListener(
    'click',
    () => {
      callbacks.setTool('ellipse');
    },
    { signal },
  );

  const arrow = createButton('Arrow', '→');
  arrow.addEventListener(
    'click',
    () => {
      callbacks.setTool('arrow');
    },
    { signal },
  );

  const pen = createButton('Pen', '✎');
  pen.addEventListener(
    'click',
    () => {
      callbacks.setTool('pen');
    },
    { signal },
  );

  const text = createButton('Text', 'T');
  text.addEventListener(
    'click',
    () => {
      callbacks.setTool('text');
    },
    { signal },
  );

  const picker = createButton('Element picker', '⌖');
  picker.addEventListener(
    'click',
    () => {
      callbacks.setTool('picker');
    },
    { signal },
  );

  const eraser = createButton('Eraser', '⌫');
  eraser.addEventListener(
    'click',
    () => {
      callbacks.setTool('eraser');
    },
    { signal },
  );

  const toolGroup = document.createElement('div');
  toolGroup.className = 'palette-group';
  toolGroup.append(
    grip,
    interact,
    select,
    rectangle,
    ellipse,
    arrow,
    pen,
    text,
    picker,
    eraser,
  );
  const toolButtons: readonly Readonly<{
    tool: Tool;
    button: HTMLButtonElement;
  }>[] = [
    { tool: 'interact', button: interact },
    { tool: 'select', button: select },
    { tool: 'rect', button: rectangle },
    { tool: 'ellipse', button: ellipse },
    { tool: 'arrow', button: arrow },
    { tool: 'pen', button: pen },
    { tool: 'text', button: text },
    { tool: 'picker', button: picker },
    { tool: 'eraser', button: eraser },
  ];

  const colorSelect = createColorSelect(callbacks.setColor, signal);

  const colorGroup = document.createElement('div');
  colorGroup.className = 'palette-group';
  colorGroup.append(colorSelect.element);

  const fill = createButton('Fill shapes', '■');
  fill.addEventListener('click', callbacks.toggleFillStyle, { signal });

  const fillGroup = document.createElement('div');
  fillGroup.className = 'palette-group';
  fillGroup.append(fill);

  const strokeWidthButtons = STROKE_WIDTHS.map((strokeWidth) => {
    const button = createButton(`Stroke width ${String(strokeWidth)}`, '');
    const swatch = document.createElement('span');
    swatch.className = 'stroke-swatch';
    swatch.style.setProperty(
      '--squawk-stroke-width',
      `${String(strokeWidth)}px`,
    );
    const sizeName = textSizeName(strokeWidth);
    const textSize = document.createElement('span');
    textSize.textContent = sizeName;
    textSize.hidden = true;
    button.append(swatch, textSize);
    button.addEventListener(
      'click',
      () => {
        callbacks.setStrokeWidth(strokeWidth);
      },
      { signal },
    );
    return { strokeWidth, sizeName, swatch, textSize, button };
  });

  const strokeWidthGroup = document.createElement('div');
  strokeWidthGroup.className = 'palette-group';
  strokeWidthGroup.append(...strokeWidthButtons.map(({ button }) => button));

  const strokeStyleButtons = STROKE_STYLES.map((strokeStyle) => {
    const button = createButton(`Stroke style ${strokeStyle}`, '');
    button.append(createStrokeStyleSample(strokeStyle));
    button.addEventListener(
      'click',
      () => {
        callbacks.setStrokeStyle(strokeStyle);
      },
      { signal },
    );
    return { strokeStyle, button };
  });

  const strokeStyleGroup = document.createElement('div');
  strokeStyleGroup.className = 'palette-group';
  strokeStyleGroup.append(...strokeStyleButtons.map(({ button }) => button));

  const undo = createButton('Undo', '↶');
  undo.addEventListener('click', callbacks.undo, { signal });

  const clear = createButton('Clear all', 'Clear');
  clear.addEventListener('click', callbacks.clear, { signal });

  const camera = createButton('Camera', '📷');
  camera.addEventListener('click', callbacks.capture, { signal });

  const close = createButton('Close Squawk', '×');
  close.addEventListener('click', callbacks.close, { signal });

  const actionGroup = document.createElement('div');
  actionGroup.className = 'palette-group';
  actionGroup.append(undo, clear, camera, close);

  let activeDrag: ActiveDrag | undefined;

  grip.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      const bounds = shell.getBoundingClientRect();
      activeDrag = {
        pointerId: event.pointerId,
        start: {
          pointer: { x: event.clientX, y: event.clientY },
          palette: { x: bounds.left, y: bounds.top },
          paletteSize: { width: bounds.width, height: bounds.height },
          viewportSize: viewportSize(),
          margin: PALETTE_MARGIN,
        },
      };
      grip.setPointerCapture(event.pointerId);
      grip.dataset.dragging = '';
    },
    { signal },
  );

  grip.addEventListener(
    'pointermove',
    (event) => {
      if (activeDrag?.pointerId !== event.pointerId) {
        return;
      }

      setPalettePosition(
        shell,
        palettePositionForPointer(activeDrag.start, {
          x: event.clientX,
          y: event.clientY,
        }),
      );
    },
    { signal },
  );

  const finishDrag = (event: PointerEvent): void => {
    if (activeDrag?.pointerId !== event.pointerId) {
      return;
    }

    activeDrag = undefined;
    delete grip.dataset.dragging;
  };

  grip.addEventListener('pointerup', finishDrag, { signal });
  grip.addEventListener('pointercancel', finishDrag, { signal });
  grip.addEventListener('lostpointercapture', finishDrag, { signal });

  const constrainToViewport = (): void => {
    const bounds = shell.getBoundingClientRect();
    setPalettePosition(
      shell,
      clampPalettePosition(
        { x: bounds.left, y: bounds.top },
        { width: bounds.width, height: bounds.height },
        viewportSize(),
        PALETTE_MARGIN,
      ),
    );
  };

  window.addEventListener('resize', constrainToViewport, { signal });

  palette.append(
    toolGroup,
    colorGroup,
    fillGroup,
    strokeWidthGroup,
    strokeStyleGroup,
    actionGroup,
  );
  shell.append(toast.element, palette);

  return {
    element: shell,
    constrainToViewport,
    render: (state, activity) => {
      const selectedTool = activeTool(state);
      for (const { tool, button } of toolButtons) {
        button.setAttribute('aria-pressed', String(selectedTool === tool));
      }

      const selectActive = selectedTool === 'select';
      colorSelect.select.value = state.style.color;
      colorSelect.select.disabled = selectActive;
      colorSelect.swatch.style.setProperty('--squawk-color', state.style.color);

      fill.setAttribute(
        'aria-pressed',
        String(state.style.fillStyle === 'solid'),
      );
      fill.disabled =
        selectedTool !== 'interact' &&
        selectedTool !== 'rect' &&
        selectedTool !== 'ellipse';

      for (const {
        strokeWidth,
        sizeName,
        swatch,
        textSize,
        button,
      } of strokeWidthButtons) {
        button.setAttribute(
          'aria-pressed',
          String(state.style.strokeWidth === strokeWidth),
        );
        const textActive = selectedTool === 'text';
        const label = textActive
          ? `Text size ${sizeName}`
          : `Stroke width ${String(strokeWidth)}`;
        button.ariaLabel = label;
        button.title = label;
        button.disabled = selectActive;
        swatch.hidden = textActive;
        textSize.hidden = !textActive;
      }

      for (const { strokeStyle, button } of strokeStyleButtons) {
        button.setAttribute(
          'aria-pressed',
          String(state.style.strokeStyle === strokeStyle),
        );
        button.disabled = selectedTool === 'text' || selectActive;
      }

      undo.disabled = state.history.length === 0;
      clear.disabled = state.annotations.length === 0;
      camera.disabled =
        activity === 'capturing' ||
        state.tool.kind === 'select-dragging' ||
        state.tool.kind === 'text-drawing';
    },
  };
}
