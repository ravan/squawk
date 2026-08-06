import { describe, expect, it } from 'vitest';

import {
  arrowHeadGeometry,
  documentDelta,
  documentPointFromViewport,
  documentRectFromViewport,
  deriveTextLayout,
  ellipseGeometryFromDrag,
  finalizePenPoints,
  normalizeTextBoxDrag,
  rectGeometryFromDrag,
  textEraserBounds,
  textSelectionBounds,
  translateAnnotation,
  validateTextBoxGeometry,
} from '../src/core/geometry';
import { AnnotationSchema, TextEditingDraftSchema } from '../src/core/model';

describe('translateAnnotation', () => {
  it('translates only positional fields without mutation', () => {
    const delta = documentDelta({ x: 10, y: 20 }, { x: 17.5, y: 16.75 });
    expect(delta).toEqual({ x: 7.5, y: -3.25 });

    const rectangle = AnnotationSchema.parse({
      id: 'rect-1',
      selectionTargetId: 'target-rect-1',
      kind: 'rect',
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      color: '#e03131',
      strokeWidth: 4,
      strokeStyle: 'dashed',
      fillStyle: 'solid',
    });
    const ellipse = AnnotationSchema.parse({
      id: 'ellipse-1',
      selectionTargetId: 'target-ellipse-1',
      kind: 'ellipse',
      cx: 30,
      cy: 40,
      rx: 20,
      ry: 10,
      color: '#2f9e44',
      strokeWidth: 6,
      strokeStyle: 'dotted',
      fillStyle: 'none',
    });
    const arrow = AnnotationSchema.parse({
      id: 'arrow-1',
      selectionTargetId: 'target-arrow-1',
      kind: 'arrow',
      x1: 10,
      y1: 20,
      x2: 50,
      y2: 70,
      color: '#1971c2',
      strokeWidth: 2,
      strokeStyle: 'solid',
    });
    const pen = AnnotationSchema.parse({
      id: 'pen-1',
      selectionTargetId: 'target-pen-1',
      kind: 'pen',
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      color: '#f08c00',
      strokeWidth: 4,
      strokeStyle: 'dashed',
    });
    const text = AnnotationSchema.parse({
      id: 'text-1',
      selectionTargetId: 'target-text-1',
      kind: 'text',
      x: 10,
      y: 20,
      width: 160,
      minimumHeight: 40,
      text: 'exact text',
      color: '#1e1e1e',
      size: 24,
    });
    const label = AnnotationSchema.parse({
      id: 'label-1',
      selectionTargetId: 'target-label-1',
      kind: 'label',
      x: 10,
      y: 20,
      text: 'main > button',
      color: '#1971c2',
    });
    const originals = [rectangle, ellipse, arrow, pen, text, label].map(
      (annotation) => structuredClone(annotation),
    );

    expect(translateAnnotation(rectangle, delta)).toEqual({
      ...rectangle,
      x: 17.5,
      y: 16.75,
    });
    expect(translateAnnotation(ellipse, delta)).toEqual({
      ...ellipse,
      cx: 37.5,
      cy: 36.75,
    });
    expect(translateAnnotation(arrow, delta)).toEqual({
      ...arrow,
      x1: 17.5,
      y1: 16.75,
      x2: 57.5,
      y2: 66.75,
    });
    expect(translateAnnotation(pen, delta)).toEqual({
      ...pen,
      points: [
        { x: 17.5, y: 16.75 },
        { x: 37.5, y: 36.75 },
      ],
    });
    expect(translateAnnotation(text, delta)).toEqual({
      ...text,
      x: 17.5,
      y: 16.75,
    });
    expect(translateAnnotation(label, delta)).toEqual({
      ...label,
      x: 17.5,
      y: 16.75,
    });
    expect([rectangle, ellipse, arrow, pen, text, label]).toEqual(originals);
  });
});

describe('documentPointFromViewport', () => {
  it('adds scroll offsets to viewport coordinates', () => {
    expect(
      documentPointFromViewport({ x: 18, y: 24 }, { x: 300, y: 500 }),
    ).toEqual({ x: 318, y: 524 });
  });
});

describe('documentRectFromViewport', () => {
  it('adds scroll only to the viewport origin', () => {
    expect(
      documentRectFromViewport(
        { x: 12.5, y: 30.25, w: 100, h: 40 },
        { x: 200, y: 500 },
      ),
    ).toEqual({ x: 212.5, y: 530.25, w: 100, h: 40 });
  });

  it('preserves exact values with zero scroll', () => {
    expect(
      documentRectFromViewport(
        { x: 12.5, y: 30.25, w: 100, h: 40 },
        { x: 0, y: 0 },
      ),
    ).toEqual({ x: 12.5, y: 30.25, w: 100, h: 40 });
  });
});

describe('bounded Text geometry', () => {
  const graphemes = new Intl.Segmenter('und', {
    granularity: 'grapheme',
  });
  const measureWidth = (value: string) =>
    [...graphemes.segment(value)].length * 10;
  const draft = TextEditingDraftSchema.parse({
    annotationId: 'text-1',
    selectionTargetId: 'target-text-1',
    x: 100,
    y: 120,
    width: 60,
    minimumHeight: 40,
    text: 'alpha  beta\n\nselector#long',
    color: '#e03131',
    size: 24,
  });

  it('normalizes and validates Text boxes by snapshotted em', () => {
    expect(
      normalizeTextBoxDrag({ x: 260, y: 180 }, { x: 100, y: 120 }),
    ).toEqual({ x: 100, y: 120, width: 160, height: 60 });
    expect(
      validateTextBoxGeometry({ x: 100, y: 120, width: 24, height: 1 }, 24),
    ).toEqual({
      kind: 'valid',
      geometry: { x: 100, y: 120, width: 24, minimumHeight: 1 },
    });
    expect(
      validateTextBoxGeometry({ x: 100, y: 120, width: 23.999, height: 1 }, 24),
    ).toEqual({ kind: 'discard' });
    expect(
      validateTextBoxGeometry({ x: 100, y: 120, width: 24, height: 0 }, 24),
    ).toEqual({ kind: 'discard' });
  });

  it('wraps exact hard lines at whitespace then grapheme boundaries', () => {
    const layout = deriveTextLayout(draft, measureWidth);

    expect(layout.lines).toEqual([
      'alpha ',
      ' beta',
      '',
      'select',
      'or#lon',
      'g',
    ]);
    expect(layout.lineBounds.map(({ width }) => width)).toEqual([
      60, 50, 0, 60, 60, 10,
    ]);
    expect(layout.lineBounds.map(({ y }) => y)).toEqual([
      120, 148.8, 177.6, 206.4, 235.2, 264,
    ]);
    expect(layout.lineHeight).toBe(28.8);
    expect(layout.displayWidth).toBe(60);
    expect(layout.displayHeight).toBe(172.8);
    expect(textSelectionBounds(layout)).toEqual({
      x: 100,
      y: 120,
      width: 60,
      height: 172.8,
    });
    expect(textEraserBounds(layout)).toEqual([
      { x: 100, y: 120, width: 60, height: 28.8 },
      { x: 100, y: 148.8, width: 50, height: 28.8 },
      { x: 100, y: 206.4, width: 60, height: 28.8 },
      { x: 100, y: 235.2, width: 60, height: 28.8 },
      { x: 100, y: 264, width: 10, height: 28.8 },
    ]);
  });

  it('keeps empty, minimum-height, wide-grapheme, and whitespace cases exact', () => {
    const empty = deriveTextLayout({ ...draft, text: '' }, measureWidth);
    expect(empty.lines).toEqual(['']);
    expect(empty.displayHeight).toBe(40);

    expect(
      deriveTextLayout(
        { ...draft, text: 'text', minimumHeight: 200 },
        measureWidth,
      ).displayHeight,
    ).toBe(200);

    const wide = deriveTextLayout({ ...draft, text: '🙂' }, (value) =>
      value === '' ? 0 : 80,
    );
    expect(wide.lines).toEqual(['🙂']);
    expect(wide.lineBounds[0]?.width).toBe(80);
    expect(wide.displayWidth).toBe(60);

    expect(
      deriveTextLayout({ ...draft, text: 'é' }, measureWidth).lines,
    ).toEqual(['é']);

    const whitespace = deriveTextLayout(
      { ...draft, text: ' \n ' },
      measureWidth,
    );
    expect(textEraserBounds(whitespace)).toEqual([
      { x: 100, y: 120, width: 12, height: 28.8 },
    ]);
  });
});

describe('rectGeometryFromDrag', () => {
  it('normalizes a free drag in either direction', () => {
    expect(
      rectGeometryFromDrag({ x: 100, y: 200 }, { x: 40, y: 280 }, 'free'),
    ).toEqual({ x: 40, y: 200, w: 60, h: 80 });
  });

  it('uses the larger pointer delta for equal axes', () => {
    expect(
      rectGeometryFromDrag(
        { x: 100, y: 200 },
        { x: 140, y: 270 },
        'equal-axes',
      ),
    ).toEqual({ x: 100, y: 200, w: 70, h: 70 });
  });

  it('preserves both reverse directions for equal axes', () => {
    expect(
      rectGeometryFromDrag({ x: 100, y: 200 }, { x: 40, y: 170 }, 'equal-axes'),
    ).toEqual({ x: 40, y: 140, w: 60, h: 60 });
  });
});

describe('ellipseGeometryFromDrag', () => {
  it('normalizes free and equal-axis drags', () => {
    const origin = { x: 100, y: 200 };
    const current = { x: 40, y: 280 };

    expect(ellipseGeometryFromDrag(origin, current, 'free')).toEqual({
      cx: 70,
      cy: 240,
      rx: 30,
      ry: 40,
    });
    expect(ellipseGeometryFromDrag(origin, current, 'equal-axes')).toEqual({
      cx: 60,
      cy: 240,
      rx: 40,
      ry: 40,
    });
    expect(origin).toEqual({ x: 100, y: 200 });
    expect(current).toEqual({ x: 40, y: 280 });
  });
});

describe('arrowHeadGeometry', () => {
  it('creates a proportional filled head', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 40, y: 0 };

    expect(arrowHeadGeometry(start, end, 2)).toEqual({
      tip: { x: 40, y: 0 },
      left: { x: 32, y: 4 },
      right: { x: 32, y: -4 },
    });
    expect(start).toEqual({ x: 0, y: 0 });
    expect(end).toEqual({ x: 40, y: 0 });
  });
});

describe('finalizePenPoints', () => {
  it('simplifies and smooths deterministic pen points without mutation', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 4 },
    ];
    const original = structuredClone(points);

    expect(finalizePenPoints(points, 2)).toEqual({
      kind: 'commit',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 6, y: 2 },
        { x: 8, y: 4 },
      ],
    });
    expect(points).toEqual(original);
  });

  it('discards identical raw points', () => {
    const points = [
      { x: 4, y: 7 },
      { x: 4, y: 7 },
    ];

    expect(finalizePenPoints(points, 2)).toEqual({ kind: 'discard' });
    expect(points).toEqual([
      { x: 4, y: 7 },
      { x: 4, y: 7 },
    ]);
  });
});
