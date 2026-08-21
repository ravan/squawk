import type { SquawkChromeVisibility } from '../../src/capture/controller';
import {
  arrowHeadGeometry,
  deriveTextLayout,
  textEraserBounds,
  textSelectionBounds,
} from '../../src/core/geometry';
import type {
  AnnotationId,
  DerivedTextLayout,
  DocumentPoint,
  FillStyle,
  FontAnnotation,
  LabelAnnotation,
  OverlayItem,
  PreviewAnnotation,
  SelectionTargetId,
  SessionState,
  SquawkColor,
  StrokeStyle,
  StrokeWidth,
  TextAnnotation,
  TextLineBounds,
} from '../../src/core/model';
import {
  activeTool,
  overlayCursor,
  overlayItems,
} from '../../src/core/session';
import { strokePattern } from '../../src/core/stroke-pattern';
import { TEXT_FONT_FAMILY } from './text-font';
import type { TextMetricsAdapter } from './text-metrics';

export type OverlayView = Readonly<{
  element: SVGSVGElement;
  render: (state: SessionState) => void;
  setChromeVisibility: (visibility: SquawkChromeVisibility) => void;
}>;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const SELECTION_COLOR = '#1971c2';
const SELECTION_OPACITY = 0.28;
const SELECTION_TEXT_PADDING = 2;
const SELECTION_HIT_PADDING = 4;
const SVELTE_LOC_LINE_OFFSET = 14;
const SVELTE_LOC_FONT_SIZE = '10';
const LABEL_TEXT_COLOR = '#ffffff';
const LABEL_BACKGROUND_COLOR = '#000000';
const LABEL_BACKGROUND_PADDING_X = 3;
const LABEL_BACKGROUND_PADDING_Y = 2;
const LABEL_BACKGROUND_RADIUS = 2;
const COLOR_SAMPLE_RADIUS = 8;
const COLOR_SAMPLE_LABEL_OFFSET = 14;
const COLOR_SAMPLE_LABEL_WIDTH = 64;
const COLOR_SAMPLE_LABEL_HEIGHT = 20;
const RULER_FILL_COLOR = '#ffd43b';
const RULER_STROKE_COLOR = '#868e96';
const RULER_LABEL_HEIGHT = 28;
const RULER_LABEL_GAP = 6;
const RULER_LABEL_PADDING_X = 10;
const RULER_LABEL_CHARACTER_WIDTH = 7.8;
const FONT_LABEL_BACKGROUND = '#000000';
const FONT_LABEL_TEXT = '#ffffff';
const FONT_LABEL_HEIGHT = 28;
const FONT_LABEL_GAP = 4;
const FONT_LABEL_PADDING_X = 10;
const FONT_LABEL_CHARACTER_WIDTH = 7.5;

type CommittedOverlayItem = Extract<OverlayItem, { phase: 'committed' }>;
type MovePreviewOverlayItem = Extract<OverlayItem, { phase: 'move-preview' }>;
type AnnotationOverlayItem = CommittedOverlayItem | MovePreviewOverlayItem;
type PreviewOverlayItem = Extract<OverlayItem, { phase: 'preview' }>;
type PickerHighlightOverlayItem = Extract<
  OverlayItem,
  { phase: 'picker-highlight' }
>;
type FontHighlightOverlayItem = Extract<
  OverlayItem,
  { phase: 'font-highlight' }
>;
type TextBoxPreviewAnnotation = Extract<
  PreviewAnnotation,
  { kind: 'text-box-preview' }
>;
type TextPreviewAnnotation = Extract<
  PreviewAnnotation,
  { kind: 'text-preview' }
>;
type RenderableText = TextAnnotation | TextPreviewAnnotation;
type RenderedText = Readonly<{
  element: SVGTextElement;
  layout: DerivedTextLayout;
}>;
type Bounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;
type RulerGeometry = Readonly<{
  x: number;
  y: number;
  w: number;
  h: number;
}>;
type RulerMeasurement = 'width' | 'height';

function applyRootAttributes(
  root: SVGElement,
  item: AnnotationOverlayItem | PreviewOverlayItem,
): void {
  root.classList.add('annotation');
  root.dataset.phase = item.phase;
  root.dataset.kind = item.annotation.kind;
  root.dataset.annotationId = item.annotation.id;
  if (item.phase === 'committed' || item.phase === 'move-preview') {
    root.dataset.selectionTargetId = item.annotation.selectionTargetId;
  }
  root.setAttribute('opacity', String(item.opacity));
}

function pointList(points: readonly DocumentPoint[]): string {
  return points
    .map((point) => `${String(point.x)},${String(point.y)}`)
    .join(' ');
}

function applyStrokePattern(
  element: SVGElement,
  strokeStyle: StrokeStyle,
  strokeWidth: StrokeWidth,
): void {
  const pattern = strokePattern(strokeStyle, strokeWidth);
  element.setAttribute('stroke-linecap', pattern.lineCap);
  if (pattern.style === 'solid') {
    element.removeAttribute('stroke-dasharray');
    return;
  }
  element.setAttribute('stroke-dasharray', pattern.dashArray.join(' '));
}

function applyShapeFill(
  element: SVGElement,
  fillStyle: FillStyle,
  color: SquawkColor,
): void {
  if (fillStyle === 'none') {
    element.setAttribute('fill', 'none');
    element.removeAttribute('fill-opacity');
    return;
  }
  element.setAttribute('fill', color);
  element.setAttribute('fill-opacity', '1');
}

function applyHitIdentity(
  element: SVGElement,
  annotationId: AnnotationId,
  selectionTargetId: SelectionTargetId,
): void {
  element.classList.add('annotation-hit-target');
  element.dataset.annotationId = annotationId;
  element.dataset.selectionTargetId = selectionTargetId;
}

function applyStrokeHitTargetAttributes(
  element: SVGElement,
  annotationId: AnnotationId,
  selectionTargetId: SelectionTargetId,
  strokeWidth: StrokeWidth,
): void {
  applyHitIdentity(element, annotationId, selectionTargetId);
  element.classList.add('selection-hit-stroke');
  element.setAttribute('fill', 'none');
  element.setAttribute('stroke', 'transparent');
  element.setAttribute('stroke-width', String(Math.max(12, strokeWidth)));
  element.setAttribute('stroke-linecap', 'round');
  element.setAttribute('stroke-linejoin', 'round');
}

function applyFilledHitTargetAttributes(
  element: SVGElement,
  annotationId: AnnotationId,
  selectionTargetId: SelectionTargetId,
): void {
  applyHitIdentity(element, annotationId, selectionTargetId);
  element.classList.add('selection-hit-fill');
  element.setAttribute('fill', 'transparent');
  element.setAttribute('stroke', 'none');
}

function applySelectionStrokeAttributes(
  element: SVGElement,
  strokeWidth: StrokeWidth,
): void {
  element.classList.add('selection-affordance');
  element.setAttribute('fill', 'none');
  element.setAttribute('stroke', SELECTION_COLOR);
  element.setAttribute('stroke-width', String(Math.max(8, strokeWidth + 6)));
  element.setAttribute('stroke-linecap', 'round');
  element.setAttribute('stroke-linejoin', 'round');
  element.setAttribute('opacity', String(SELECTION_OPACITY));
}

function contrastingColor(color: string): '#000000' | '#ffffff' {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 150 ? '#000000' : '#ffffff';
}

function renderText(
  item: AnnotationOverlayItem | PreviewOverlayItem,
  annotation: RenderableText,
  textMetrics: TextMetricsAdapter,
): RenderedText {
  const text = document.createElementNS(SVG_NAMESPACE, 'text');
  applyRootAttributes(text, item);
  text.setAttribute('x', String(annotation.x));
  text.setAttribute('y', String(annotation.y));
  text.setAttribute('dominant-baseline', 'text-before-edge');
  text.setAttribute('fill', annotation.color);
  text.setAttribute('font-family', TEXT_FONT_FAMILY);
  text.setAttribute('font-size', String(annotation.size));
  text.setAttribute('font-weight', '400');
  text.setAttributeNS(XML_NAMESPACE, 'xml:space', 'preserve');

  const layout = deriveTextLayout(annotation, textMetrics.measureWidth);
  for (const [index, line] of layout.lines.entries()) {
    const bounds = layout.lineBounds[index];
    if (bounds === undefined) {
      continue;
    }
    const tspan = document.createElementNS(SVG_NAMESPACE, 'tspan');
    tspan.setAttribute('x', String(bounds.x));
    tspan.setAttribute('y', String(bounds.y));
    tspan.textContent = line;
    text.append(tspan);
  }
  return { element: text, layout };
}

function renderSvelteLocText(
  x: number,
  y: number,
  svelteLoc: string,
): SVGTextElement {
  const text = document.createElementNS(SVG_NAMESPACE, 'text');
  text.classList.add('svelte-loc-text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.setAttribute('dominant-baseline', 'text-before-edge');
  text.setAttribute('fill', LABEL_TEXT_COLOR);
  text.setAttribute('font-family', TEXT_FONT_FAMILY);
  text.setAttribute('font-size', SVELTE_LOC_FONT_SIZE);
  text.setAttribute('font-weight', '400');
  text.textContent = svelteLoc;
  return text;
}

function renderLabel(
  item: AnnotationOverlayItem,
  annotation: LabelAnnotation,
): readonly [
  text: SVGTextElement,
  selectorText: SVGGraphicsElement,
  locText: SVGTSpanElement | null,
] {
  const text = document.createElementNS(SVG_NAMESPACE, 'text');
  applyRootAttributes(text, item);
  text.setAttribute('x', String(annotation.x));
  text.setAttribute('y', String(annotation.y));
  text.setAttribute('dominant-baseline', 'text-before-edge');
  text.setAttribute('fill', LABEL_TEXT_COLOR);
  text.setAttribute('font-family', 'system-ui, sans-serif');
  text.setAttribute('font-size', '12');
  text.setAttribute('font-weight', '600');
  if (annotation.svelteLoc === undefined) {
    text.textContent = annotation.text;
    return [text, text, null];
  }
  const selectorLine = document.createElementNS(SVG_NAMESPACE, 'tspan');
  selectorLine.setAttribute('x', String(annotation.x));
  selectorLine.setAttribute('y', String(annotation.y));
  selectorLine.setAttribute('fill', LABEL_TEXT_COLOR);
  selectorLine.textContent = annotation.text;
  const locLine = document.createElementNS(SVG_NAMESPACE, 'tspan');
  locLine.classList.add('svelte-loc-text');
  locLine.setAttribute('x', String(annotation.x));
  locLine.setAttribute('y', String(annotation.y + SVELTE_LOC_LINE_OFFSET));
  locLine.setAttribute('fill', LABEL_TEXT_COLOR);
  locLine.setAttribute('font-family', TEXT_FONT_FAMILY);
  locLine.setAttribute('font-size', SVELTE_LOC_FONT_SIZE);
  locLine.setAttribute('font-weight', '400');
  locLine.textContent = annotation.svelteLoc;
  text.append(selectorLine, locLine);
  return [text, selectorLine, locLine];
}

function renderBoundsRectangle(
  bounds: Bounds,
  padding: number,
): SVGRectElement {
  const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
  rectangle.setAttribute('x', String(bounds.x - padding));
  rectangle.setAttribute('y', String(bounds.y - padding));
  rectangle.setAttribute('width', String(bounds.width + padding * 2));
  rectangle.setAttribute('height', String(bounds.height + padding * 2));
  return rectangle;
}

function insertLabelBackground(
  root: SVGSVGElement,
  labelText: SVGGraphicsElement,
  before: SVGElement,
  phase: 'committed' | 'move-preview' | 'picker-highlight',
  line: 'selector' | 'svelte-loc',
  opacity: number,
): void {
  const bounds = labelText.getBBox();
  const background = document.createElementNS(SVG_NAMESPACE, 'rect');
  background.classList.add('label-background');
  background.dataset.phase = phase;
  background.dataset.labelLine = line;
  background.setAttribute('x', String(bounds.x - LABEL_BACKGROUND_PADDING_X));
  background.setAttribute('y', String(bounds.y - LABEL_BACKGROUND_PADDING_Y));
  background.setAttribute(
    'width',
    String(bounds.width + LABEL_BACKGROUND_PADDING_X * 2),
  );
  background.setAttribute(
    'height',
    String(bounds.height + LABEL_BACKGROUND_PADDING_Y * 2),
  );
  background.setAttribute('rx', String(LABEL_BACKGROUND_RADIUS));
  background.setAttribute('ry', String(LABEL_BACKGROUND_RADIUS));
  background.setAttribute('fill', LABEL_BACKGROUND_COLOR);
  background.setAttribute('opacity', String(opacity));
  background.setAttribute('pointer-events', 'none');
  root.insertBefore(background, before);
}

function measuredLabelBounds(text: SVGTextElement): Bounds {
  const measured = text.getBBox();
  return {
    x: measured.x,
    y: measured.y,
    width: measured.width,
    height: measured.height,
  };
}

function renderTextSelectionAffordance(bounds: Bounds): SVGRectElement {
  const rectangle = renderBoundsRectangle(bounds, SELECTION_TEXT_PADDING);
  rectangle.classList.add('selection-affordance');
  rectangle.setAttribute('fill', 'none');
  rectangle.setAttribute('stroke', SELECTION_COLOR);
  rectangle.setAttribute('stroke-width', '1');
  rectangle.setAttribute('stroke-dasharray', '4 3');
  return rectangle;
}

function renderLabelHitTarget(
  bounds: Bounds,
  annotationId: AnnotationId,
  selectionTargetId: SelectionTargetId,
): SVGRectElement {
  const rectangle = renderBoundsRectangle(bounds, SELECTION_HIT_PADDING);
  applyFilledHitTargetAttributes(rectangle, annotationId, selectionTargetId);
  return rectangle;
}

function renderTextBoxGuide(
  item: PreviewOverlayItem,
  annotation: TextBoxPreviewAnnotation | TextPreviewAnnotation,
  height: number,
): SVGRectElement {
  const guide = document.createElementNS(SVG_NAMESPACE, 'rect');
  applyRootAttributes(guide, item);
  guide.classList.add('text-box-guide');
  guide.setAttribute('x', String(annotation.x));
  guide.setAttribute('y', String(annotation.y));
  guide.setAttribute('width', String(annotation.width));
  guide.setAttribute('height', String(height));
  guide.setAttribute('fill', 'none');
  guide.setAttribute('stroke', annotation.color);
  guide.setAttribute('stroke-width', '1');
  guide.setAttribute('stroke-dasharray', '4 3');
  guide.setAttribute('opacity', '0.65');
  return guide;
}

function renderTextSelectionHitTarget(
  bounds: TextLineBounds,
  annotation: TextAnnotation,
): SVGRectElement {
  const rectangle = renderBoundsRectangle(bounds, 0);
  applyFilledHitTargetAttributes(
    rectangle,
    annotation.id,
    annotation.selectionTargetId,
  );
  rectangle.classList.add('text-selection-hit-target');
  return rectangle;
}

function renderTextEraserHitTarget(
  bounds: TextLineBounds,
  annotationId: AnnotationId,
): SVGRectElement {
  const rectangle = renderBoundsRectangle(bounds, 0);
  rectangle.classList.add('text-eraser-hit-target');
  rectangle.dataset.annotationId = annotationId;
  rectangle.setAttribute('fill', 'transparent');
  rectangle.setAttribute('stroke', 'none');
  return rectangle;
}

function appendTextAnnotation(
  root: SVGSVGElement,
  item: AnnotationOverlayItem,
  annotation: TextAnnotation | LabelAnnotation,
  textMetrics: TextMetricsAdapter,
): void {
  if (annotation.kind === 'text') {
    const rendered = renderText(item, annotation, textMetrics);
    root.append(rendered.element);
    const selectionBounds = textSelectionBounds(rendered.layout);
    if (item.selectionAffordance === 'selected') {
      root.insertBefore(
        renderTextSelectionAffordance(selectionBounds),
        rendered.element,
      );
    }
    if (item.phase === 'committed') {
      root.append(
        renderTextSelectionHitTarget(selectionBounds, annotation),
        ...textEraserBounds(rendered.layout).map((bounds) =>
          renderTextEraserHitTarget(bounds, annotation.id),
        ),
      );
    }
    return;
  }

  const [text, selectorText, locText] = renderLabel(item, annotation);
  root.append(text);
  insertLabelBackground(
    root,
    selectorText,
    text,
    item.phase,
    'selector',
    item.opacity,
  );
  if (locText !== null) {
    insertLabelBackground(
      root,
      locText,
      text,
      item.phase,
      'svelte-loc',
      item.opacity,
    );
  }
  const bounds = measuredLabelBounds(text);
  if (item.selectionAffordance === 'selected') {
    root.insertBefore(renderTextSelectionAffordance(bounds), text);
  }
  root.append(
    renderLabelHitTarget(bounds, annotation.id, annotation.selectionTargetId),
  );
}

function rulerLabelWidth(axis: 'w' | 'h', value: number): number {
  const label = `(${axis}) ${String(Math.round(value))}px`;
  return label.length * RULER_LABEL_CHARACTER_WIDTH + RULER_LABEL_PADDING_X * 2;
}

function renderRulerLabel(
  measurement: RulerMeasurement,
  axis: 'w' | 'h',
  value: number,
  x: number,
  y: number,
): SVGGElement {
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  group.classList.add('ruler-label');
  group.dataset.measurement = measurement;

  const background = document.createElementNS(SVG_NAMESPACE, 'rect');
  background.classList.add('ruler-label-background');
  background.setAttribute('x', String(x));
  background.setAttribute('y', String(y));
  background.setAttribute('width', String(rulerLabelWidth(axis, value)));
  background.setAttribute('height', String(RULER_LABEL_HEIGHT));
  background.setAttribute('fill', '#ffffff');
  background.setAttribute('stroke', '#ced4da');
  background.setAttribute('stroke-width', '1');

  const text = document.createElementNS(SVG_NAMESPACE, 'text');
  text.classList.add('ruler-label-text');
  text.setAttribute('x', String(x + RULER_LABEL_PADDING_X));
  text.setAttribute('y', String(y + RULER_LABEL_HEIGHT / 2));
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-family', 'ui-monospace, monospace');
  text.setAttribute('font-size', '12');

  const axisText = document.createElementNS(SVG_NAMESPACE, 'tspan');
  axisText.setAttribute('fill', '#495057');
  axisText.setAttribute('font-weight', '700');
  axisText.textContent = `(${axis})`;

  const valueText = document.createElementNS(SVG_NAMESPACE, 'tspan');
  valueText.setAttribute('fill', '#212529');
  valueText.textContent = ` ${String(Math.round(value))}px`;

  text.append(axisText, valueText);
  group.append(background, text);
  return group;
}

function renderRulerVisual(geometry: RulerGeometry): readonly SVGElement[] {
  const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
  rectangle.classList.add('ruler-rectangle');
  rectangle.setAttribute('x', String(geometry.x));
  rectangle.setAttribute('y', String(geometry.y));
  rectangle.setAttribute('width', String(geometry.w));
  rectangle.setAttribute('height', String(geometry.h));
  rectangle.setAttribute('fill', RULER_FILL_COLOR);
  rectangle.setAttribute('fill-opacity', '0.16');
  rectangle.setAttribute('stroke', RULER_STROKE_COLOR);
  rectangle.setAttribute('stroke-width', '1');

  const widthLabelWidth = rulerLabelWidth('w', geometry.w);
  const heightLabelWidth = rulerLabelWidth('h', geometry.h);
  const top =
    geometry.y >= RULER_LABEL_HEIGHT + RULER_LABEL_GAP
      ? geometry.y - RULER_LABEL_HEIGHT - RULER_LABEL_GAP
      : geometry.y + RULER_LABEL_GAP;
  const left =
    geometry.x >= heightLabelWidth + RULER_LABEL_GAP
      ? geometry.x - heightLabelWidth - RULER_LABEL_GAP
      : geometry.x + RULER_LABEL_GAP;

  return [
    rectangle,
    renderRulerLabel(
      'width',
      'w',
      geometry.w,
      geometry.x + geometry.w / 2 - widthLabelWidth / 2,
      top,
    ),
    renderRulerLabel(
      'height',
      'h',
      geometry.h,
      left,
      geometry.y + geometry.h / 2 - RULER_LABEL_HEIGHT / 2,
    ),
  ];
}

function fontLabelText(annotation: FontAnnotation): string {
  return `${annotation.fontSize} · ${annotation.fontFamily}`;
}

function renderFontAnnotation(
  item: AnnotationOverlayItem,
  annotation: FontAnnotation,
): readonly SVGElement[] {
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  applyRootAttributes(group, item);
  group.dataset.fontSize = annotation.fontSize;
  group.dataset.fontFamily = annotation.fontFamily;

  const outline = document.createElementNS(SVG_NAMESPACE, 'rect');
  outline.classList.add('font-annotation-outline');
  outline.setAttribute('x', String(annotation.x));
  outline.setAttribute('y', String(annotation.y));
  outline.setAttribute('width', String(annotation.w));
  outline.setAttribute('height', String(annotation.h));
  outline.setAttribute('fill', FONT_LABEL_BACKGROUND);
  outline.setAttribute('fill-opacity', '0.05');
  outline.setAttribute('stroke', FONT_LABEL_BACKGROUND);
  outline.setAttribute('stroke-width', '2');

  const value = fontLabelText(annotation);
  const labelWidth = Math.max(
    96,
    value.length * FONT_LABEL_CHARACTER_WIDTH + FONT_LABEL_PADDING_X * 2,
  );
  const labelY =
    annotation.y >= FONT_LABEL_HEIGHT + FONT_LABEL_GAP
      ? annotation.y - FONT_LABEL_HEIGHT - FONT_LABEL_GAP
      : annotation.y + annotation.h + FONT_LABEL_GAP;
  const background = document.createElementNS(SVG_NAMESPACE, 'rect');
  background.classList.add('font-label-background');
  background.setAttribute('x', String(annotation.x));
  background.setAttribute('y', String(labelY));
  background.setAttribute('width', String(labelWidth));
  background.setAttribute('height', String(FONT_LABEL_HEIGHT));
  background.setAttribute('rx', '4');
  background.setAttribute('fill', FONT_LABEL_BACKGROUND);

  const text = document.createElementNS(SVG_NAMESPACE, 'text');
  text.classList.add('font-label-text');
  text.setAttribute('x', String(annotation.x + FONT_LABEL_PADDING_X));
  text.setAttribute('y', String(labelY + FONT_LABEL_HEIGHT / 2));
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('fill', FONT_LABEL_TEXT);
  text.setAttribute('font-family', 'ui-monospace, monospace');
  text.setAttribute('font-size', '12');
  text.setAttribute('font-weight', '600');
  text.textContent = value;
  group.append(outline, background, text);

  const hitTarget = document.createElementNS(SVG_NAMESPACE, 'rect');
  hitTarget.setAttribute('x', String(annotation.x));
  hitTarget.setAttribute('y', String(annotation.y));
  hitTarget.setAttribute('width', String(annotation.w));
  hitTarget.setAttribute('height', String(annotation.h));
  applyFilledHitTargetAttributes(
    hitTarget,
    annotation.id,
    annotation.selectionTargetId,
  );
  if (item.selectionAffordance === 'none') {
    return [group, hitTarget];
  }
  const affordance = document.createElementNS(SVG_NAMESPACE, 'rect');
  affordance.setAttribute('x', String(annotation.x));
  affordance.setAttribute('y', String(annotation.y));
  affordance.setAttribute('width', String(annotation.w));
  affordance.setAttribute('height', String(annotation.h));
  applySelectionStrokeAttributes(affordance, 2);
  return [affordance, group, hitTarget];
}

function renderAnnotationItem(
  item: AnnotationOverlayItem,
): readonly SVGElement[] {
  switch (item.annotation.kind) {
    case 'rect': {
      const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
      applyRootAttributes(rectangle, item);
      rectangle.setAttribute('x', String(item.annotation.x));
      rectangle.setAttribute('y', String(item.annotation.y));
      rectangle.setAttribute('width', String(item.annotation.w));
      rectangle.setAttribute('height', String(item.annotation.h));
      applyShapeFill(
        rectangle,
        item.annotation.fillStyle,
        item.annotation.color,
      );
      rectangle.setAttribute('stroke', item.annotation.color);
      rectangle.setAttribute(
        'stroke-width',
        String(item.annotation.strokeWidth),
      );
      rectangle.setAttribute('stroke-linejoin', 'round');
      applyStrokePattern(
        rectangle,
        item.annotation.strokeStyle,
        item.annotation.strokeWidth,
      );

      const hitTarget = document.createElementNS(SVG_NAMESPACE, 'rect');
      hitTarget.setAttribute('x', String(item.annotation.x));
      hitTarget.setAttribute('y', String(item.annotation.y));
      hitTarget.setAttribute('width', String(item.annotation.w));
      hitTarget.setAttribute('height', String(item.annotation.h));
      applyStrokeHitTargetAttributes(
        hitTarget,
        item.annotation.id,
        item.annotation.selectionTargetId,
        item.annotation.strokeWidth,
      );
      const hitTargets = [hitTarget];
      if (item.annotation.fillStyle === 'solid') {
        const fillHitTarget = document.createElementNS(SVG_NAMESPACE, 'rect');
        fillHitTarget.setAttribute('x', String(item.annotation.x));
        fillHitTarget.setAttribute('y', String(item.annotation.y));
        fillHitTarget.setAttribute('width', String(item.annotation.w));
        fillHitTarget.setAttribute('height', String(item.annotation.h));
        applyFilledHitTargetAttributes(
          fillHitTarget,
          item.annotation.id,
          item.annotation.selectionTargetId,
        );
        hitTargets.push(fillHitTarget);
      }

      if (item.selectionAffordance === 'none') {
        return [rectangle, ...hitTargets];
      }
      const affordance = document.createElementNS(SVG_NAMESPACE, 'rect');
      affordance.setAttribute('x', String(item.annotation.x));
      affordance.setAttribute('y', String(item.annotation.y));
      affordance.setAttribute('width', String(item.annotation.w));
      affordance.setAttribute('height', String(item.annotation.h));
      applySelectionStrokeAttributes(affordance, item.annotation.strokeWidth);
      return [affordance, rectangle, ...hitTargets];
    }
    case 'ruler': {
      const group = document.createElementNS(SVG_NAMESPACE, 'g');
      applyRootAttributes(group, item);
      group.append(...renderRulerVisual(item.annotation));

      const hitTarget = document.createElementNS(SVG_NAMESPACE, 'rect');
      hitTarget.setAttribute('x', String(item.annotation.x));
      hitTarget.setAttribute('y', String(item.annotation.y));
      hitTarget.setAttribute('width', String(item.annotation.w));
      hitTarget.setAttribute('height', String(item.annotation.h));
      applyFilledHitTargetAttributes(
        hitTarget,
        item.annotation.id,
        item.annotation.selectionTargetId,
      );

      if (item.selectionAffordance === 'none') {
        return [group, hitTarget];
      }
      const affordance = document.createElementNS(SVG_NAMESPACE, 'rect');
      affordance.setAttribute('x', String(item.annotation.x));
      affordance.setAttribute('y', String(item.annotation.y));
      affordance.setAttribute('width', String(item.annotation.w));
      affordance.setAttribute('height', String(item.annotation.h));
      applySelectionStrokeAttributes(affordance, 2);
      return [affordance, group, hitTarget];
    }
    case 'font':
      return renderFontAnnotation(item, item.annotation);
    case 'ellipse': {
      const ellipse = document.createElementNS(SVG_NAMESPACE, 'ellipse');
      applyRootAttributes(ellipse, item);
      ellipse.setAttribute('cx', String(item.annotation.cx));
      ellipse.setAttribute('cy', String(item.annotation.cy));
      ellipse.setAttribute('rx', String(item.annotation.rx));
      ellipse.setAttribute('ry', String(item.annotation.ry));
      applyShapeFill(ellipse, item.annotation.fillStyle, item.annotation.color);
      ellipse.setAttribute('stroke', item.annotation.color);
      ellipse.setAttribute('stroke-width', String(item.annotation.strokeWidth));
      applyStrokePattern(
        ellipse,
        item.annotation.strokeStyle,
        item.annotation.strokeWidth,
      );

      const hitTarget = document.createElementNS(SVG_NAMESPACE, 'ellipse');
      hitTarget.setAttribute('cx', String(item.annotation.cx));
      hitTarget.setAttribute('cy', String(item.annotation.cy));
      hitTarget.setAttribute('rx', String(item.annotation.rx));
      hitTarget.setAttribute('ry', String(item.annotation.ry));
      applyStrokeHitTargetAttributes(
        hitTarget,
        item.annotation.id,
        item.annotation.selectionTargetId,
        item.annotation.strokeWidth,
      );
      const hitTargets = [hitTarget];
      if (item.annotation.fillStyle === 'solid') {
        const fillHitTarget = document.createElementNS(
          SVG_NAMESPACE,
          'ellipse',
        );
        fillHitTarget.setAttribute('cx', String(item.annotation.cx));
        fillHitTarget.setAttribute('cy', String(item.annotation.cy));
        fillHitTarget.setAttribute('rx', String(item.annotation.rx));
        fillHitTarget.setAttribute('ry', String(item.annotation.ry));
        applyFilledHitTargetAttributes(
          fillHitTarget,
          item.annotation.id,
          item.annotation.selectionTargetId,
        );
        hitTargets.push(fillHitTarget);
      }

      if (item.selectionAffordance === 'none') {
        return [ellipse, ...hitTargets];
      }
      const affordance = document.createElementNS(SVG_NAMESPACE, 'ellipse');
      affordance.setAttribute('cx', String(item.annotation.cx));
      affordance.setAttribute('cy', String(item.annotation.cy));
      affordance.setAttribute('rx', String(item.annotation.rx));
      affordance.setAttribute('ry', String(item.annotation.ry));
      applySelectionStrokeAttributes(affordance, item.annotation.strokeWidth);
      return [affordance, ellipse, ...hitTargets];
    }
    case 'arrow': {
      const group = document.createElementNS(SVG_NAMESPACE, 'g');
      applyRootAttributes(group, item);
      const shaft = document.createElementNS(SVG_NAMESPACE, 'line');
      shaft.classList.add('arrow-shaft');
      shaft.setAttribute('x1', String(item.annotation.x1));
      shaft.setAttribute('y1', String(item.annotation.y1));
      shaft.setAttribute('x2', String(item.annotation.x2));
      shaft.setAttribute('y2', String(item.annotation.y2));
      shaft.setAttribute('stroke', item.annotation.color);
      shaft.setAttribute('stroke-width', String(item.annotation.strokeWidth));
      applyStrokePattern(
        shaft,
        item.annotation.strokeStyle,
        item.annotation.strokeWidth,
      );
      const head = arrowHeadGeometry(
        { x: item.annotation.x1, y: item.annotation.y1 },
        { x: item.annotation.x2, y: item.annotation.y2 },
        item.annotation.strokeWidth,
      );
      const polygon = document.createElementNS(SVG_NAMESPACE, 'polygon');
      polygon.classList.add('arrow-head');
      polygon.setAttribute(
        'points',
        pointList([head.tip, head.left, head.right]),
      );
      polygon.setAttribute('fill', item.annotation.color);
      group.append(shaft, polygon);

      const shaftHitTarget = document.createElementNS(SVG_NAMESPACE, 'line');
      shaftHitTarget.setAttribute('x1', String(item.annotation.x1));
      shaftHitTarget.setAttribute('y1', String(item.annotation.y1));
      shaftHitTarget.setAttribute('x2', String(item.annotation.x2));
      shaftHitTarget.setAttribute('y2', String(item.annotation.y2));
      applyStrokeHitTargetAttributes(
        shaftHitTarget,
        item.annotation.id,
        item.annotation.selectionTargetId,
        item.annotation.strokeWidth,
      );
      const headHitTarget = document.createElementNS(SVG_NAMESPACE, 'polygon');
      headHitTarget.setAttribute(
        'points',
        pointList([head.tip, head.left, head.right]),
      );
      applyFilledHitTargetAttributes(
        headHitTarget,
        item.annotation.id,
        item.annotation.selectionTargetId,
      );

      if (item.selectionAffordance === 'none') {
        return [group, shaftHitTarget, headHitTarget];
      }
      const affordance = document.createElementNS(SVG_NAMESPACE, 'g');
      affordance.classList.add('selection-affordance');
      affordance.setAttribute('opacity', String(SELECTION_OPACITY));
      const affordanceShaft = document.createElementNS(SVG_NAMESPACE, 'line');
      affordanceShaft.setAttribute('x1', String(item.annotation.x1));
      affordanceShaft.setAttribute('y1', String(item.annotation.y1));
      affordanceShaft.setAttribute('x2', String(item.annotation.x2));
      affordanceShaft.setAttribute('y2', String(item.annotation.y2));
      applySelectionStrokeAttributes(
        affordanceShaft,
        item.annotation.strokeWidth,
      );
      affordanceShaft.removeAttribute('opacity');
      const affordanceHead = document.createElementNS(SVG_NAMESPACE, 'polygon');
      affordanceHead.setAttribute(
        'points',
        pointList([head.tip, head.left, head.right]),
      );
      affordanceHead.setAttribute('fill', SELECTION_COLOR);
      affordanceHead.setAttribute('stroke', SELECTION_COLOR);
      affordanceHead.setAttribute('stroke-linejoin', 'round');
      affordanceHead.setAttribute(
        'stroke-width',
        String(Math.max(8, item.annotation.strokeWidth + 6)),
      );
      affordance.append(affordanceShaft, affordanceHead);
      return [affordance, group, shaftHitTarget, headHitTarget];
    }
    case 'pen': {
      const polyline = document.createElementNS(SVG_NAMESPACE, 'polyline');
      applyRootAttributes(polyline, item);
      polyline.setAttribute('points', pointList(item.annotation.points));
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', item.annotation.color);
      polyline.setAttribute(
        'stroke-width',
        String(item.annotation.strokeWidth),
      );
      polyline.setAttribute('stroke-linejoin', 'round');
      applyStrokePattern(
        polyline,
        item.annotation.strokeStyle,
        item.annotation.strokeWidth,
      );

      const hitTarget = document.createElementNS(SVG_NAMESPACE, 'polyline');
      hitTarget.setAttribute('points', pointList(item.annotation.points));
      applyStrokeHitTargetAttributes(
        hitTarget,
        item.annotation.id,
        item.annotation.selectionTargetId,
        item.annotation.strokeWidth,
      );

      if (item.selectionAffordance === 'none') {
        return [polyline, hitTarget];
      }
      const affordance = document.createElementNS(SVG_NAMESPACE, 'polyline');
      affordance.setAttribute('points', pointList(item.annotation.points));
      applySelectionStrokeAttributes(affordance, item.annotation.strokeWidth);
      return [affordance, polyline, hitTarget];
    }
    case 'color-sample': {
      const { annotation } = item;
      const contrast = contrastingColor(annotation.sampledColor);
      const group = document.createElementNS(SVG_NAMESPACE, 'g');
      applyRootAttributes(group, item);
      group.dataset.sampledColor = annotation.sampledColor;

      const halo = document.createElementNS(SVG_NAMESPACE, 'circle');
      halo.classList.add('color-sample-halo');
      halo.setAttribute('cx', String(annotation.x));
      halo.setAttribute('cy', String(annotation.y));
      halo.setAttribute('r', String(COLOR_SAMPLE_RADIUS));
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', contrast);
      halo.setAttribute('stroke-width', String(annotation.strokeWidth + 2));

      const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
      circle.classList.add('color-sample-circle');
      circle.setAttribute('cx', String(annotation.x));
      circle.setAttribute('cy', String(annotation.y));
      circle.setAttribute('r', String(COLOR_SAMPLE_RADIUS));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', annotation.sampledColor);
      circle.setAttribute('stroke-width', String(annotation.strokeWidth));
      applyStrokePattern(
        circle,
        annotation.strokeStyle,
        annotation.strokeWidth,
      );

      const labelX = annotation.x + COLOR_SAMPLE_LABEL_OFFSET;
      const labelY = annotation.y - COLOR_SAMPLE_LABEL_HEIGHT / 2;
      const background = document.createElementNS(SVG_NAMESPACE, 'rect');
      background.classList.add('color-sample-label-background');
      background.setAttribute('x', String(labelX));
      background.setAttribute('y', String(labelY));
      background.setAttribute('width', String(COLOR_SAMPLE_LABEL_WIDTH));
      background.setAttribute('height', String(COLOR_SAMPLE_LABEL_HEIGHT));
      background.setAttribute('rx', '4');
      background.setAttribute('fill', annotation.sampledColor);
      background.setAttribute('stroke', contrast);
      background.setAttribute('stroke-width', '1');

      const text = document.createElementNS(SVG_NAMESPACE, 'text');
      text.classList.add('color-sample-label');
      text.setAttribute('x', String(labelX + 5));
      text.setAttribute('y', String(annotation.y));
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', contrast);
      text.setAttribute('font-family', 'ui-monospace, monospace');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '700');
      text.textContent = annotation.sampledColor;
      group.append(halo, circle, background, text);

      const hitTarget = document.createElementNS(SVG_NAMESPACE, 'rect');
      hitTarget.setAttribute('x', String(annotation.x - 12));
      hitTarget.setAttribute('y', String(annotation.y - 12));
      hitTarget.setAttribute(
        'width',
        String(COLOR_SAMPLE_LABEL_OFFSET + COLOR_SAMPLE_LABEL_WIDTH + 12),
      );
      hitTarget.setAttribute('height', '24');
      hitTarget.setAttribute('rx', '6');
      applyFilledHitTargetAttributes(
        hitTarget,
        annotation.id,
        annotation.selectionTargetId,
      );

      if (item.selectionAffordance === 'none') {
        return [group, hitTarget];
      }
      const affordance = document.createElementNS(SVG_NAMESPACE, 'rect');
      affordance.setAttribute('x', String(annotation.x - 12));
      affordance.setAttribute('y', String(annotation.y - 12));
      affordance.setAttribute(
        'width',
        String(COLOR_SAMPLE_LABEL_OFFSET + COLOR_SAMPLE_LABEL_WIDTH + 12),
      );
      affordance.setAttribute('height', '24');
      affordance.setAttribute('rx', '6');
      applySelectionStrokeAttributes(affordance, annotation.strokeWidth);
      return [affordance, group, hitTarget];
    }
    case 'text':
    case 'label':
      return [];
  }
}

function renderPreviewItem(
  item: PreviewOverlayItem,
  textMetrics: TextMetricsAdapter,
): readonly SVGElement[] {
  switch (item.annotation.kind) {
    case 'rect-preview': {
      const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
      applyRootAttributes(rectangle, item);
      rectangle.setAttribute('x', String(item.annotation.x));
      rectangle.setAttribute('y', String(item.annotation.y));
      rectangle.setAttribute('width', String(item.annotation.w));
      rectangle.setAttribute('height', String(item.annotation.h));
      applyShapeFill(
        rectangle,
        item.annotation.fillStyle,
        item.annotation.color,
      );
      rectangle.setAttribute('stroke', item.annotation.color);
      rectangle.setAttribute(
        'stroke-width',
        String(item.annotation.strokeWidth),
      );
      rectangle.setAttribute('stroke-linejoin', 'round');
      applyStrokePattern(
        rectangle,
        item.annotation.strokeStyle,
        item.annotation.strokeWidth,
      );
      return [rectangle];
    }
    case 'ruler-preview': {
      const group = document.createElementNS(SVG_NAMESPACE, 'g');
      applyRootAttributes(group, item);
      group.append(...renderRulerVisual(item.annotation));
      return [group];
    }
    case 'ellipse-preview': {
      const ellipse = document.createElementNS(SVG_NAMESPACE, 'ellipse');
      applyRootAttributes(ellipse, item);
      ellipse.setAttribute('cx', String(item.annotation.cx));
      ellipse.setAttribute('cy', String(item.annotation.cy));
      ellipse.setAttribute('rx', String(item.annotation.rx));
      ellipse.setAttribute('ry', String(item.annotation.ry));
      applyShapeFill(ellipse, item.annotation.fillStyle, item.annotation.color);
      ellipse.setAttribute('stroke', item.annotation.color);
      ellipse.setAttribute('stroke-width', String(item.annotation.strokeWidth));
      applyStrokePattern(
        ellipse,
        item.annotation.strokeStyle,
        item.annotation.strokeWidth,
      );
      return [ellipse];
    }
    case 'arrow-preview': {
      const group = document.createElementNS(SVG_NAMESPACE, 'g');
      applyRootAttributes(group, item);
      const shaft = document.createElementNS(SVG_NAMESPACE, 'line');
      shaft.classList.add('arrow-shaft');
      shaft.setAttribute('x1', String(item.annotation.x1));
      shaft.setAttribute('y1', String(item.annotation.y1));
      shaft.setAttribute('x2', String(item.annotation.x2));
      shaft.setAttribute('y2', String(item.annotation.y2));
      shaft.setAttribute('stroke', item.annotation.color);
      shaft.setAttribute('stroke-width', String(item.annotation.strokeWidth));
      applyStrokePattern(
        shaft,
        item.annotation.strokeStyle,
        item.annotation.strokeWidth,
      );
      const head = arrowHeadGeometry(
        { x: item.annotation.x1, y: item.annotation.y1 },
        { x: item.annotation.x2, y: item.annotation.y2 },
        item.annotation.strokeWidth,
      );
      const polygon = document.createElementNS(SVG_NAMESPACE, 'polygon');
      polygon.classList.add('arrow-head');
      polygon.setAttribute(
        'points',
        pointList([head.tip, head.left, head.right]),
      );
      polygon.setAttribute('fill', item.annotation.color);
      group.append(shaft, polygon);
      return [group];
    }
    case 'pen-preview': {
      const polyline = document.createElementNS(SVG_NAMESPACE, 'polyline');
      applyRootAttributes(polyline, item);
      polyline.setAttribute('points', pointList(item.annotation.points));
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', item.annotation.color);
      polyline.setAttribute(
        'stroke-width',
        String(item.annotation.strokeWidth),
      );
      polyline.setAttribute('stroke-linejoin', 'round');
      applyStrokePattern(
        polyline,
        item.annotation.strokeStyle,
        item.annotation.strokeWidth,
      );
      return [polyline];
    }
    case 'text-box-preview':
      return [
        renderTextBoxGuide(item, item.annotation, item.annotation.height),
      ];
    case 'text-preview': {
      const rendered = renderText(item, item.annotation, textMetrics);
      return [
        renderTextBoxGuide(
          item,
          item.annotation,
          rendered.layout.displayHeight,
        ),
        rendered.element,
      ];
    }
  }
}

function appendPickerHighlight(
  root: SVGSVGElement,
  item: PickerHighlightOverlayItem,
): void {
  const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
  rectangle.classList.add('picker-highlight');
  rectangle.dataset.phase = 'picker-highlight';
  rectangle.dataset.kind = 'picker-highlight';
  rectangle.setAttribute('x', String(item.target.x));
  rectangle.setAttribute('y', String(item.target.y));
  rectangle.setAttribute('width', String(item.target.w));
  rectangle.setAttribute('height', String(item.target.h));
  rectangle.setAttribute('fill', item.color);
  rectangle.setAttribute('fill-opacity', '0.08');
  rectangle.setAttribute('stroke', item.color);
  rectangle.setAttribute('stroke-width', String(item.strokeWidth));
  applyStrokePattern(rectangle, item.strokeStyle, item.strokeWidth);
  root.append(rectangle);
  if (item.target.svelteLoc === undefined) {
    return;
  }
  const locText = renderSvelteLocText(
    item.target.x,
    item.target.y,
    item.target.svelteLoc,
  );
  locText.classList.add('picker-highlight-loc');
  locText.dataset.phase = 'picker-highlight';
  root.append(locText);
  insertLabelBackground(
    root,
    locText,
    locText,
    'picker-highlight',
    'svelte-loc',
    1,
  );
}

function appendFontHighlight(
  root: SVGSVGElement,
  item: FontHighlightOverlayItem,
): void {
  const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
  rectangle.classList.add('font-highlight');
  rectangle.dataset.phase = 'font-highlight';
  rectangle.dataset.kind = 'font-highlight';
  rectangle.setAttribute('x', String(item.target.x));
  rectangle.setAttribute('y', String(item.target.y));
  rectangle.setAttribute('width', String(item.target.w));
  rectangle.setAttribute('height', String(item.target.h));
  rectangle.setAttribute('fill', FONT_LABEL_BACKGROUND);
  rectangle.setAttribute('fill-opacity', '0.05');
  rectangle.setAttribute('stroke', FONT_LABEL_BACKGROUND);
  rectangle.setAttribute('stroke-width', '2');
  root.append(rectangle);
}

function applyChromeVisibility(
  element: SVGSVGElement,
  visibility: SquawkChromeVisibility,
): void {
  for (const chrome of element.querySelectorAll(
    '.text-box-guide, .selection-affordance, .annotation-hit-target, .text-eraser-hit-target',
  )) {
    chrome.toggleAttribute('hidden', visibility === 'hidden-for-capture');
  }
}

export function createOverlay(
  textMetrics: TextMetricsAdapter,
  signal: AbortSignal,
): OverlayView {
  const element = document.createElementNS(SVG_NAMESPACE, 'svg');
  element.classList.add('overlay');
  let chromeVisibility: SquawkChromeVisibility = 'visible';

  const synchronizeBounds = (): void => {
    const documentElement = document.documentElement;
    const width = Math.max(
      documentElement.scrollWidth,
      documentElement.clientWidth,
    );
    const height = Math.max(
      documentElement.scrollHeight,
      documentElement.clientHeight,
    );

    element.setAttribute('width', String(width));
    element.setAttribute('height', String(height));
    element.setAttribute(
      'viewBox',
      ['0', '0', String(width), String(height)].join(' '),
    );
  };

  synchronizeBounds();
  window.addEventListener('resize', synchronizeBounds, { signal });

  const resizeObserver = new ResizeObserver(synchronizeBounds);
  resizeObserver.observe(document.documentElement);

  if (signal.aborted) {
    resizeObserver.disconnect();
  } else {
    signal.addEventListener(
      'abort',
      () => {
        resizeObserver.disconnect();
      },
      { once: true },
    );
  }

  const render = (state: SessionState): void => {
    const tool = activeTool(state);
    element.style.cursor = overlayCursor(state);
    element.dataset.pointerRouting =
      state.tool.kind === 'select-dragging'
        ? 'dragging'
        : tool === 'interact'
          ? 'transparent'
          : tool === 'eraser'
            ? 'erasing'
            : tool === 'picker' || tool === 'font'
              ? 'picking'
              : tool === 'select'
                ? 'selecting'
                : 'drawing';
    element.replaceChildren();
    for (const item of overlayItems(state)) {
      switch (item.phase) {
        case 'committed':
        case 'move-preview':
          if (
            item.annotation.kind === 'text' ||
            item.annotation.kind === 'label'
          ) {
            appendTextAnnotation(element, item, item.annotation, textMetrics);
          } else {
            element.append(...renderAnnotationItem(item));
          }
          break;
        case 'preview':
          element.append(...renderPreviewItem(item, textMetrics));
          break;
        case 'picker-highlight':
          appendPickerHighlight(element, item);
          break;
        case 'font-highlight':
          appendFontHighlight(element, item);
          break;
      }
    }
    applyChromeVisibility(element, chromeVisibility);
  };

  const setChromeVisibility = (visibility: SquawkChromeVisibility): void => {
    chromeVisibility = visibility;
    applyChromeVisibility(element, visibility);
  };

  return { element, render, setChromeVisibility };
}
