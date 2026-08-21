import { DocumentDeltaSchema } from './model';
import type {
  Annotation,
  ArrowHeadGeometry,
  CssPixels,
  DocumentDelta,
  DocumentPoint,
  DerivedTextLayout,
  DrawingConstraint,
  EllipseGeometry,
  PenFinalizationOutcome,
  RectGeometry,
  ScrollOffset,
  StrokeWidth,
  TextAnnotation,
  TextBoxDraftGeometry,
  TextBoxValidationOutcome,
  TextEditingDraft,
  TextEditValue,
  TextLineBounds,
  TextPreview,
  TextSize,
  ViewportPoint,
  ViewportRect,
} from './model';

export function documentDelta(
  origin: DocumentPoint,
  current: DocumentPoint,
): DocumentDelta {
  return DocumentDeltaSchema.parse({
    x: current.x - origin.x,
    y: current.y - origin.y,
  });
}

export function translateAnnotation(
  annotation: Annotation,
  delta: DocumentDelta,
): Annotation {
  switch (annotation.kind) {
    case 'rect':
      return {
        ...annotation,
        x: annotation.x + delta.x,
        y: annotation.y + delta.y,
      };
    case 'ellipse':
      return {
        ...annotation,
        cx: annotation.cx + delta.x,
        cy: annotation.cy + delta.y,
      };
    case 'arrow':
      return {
        ...annotation,
        x1: annotation.x1 + delta.x,
        y1: annotation.y1 + delta.y,
        x2: annotation.x2 + delta.x,
        y2: annotation.y2 + delta.y,
      };
    case 'pen':
      return {
        ...annotation,
        points: annotation.points.map((point) => ({
          x: point.x + delta.x,
          y: point.y + delta.y,
        })),
      };
    case 'text':
    case 'label':
    case 'color-sample':
      return {
        ...annotation,
        x: annotation.x + delta.x,
        y: annotation.y + delta.y,
      };
  }
}

export function documentPointFromViewport(
  point: ViewportPoint,
  scroll: ScrollOffset,
): DocumentPoint {
  return {
    x: point.x + scroll.x,
    y: point.y + scroll.y,
  };
}

export function documentRectFromViewport(
  rect: ViewportRect,
  scroll: ScrollOffset,
): RectGeometry {
  return {
    x: rect.x + scroll.x,
    y: rect.y + scroll.y,
    w: rect.w,
    h: rect.h,
  };
}

export type MeasureTextWidth = (
  text: TextEditValue,
  size: TextSize,
) => CssPixels;

const textSegmenter = new Intl.Segmenter('und', {
  granularity: 'grapheme',
});
const whitespace = /^\p{White_Space}+$/u;

function isHorizontalWhitespace(grapheme: TextEditValue): boolean {
  const codePoint = grapheme.codePointAt(0);
  return (
    whitespace.test(grapheme) &&
    grapheme !== '\n' &&
    grapheme !== '\r' &&
    codePoint !== 0x2028 &&
    codePoint !== 0x2029
  );
}

function textLineHeight(size: TextSize): 16.8 | 21.6 | 28.8 {
  switch (size) {
    case 14:
      return 16.8;
    case 18:
      return 21.6;
    case 24:
      return 28.8;
  }
}

function segmentGraphemes(text: TextEditValue): readonly TextEditValue[] {
  return [...textSegmenter.segment(text)].map(({ segment }) => segment);
}

function wrapHardLine(
  hardLine: TextEditValue,
  width: CssPixels,
  size: TextSize,
  measureWidth: MeasureTextWidth,
): readonly TextEditValue[] {
  const graphemes = segmentGraphemes(hardLine);
  if (graphemes.length === 0) {
    return [''];
  }

  const lines: TextEditValue[] = [];
  let offset = 0;
  while (offset < graphemes.length) {
    let fittingLength = 0;
    for (let length = 1; offset + length <= graphemes.length; length += 1) {
      const candidate = graphemes.slice(offset, offset + length).join('');
      if (measureWidth(candidate, size) > width) {
        break;
      }
      fittingLength = length;
    }

    if (fittingLength === 0) {
      fittingLength = 1;
    }

    const reachesEnd = offset + fittingLength === graphemes.length;
    let lineLength = fittingLength;
    if (!reachesEnd) {
      for (let index = 0; index < fittingLength; index += 1) {
        const grapheme = graphemes[offset + index];
        if (grapheme !== undefined && isHorizontalWhitespace(grapheme)) {
          lineLength = index + 1;
        }
      }
    }

    lines.push(graphemes.slice(offset, offset + lineLength).join(''));
    offset += lineLength;
  }
  return lines;
}

export function normalizeTextBoxDrag(
  origin: DocumentPoint,
  current: DocumentPoint,
): TextBoxDraftGeometry {
  return {
    x: Math.min(origin.x, current.x),
    y: Math.min(origin.y, current.y),
    width: Math.abs(current.x - origin.x),
    height: Math.abs(current.y - origin.y),
  };
}

export function validateTextBoxGeometry(
  draft: TextBoxDraftGeometry,
  size: TextSize,
): TextBoxValidationOutcome {
  if (draft.width < size || draft.height <= 0) {
    return { kind: 'discard' };
  }
  return {
    kind: 'valid',
    geometry: {
      x: draft.x,
      y: draft.y,
      width: draft.width,
      minimumHeight: draft.height,
    },
  };
}

export function deriveTextLayout(
  draft: TextEditingDraft | TextAnnotation | TextPreview,
  measureWidth: MeasureTextWidth,
): DerivedTextLayout {
  const lineHeight = textLineHeight(draft.size);
  const lines = draft.text
    .split('\n')
    .flatMap((hardLine) =>
      wrapHardLine(hardLine, draft.width, draft.size, measureWidth),
    );
  const lineBounds = lines.map((line, index) => ({
    x: draft.x,
    y: draft.y + index * lineHeight,
    width: measureWidth(line, draft.size),
    height: lineHeight,
  }));

  return {
    lines,
    lineHeight,
    displayWidth: draft.width,
    displayHeight: Math.max(draft.minimumHeight, lines.length * lineHeight),
    lineBounds,
  };
}

export function textSelectionBounds(layout: DerivedTextLayout): TextLineBounds {
  const firstLine = layout.lineBounds[0];
  if (firstLine === undefined) {
    return {
      x: 0,
      y: 0,
      width: layout.displayWidth,
      height: layout.displayHeight,
    };
  }
  return {
    x: firstLine.x,
    y: firstLine.y,
    width: layout.displayWidth,
    height: layout.displayHeight,
  };
}

export function textEraserBounds(
  layout: DerivedTextLayout,
): readonly TextLineBounds[] {
  const painted = layout.lineBounds.filter((_, index) => {
    const line = layout.lines[index];
    return line !== undefined && line.length > 0 && !whitespace.test(line);
  });
  if (painted.length > 0) {
    return painted;
  }

  const firstLine = layout.lineBounds[0];
  if (firstLine === undefined) {
    return [{ x: 0, y: 0, width: 12, height: layout.lineHeight }];
  }
  return [
    {
      x: firstLine.x,
      y: firstLine.y,
      width: 12,
      height: layout.lineHeight,
    },
  ];
}

export function rectGeometryFromDrag(
  origin: DocumentPoint,
  current: DocumentPoint,
  constraint: DrawingConstraint,
): RectGeometry {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;

  if (constraint === 'free') {
    return {
      x: Math.min(origin.x, current.x),
      y: Math.min(origin.y, current.y),
      w: Math.abs(dx),
      h: Math.abs(dy),
    };
  }

  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: dx < 0 ? origin.x - size : origin.x,
    y: dy < 0 ? origin.y - size : origin.y,
    w: size,
    h: size,
  };
}

export function ellipseGeometryFromDrag(
  origin: DocumentPoint,
  current: DocumentPoint,
  constraint: DrawingConstraint,
): EllipseGeometry {
  const bounds = rectGeometryFromDrag(origin, current, constraint);
  return {
    cx: bounds.x + bounds.w / 2,
    cy: bounds.y + bounds.h / 2,
    rx: bounds.w / 2,
    ry: bounds.h / 2,
  };
}

export function arrowHeadGeometry(
  start: DocumentPoint,
  end: DocumentPoint,
  strokeWidth: StrokeWidth,
): ArrowHeadGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { tip: end, left: end, right: end };
  }

  const headLength = Math.min(4 * strokeWidth, distance / 2);
  const halfWidth = headLength / 2;
  const unitX = dx / distance;
  const unitY = dy / distance;
  const baseCenter = {
    x: end.x - unitX * headLength,
    y: end.y - unitY * headLength,
  };
  const perpendicularX = -unitY;
  const perpendicularY = unitX;

  return {
    tip: end,
    left: {
      x: baseCenter.x + perpendicularX * halfWidth,
      y: baseCenter.y + perpendicularY * halfWidth,
    },
    right: {
      x: baseCenter.x - perpendicularX * halfWidth,
      y: baseCenter.y - perpendicularY * halfWidth,
    },
  };
}

function pointsEqual(left: DocumentPoint, right: DocumentPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function pointDistance(left: DocumentPoint, right: DocumentPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function simplifyPenPoints(
  points: readonly DocumentPoint[],
  minimumDistance: CssPixels,
): readonly DocumentPoint[] {
  const deduplicated: DocumentPoint[] = [];
  for (const point of points) {
    const previous = deduplicated.at(-1);
    if (previous === undefined || !pointsEqual(previous, point)) {
      deduplicated.push(point);
    }
  }
  if (deduplicated.length < 2) {
    return deduplicated;
  }

  const first = deduplicated[0];
  const final = deduplicated[deduplicated.length - 1];
  if (first === undefined || final === undefined) {
    return [];
  }

  const simplified: DocumentPoint[] = [first];
  for (const point of deduplicated.slice(1, -1)) {
    const lastKept = simplified[simplified.length - 1];
    if (
      lastKept !== undefined &&
      pointDistance(lastKept, point) >= minimumDistance
    ) {
      simplified.push(point);
    }
  }
  const lastKept = simplified[simplified.length - 1];
  if (lastKept === undefined || !pointsEqual(lastKept, final)) {
    simplified.push(final);
  }
  return simplified;
}

export function smoothPenPoints(
  points: readonly DocumentPoint[],
): readonly DocumentPoint[] {
  if (points.length < 3) {
    return [...points];
  }

  const first = points[0];
  const final = points[points.length - 1];
  if (first === undefined || final === undefined) {
    return [];
  }

  const smoothed: DocumentPoint[] = [first];
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (left !== undefined && right !== undefined) {
      smoothed.push({
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2,
      });
    }
  }
  smoothed.push(final);
  return smoothed;
}

export function finalizePenPoints(
  points: readonly DocumentPoint[],
  strokeWidth: StrokeWidth,
): PenFinalizationOutcome {
  const simplified = simplifyPenPoints(points, strokeWidth);
  if (simplified.length < 2) {
    return { kind: 'discard' };
  }
  if (simplified.length === 2) {
    return { kind: 'commit', points: simplified };
  }
  return { kind: 'commit', points: smoothPenPoints(simplified) };
}
