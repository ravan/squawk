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
import type {
  SessionState,
  SquawkColor,
  StrokeStyle,
  StrokeWidth,
  TextSize,
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
  setTextSize: (textSize: TextSize) => void;
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
  name: string;
}>[] = [
  { color: '#1e1e1e', name: 'Black' },
  { color: '#e03131', name: 'Red' },
  { color: '#2f9e44', name: 'Green' },
  { color: '#1971c2', name: 'Blue' },
  { color: '#f08c00', name: 'Orange' },
  { color: '#ffffff', name: 'White' },
];
const STROKE_WIDTHS: readonly StrokeWidth[] = [2, 4, 6];
const STROKE_STYLES: readonly StrokeStyle[] = ['solid', 'dashed', 'dotted'];
const TEXT_SIZES: readonly TextSize[] = [14, 18, 24];
let paletteDropdownId = 0;

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

function createColorSwatch(color: SquawkColor): HTMLSpanElement {
  const swatch = document.createElement('span');
  swatch.className = 'color-swatch';
  swatch.style.setProperty('--squawk-color', color);
  swatch.ariaHidden = 'true';
  return swatch;
}

function createColorDropdown(
  onColorChange: (color: SquawkColor) => void,
  signal: AbortSignal,
): Readonly<{
  element: HTMLDivElement;
  trigger: HTMLButtonElement;
  swatch: HTMLSpanElement;
  entries: readonly Readonly<{
    color: SquawkColor;
    button: HTMLButtonElement;
    swatch: HTMLSpanElement;
  }>[];
  close: () => void;
}> {
  const id = `squawk-color-menu-${String(paletteDropdownId)}`;
  paletteDropdownId += 1;

  const element = document.createElement('div');
  element.className = 'stroke-select color-select';

  const trigger = createButton('Color', '');
  trigger.className = 'stroke-select-trigger color-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id);
  const swatch = createColorSwatch('#e03131');

  const chevron = document.createElement('span');
  chevron.className = 'stroke-select-chevron';
  chevron.ariaHidden = 'true';
  chevron.textContent = '⌄';
  trigger.append(swatch, chevron);

  const menu = document.createElement('div');
  menu.id = id;
  menu.className = 'stroke-menu color-menu';
  menu.role = 'listbox';
  menu.ariaLabel = 'Color';
  menu.popover = 'auto';

  const entries = COLOR_OPTIONS.map(({ color, name }) => {
    const label = `${name} ${color}`;
    const button = createButton(label, '');
    button.className = 'stroke-menu-option color-menu-option';
    button.role = 'option';
    button.tabIndex = -1;
    button.dataset.color = color;
    const optionSwatch = createColorSwatch(color);
    button.append(optionSwatch);
    button.addEventListener(
      'click',
      () => {
        onColorChange(color);
        menu.hidePopover();
        trigger.focus();
      },
      { signal },
    );
    menu.append(button);
    return { color, button, swatch: optionSwatch };
  });

  const open = (): void => {
    if (trigger.disabled || menu.matches(':popover-open')) {
      return;
    }
    menu.showPopover();
    const triggerBounds = trigger.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      window.innerWidth - menuBounds.width - margin,
      Math.max(margin, triggerBounds.right - menuBounds.width),
    );
    const below = triggerBounds.bottom + 4;
    const top =
      below + menuBounds.height <= window.innerHeight - margin
        ? below
        : triggerBounds.top - menuBounds.height - 4;
    menu.style.left = `${String(left)}px`;
    menu.style.top = `${String(Math.max(margin, top))}px`;
    const selected = entries.find(
      ({ button }) => button.getAttribute('aria-selected') === 'true',
    );
    selected?.button.focus();
  };

  trigger.addEventListener(
    'click',
    () => {
      if (menu.matches(':popover-open')) {
        menu.hidePopover();
      } else {
        open();
      }
    },
    { signal },
  );
  trigger.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open();
      }
    },
    { signal },
  );
  menu.addEventListener(
    'toggle',
    () => {
      trigger.setAttribute(
        'aria-expanded',
        String(menu.matches(':popover-open')),
      );
    },
    { signal },
  );
  menu.addEventListener(
    'keydown',
    (event) => {
      const root = menu.getRootNode();
      const activeElement =
        root instanceof ShadowRoot
          ? root.activeElement
          : document.activeElement;
      const currentIndex = entries.findIndex(
        ({ button }) => button === activeElement,
      );
      let nextIndex: number | undefined;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % entries.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + entries.length) % entries.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = entries.length - 1;
      }
      if (nextIndex !== undefined) {
        event.preventDefault();
        entries[nextIndex]?.button.focus();
      }
    },
    { signal },
  );

  element.append(trigger, menu);
  return {
    element,
    trigger,
    swatch,
    entries,
    close: () => {
      if (menu.matches(':popover-open')) {
        menu.hidePopover();
      }
    },
  };
}

type StrokeSampleView = Readonly<{
  element: SVGSVGElement;
  render: (strokeStyle: StrokeStyle, strokeWidth: StrokeWidth) => void;
}>;

type StyleDropdownValue = StrokeStyle | StrokeWidth | TextSize;

type StrokeDropdownEntry<T extends StyleDropdownValue> = Readonly<{
  value: T;
  button: HTMLButtonElement;
  sample: StrokeSampleView;
  label: HTMLSpanElement;
  textSize: HTMLSpanElement;
}>;

type StrokeDropdown<T extends StyleDropdownValue> = Readonly<{
  element: HTMLDivElement;
  trigger: HTMLButtonElement;
  triggerSample: StrokeSampleView;
  triggerTextSize: HTMLSpanElement;
  entries: readonly StrokeDropdownEntry<T>[];
  close: () => void;
}>;

function createStrokeSample(): StrokeSampleView {
  const sample = document.createElementNS(SVG_NAMESPACE, 'svg');
  sample.classList.add('stroke-style-sample');
  sample.setAttribute('viewBox', '0 0 34 10');
  sample.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG_NAMESPACE, 'line');
  line.setAttribute('x1', '2');
  line.setAttribute('y1', '5');
  line.setAttribute('x2', '32');
  line.setAttribute('y2', '5');
  line.setAttribute('stroke', 'currentColor');
  sample.append(line);
  return {
    element: sample,
    render: (strokeStyle, strokeWidth) => {
      line.setAttribute('stroke-width', String(strokeWidth));
      const pattern = strokePattern(strokeStyle, strokeWidth);
      line.setAttribute('stroke-linecap', pattern.lineCap);
      if (pattern.style === 'solid') {
        line.removeAttribute('stroke-dasharray');
      } else {
        line.setAttribute('stroke-dasharray', pattern.dashArray.join(' '));
      }
    },
  };
}

function createStrokeDropdown<T extends StyleDropdownValue>(
  label: string,
  values: readonly T[],
  optionName: (value: T) => string,
  onSelect: (value: T) => void,
  signal: AbortSignal,
): StrokeDropdown<T> {
  const id = `squawk-stroke-menu-${String(paletteDropdownId)}`;
  paletteDropdownId += 1;

  const element = document.createElement('div');
  element.className = 'stroke-select';
  const trigger = createButton(label, '');
  trigger.className = 'stroke-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', id);
  const triggerSample = createStrokeSample();
  const triggerTextSize = document.createElement('span');
  triggerTextSize.className = 'stroke-text-size';
  triggerTextSize.hidden = true;
  const chevron = document.createElement('span');
  chevron.className = 'stroke-select-chevron';
  chevron.ariaHidden = 'true';
  chevron.textContent = '⌄';
  trigger.append(triggerSample.element, triggerTextSize, chevron);

  const menu = document.createElement('div');
  menu.id = id;
  menu.className = 'stroke-menu';
  menu.role = 'listbox';
  menu.ariaLabel = label;
  menu.popover = 'auto';

  const entries = values.map((value) => {
    const button = createButton(`${label} ${optionName(value)}`, '');
    button.className = 'stroke-menu-option';
    button.role = 'option';
    button.tabIndex = -1;
    const sample = createStrokeSample();
    const textSize = document.createElement('span');
    textSize.className = 'stroke-text-size';
    textSize.hidden = true;
    const optionLabel = document.createElement('span');
    optionLabel.className = 'stroke-menu-label';
    optionLabel.textContent = optionName(value);
    button.append(sample.element, textSize, optionLabel);
    button.addEventListener(
      'click',
      () => {
        onSelect(value);
        menu.hidePopover();
        trigger.focus();
      },
      { signal },
    );
    menu.append(button);
    return { value, button, sample, label: optionLabel, textSize };
  });

  const open = (): void => {
    if (trigger.disabled || menu.matches(':popover-open')) {
      return;
    }
    menu.showPopover();
    const triggerBounds = trigger.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(
      window.innerWidth - menuBounds.width - margin,
      Math.max(margin, triggerBounds.right - menuBounds.width),
    );
    const below = triggerBounds.bottom + 4;
    const top =
      below + menuBounds.height <= window.innerHeight - margin
        ? below
        : triggerBounds.top - menuBounds.height - 4;
    menu.style.left = `${String(left)}px`;
    menu.style.top = `${String(Math.max(margin, top))}px`;
    const selected = entries.find(
      ({ button }) => button.getAttribute('aria-selected') === 'true',
    );
    selected?.button.focus();
  };

  trigger.addEventListener(
    'click',
    () => {
      if (menu.matches(':popover-open')) {
        menu.hidePopover();
      } else {
        open();
      }
    },
    { signal },
  );
  trigger.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open();
      }
    },
    { signal },
  );
  menu.addEventListener(
    'toggle',
    () => {
      trigger.setAttribute(
        'aria-expanded',
        String(menu.matches(':popover-open')),
      );
    },
    { signal },
  );
  menu.addEventListener(
    'keydown',
    (event) => {
      const root = menu.getRootNode();
      const activeElement =
        root instanceof ShadowRoot
          ? root.activeElement
          : document.activeElement;
      const currentIndex = entries.findIndex(
        ({ button }) => button === activeElement,
      );
      let nextIndex: number | undefined;
      if (event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % entries.length;
      } else if (event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + entries.length) % entries.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = entries.length - 1;
      }
      if (nextIndex !== undefined) {
        event.preventDefault();
        entries[nextIndex]?.button.focus();
      }
    },
    { signal },
  );

  element.append(trigger, menu);
  return {
    element,
    trigger,
    triggerSample,
    triggerTextSize,
    entries,
    close: () => {
      if (menu.matches(':popover-open')) {
        menu.hidePopover();
      }
    },
  };
}

function textSizeName(textSize: TextSize): 'S' | 'M' | 'L' {
  switch (textSize) {
    case 14:
      return 'S';
    case 18:
      return 'M';
    case 24:
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

  const ruler = createButton('Ruler', '⌗', 'Measure an area');
  ruler.addEventListener(
    'click',
    () => {
      callbacks.setTool('ruler');
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

  const font = createButton(
    'Font inspector',
    'Aa',
    'Inspect font size and family',
  );
  font.addEventListener(
    'click',
    () => {
      callbacks.setTool('font');
    },
    { signal },
  );

  const eyedropper = createButton('Eyedropper', '⊙', 'Sample a page color');
  eyedropper.addEventListener(
    'click',
    () => {
      callbacks.setTool('eyedropper');
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
    ruler,
    ellipse,
    arrow,
    pen,
    text,
    picker,
    font,
    eyedropper,
    eraser,
  );
  const toolButtons: readonly Readonly<{
    tool: Tool;
    button: HTMLButtonElement;
  }>[] = [
    { tool: 'interact', button: interact },
    { tool: 'select', button: select },
    { tool: 'rect', button: rectangle },
    { tool: 'ruler', button: ruler },
    { tool: 'ellipse', button: ellipse },
    { tool: 'arrow', button: arrow },
    { tool: 'pen', button: pen },
    { tool: 'text', button: text },
    { tool: 'picker', button: picker },
    { tool: 'font', button: font },
    { tool: 'eyedropper', button: eyedropper },
    { tool: 'eraser', button: eraser },
  ];

  const colorDropdown = createColorDropdown(callbacks.setColor, signal);

  const colorGroup = document.createElement('div');
  colorGroup.className = 'palette-group';
  colorGroup.append(colorDropdown.element);

  const fill = createButton('Fill shapes', '■');
  fill.addEventListener('click', callbacks.toggleFillStyle, { signal });

  const fillGroup = document.createElement('div');
  fillGroup.className = 'palette-group';
  fillGroup.append(fill);

  const strokeWidthDropdown = createStrokeDropdown(
    'Stroke width',
    STROKE_WIDTHS,
    String,
    callbacks.setStrokeWidth,
    signal,
  );
  strokeWidthDropdown.element.classList.add('stroke-width-select');
  const strokeStyleDropdown = createStrokeDropdown(
    'Stroke style',
    STROKE_STYLES,
    (strokeStyle) => strokeStyle,
    callbacks.setStrokeStyle,
    signal,
  );
  const textSizeDropdown = createStrokeDropdown(
    'Text size',
    TEXT_SIZES,
    textSizeName,
    callbacks.setTextSize,
    signal,
  );
  textSizeDropdown.element.classList.add('text-size-select');
  const strokeGroup = document.createElement('div');
  strokeGroup.className = 'palette-group stroke-group';
  strokeGroup.append(strokeWidthDropdown.element, strokeStyleDropdown.element);

  const textSizeGroup = document.createElement('div');
  textSizeGroup.className = 'palette-group';
  textSizeGroup.append(textSizeDropdown.element);

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
    strokeGroup,
    textSizeGroup,
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

      const styleLocked =
        selectedTool === 'select' ||
        selectedTool === 'ruler' ||
        selectedTool === 'font';
      const selectedColor = COLOR_OPTIONS.find(
        ({ color }) => color === state.style.color,
      );
      if (selectedColor === undefined) {
        throw new Error(`Unsupported Palette color: ${state.style.color}`);
      }
      const colorLabel = `Color ${selectedColor.name} ${selectedColor.color}`;
      colorDropdown.trigger.ariaLabel = colorLabel;
      colorDropdown.trigger.title = colorLabel;
      colorDropdown.trigger.dataset.color = state.style.color;
      colorDropdown.trigger.disabled = styleLocked;
      colorDropdown.swatch.style.setProperty(
        '--squawk-color',
        state.style.color,
      );
      for (const entry of colorDropdown.entries) {
        entry.button.disabled = styleLocked;
        entry.button.setAttribute(
          'aria-selected',
          String(entry.color === state.style.color),
        );
      }
      if (styleLocked) {
        colorDropdown.close();
      }

      fill.setAttribute(
        'aria-pressed',
        String(state.style.fillStyle === 'solid'),
      );
      fill.disabled =
        selectedTool !== 'interact' &&
        selectedTool !== 'rect' &&
        selectedTool !== 'ellipse';

      const textActive = selectedTool === 'text';
      const widthLabel = `Stroke width ${String(state.style.strokeWidth)}`;
      strokeWidthDropdown.trigger.ariaLabel = widthLabel;
      strokeWidthDropdown.trigger.title = widthLabel;
      strokeWidthDropdown.trigger.disabled = textActive || styleLocked;
      strokeWidthDropdown.triggerSample.render(
        'solid',
        state.style.strokeWidth,
      );
      strokeWidthDropdown.triggerSample.element.toggleAttribute(
        'hidden',
        false,
      );
      strokeWidthDropdown.triggerTextSize.hidden = true;
      for (const entry of strokeWidthDropdown.entries) {
        const label = `Stroke width ${String(entry.value)}`;
        entry.button.ariaLabel = label;
        entry.button.title = label;
        entry.button.disabled = textActive || styleLocked;
        entry.button.setAttribute(
          'aria-selected',
          String(state.style.strokeWidth === entry.value),
        );
        entry.sample.render('solid', entry.value);
        entry.sample.element.toggleAttribute('hidden', false);
        entry.textSize.hidden = true;
        entry.label.textContent = '';
        entry.label.hidden = true;
      }
      if (textActive || styleLocked) {
        strokeWidthDropdown.close();
      }

      const styleDisabled = textActive || styleLocked;
      const styleLabel = `Stroke style ${state.style.strokeStyle}`;
      strokeStyleDropdown.trigger.ariaLabel = styleLabel;
      strokeStyleDropdown.trigger.title = styleLabel;
      strokeStyleDropdown.trigger.disabled = styleDisabled;
      strokeStyleDropdown.triggerSample.render(
        state.style.strokeStyle,
        state.style.strokeWidth,
      );
      for (const entry of strokeStyleDropdown.entries) {
        entry.button.disabled = styleDisabled;
        entry.button.setAttribute(
          'aria-selected',
          String(state.style.strokeStyle === entry.value),
        );
        entry.sample.render(entry.value, state.style.strokeWidth);
        entry.label.textContent =
          entry.value.slice(0, 1).toUpperCase() + entry.value.slice(1);
      }
      if (styleDisabled) {
        strokeStyleDropdown.close();
      }

      const textSizeLabel = `Text size ${textSizeName(state.style.textSize)}`;
      textSizeDropdown.trigger.ariaLabel = textSizeLabel;
      textSizeDropdown.trigger.title = textSizeLabel;
      textSizeDropdown.trigger.disabled = !textActive;
      textSizeDropdown.triggerSample.element.toggleAttribute('hidden', true);
      textSizeDropdown.triggerTextSize.textContent = textSizeName(
        state.style.textSize,
      );
      textSizeDropdown.triggerTextSize.hidden = false;
      for (const entry of textSizeDropdown.entries) {
        const sizeName = textSizeName(entry.value);
        const label = `Text size ${sizeName}`;
        entry.button.ariaLabel = label;
        entry.button.title = label;
        entry.button.disabled = !textActive;
        entry.button.setAttribute(
          'aria-selected',
          String(state.style.textSize === entry.value),
        );
        entry.sample.element.toggleAttribute('hidden', true);
        entry.textSize.textContent = sizeName;
        entry.textSize.hidden = false;
        entry.label.textContent = '';
        entry.label.hidden = true;
      }
      if (!textActive) {
        textSizeDropdown.close();
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
