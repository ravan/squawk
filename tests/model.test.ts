import { describe, expect, it } from 'vitest';

import {
  AnnotationSchema,
  ColorSampleAnnotationSchema,
  DeleteOpSchema,
  FillStyleSchema,
  GesturePointerStartSchema,
  LabelAnnotationSchema,
  MoveOpSchema,
  OverlayItemSchema,
  PickerCommitInputSchema,
  PickerTargetSchema,
  PreviewAnnotationSchema,
  ShapeDraftSchema,
  SampledColorSchema,
  SquawkColorSchema,
  StrokeStyleSchema,
  StyleStateSchema,
  TextAnnotationSchema,
  TextPointerStartSchema,
  ToolCursorSchema,
  ToolSchema,
  ToolStateSchema,
} from '../src/core/model';

const style = {
  color: '#e03131',
  strokeWidth: 4,
  strokeStyle: 'dashed',
};
const rectangle = {
  id: 'rect-1',
  selectionTargetId: 'target-rect-1',
  kind: 'rect',
  x: 10,
  y: 20,
  w: 30,
  h: 40,
  ...style,
  fillStyle: 'solid',
};
const ellipse = {
  id: 'ellipse-1',
  selectionTargetId: 'target-ellipse-1',
  kind: 'ellipse',
  cx: 30,
  cy: 40,
  rx: 20,
  ry: 10,
  ...style,
  fillStyle: 'none',
};
const arrow = {
  id: 'arrow-1',
  selectionTargetId: 'target-arrow-1',
  kind: 'arrow',
  x1: 10,
  y1: 20,
  x2: 50,
  y2: 70,
  ...style,
};
const pen = {
  id: 'pen-1',
  selectionTargetId: 'target-pen-1',
  kind: 'pen',
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ],
  ...style,
};
const text = {
  id: 'text-1',
  selectionTargetId: 'target-text-1',
  kind: 'text',
  x: 100,
  y: 120,
  width: 160,
  minimumHeight: 40,
  text: 'alpha  beta\n\nselector#long',
  color: '#e03131',
  size: 24,
};
const pickerTarget = {
  x: 10,
  y: 20,
  w: 120,
  h: 30,
  selector: 'a.nav-link',
};
const label = {
  id: 'label-1',
  selectionTargetId: 'target-label-1',
  kind: 'label',
  x: 10,
  y: 20,
  text: 'a.nav-link',
  color: '#1971c2',
};
const colorSample = {
  id: 'color-sample-1',
  selectionTargetId: 'target-color-sample-1',
  kind: 'color-sample',
  x: 48,
  y: 64,
  sampledColor: '#0F80FF',
  strokeWidth: 4,
  strokeStyle: 'dashed',
};

const annotations = [rectangle, ellipse, arrow, pen, text, label, colorSample];

describe('domain model', () => {
  it('domain model requires explicit Selection target identity and exact Move states', () => {
    for (const annotation of annotations) {
      expect(AnnotationSchema.parse(annotation)).toEqual(annotation);
      const withoutSelectionTargetId = structuredClone(annotation);
      Reflect.deleteProperty(withoutSelectionTargetId, 'selectionTargetId');
      expect(() => AnnotationSchema.parse(withoutSelectionTargetId)).toThrow();
    }

    expect(ToolSchema.options).toEqual([
      'interact',
      'select',
      'rect',
      'ellipse',
      'arrow',
      'pen',
      'text',
      'picker',
      'eyedropper',
      'eraser',
    ]);
    expect(ToolCursorSchema.options).toEqual([
      'auto',
      'default',
      'crosshair',
      'text',
      'cell',
      'not-allowed',
      'grabbing',
    ]);

    const selectStates = [
      { kind: 'select-armed' },
      { kind: 'select-selected', selectionTargetId: 'target-rect-1' },
      {
        kind: 'select-dragging',
        draft: {
          pointerId: 1,
          selectionTargetId: 'target-rect-1',
          before: [rectangle],
          origin: { x: 15, y: 25 },
          current: { x: 20, y: 30 },
        },
      },
    ];
    for (const state of selectStates) {
      expect(ToolStateSchema.parse(state)).toEqual(state);
    }

    const oneMemberMove = {
      type: 'move',
      before: [rectangle],
      after: [{ ...rectangle, x: 15, y: 25 }],
    };
    const twoMemberMove = {
      type: 'move',
      before: [rectangle, label],
      after: [
        { ...rectangle, x: 15, y: 25 },
        { ...label, x: 15, y: 25 },
      ],
    };
    expect(MoveOpSchema.parse(oneMemberMove)).toEqual(oneMemberMove);
    expect(MoveOpSchema.parse(twoMemberMove)).toEqual(twoMemberMove);
    expect(() =>
      MoveOpSchema.parse({ ...oneMemberMove, before: [] }),
    ).toThrow();
    expect(() => MoveOpSchema.parse({ ...oneMemberMove, after: [] })).toThrow();
  });

  it('parses the complete color and Fill style sets exactly', () => {
    expect(SquawkColorSchema.options).toEqual([
      '#1e1e1e',
      '#e03131',
      '#2f9e44',
      '#1971c2',
      '#f08c00',
      '#ffffff',
    ]);
    expect(FillStyleSchema.options).toEqual(['none', 'solid']);
    expect(SquawkColorSchema.parse('#ffffff')).toBe('#ffffff');
    expect(SampledColorSchema.parse('#0F80FF')).toBe('#0F80FF');
    expect(() => SampledColorSchema.parse('#0f80ff')).toThrow();
    expect(ColorSampleAnnotationSchema.parse(colorSample)).toEqual(colorSample);
    expect(() => FillStyleSchema.parse('translucent')).toThrow();
  });

  it('parses the complete stroke style set exactly', () => {
    for (const strokeStyle of ['solid', 'dashed', 'dotted']) {
      expect(StrokeStyleSchema.parse(strokeStyle)).toBe(strokeStyle);
    }
    expect(() => StrokeStyleSchema.parse('none')).toThrow();
  });

  it('requires an exact stroke style on every stroke annotation', () => {
    for (const annotation of [rectangle, ellipse, arrow, pen]) {
      expect(AnnotationSchema.parse(annotation)).toEqual(annotation);
      expect(() =>
        AnnotationSchema.parse({ ...annotation, strokeStyle: undefined }),
      ).toThrow();
      expect(() =>
        AnnotationSchema.parse({ ...annotation, strokeStyle: 'none' }),
      ).toThrow();
    }
  });

  it('requires stroke style on every stroke draft and preview', () => {
    const drag = {
      pointerId: 1,
      annotationId: 'shape-1',
      selectionTargetId: 'target-shape-1',
      origin: { x: 10, y: 20 },
      current: { x: 30, y: 40 },
      ...style,
    };
    const drafts = [
      { ...drag, kind: 'rect', constraint: 'free', fillStyle: 'solid' },
      { ...drag, kind: 'ellipse', constraint: 'equal-axes', fillStyle: 'none' },
      { ...drag, kind: 'arrow' },
      {
        kind: 'pen',
        pointerId: 1,
        annotationId: 'pen-1',
        selectionTargetId: 'target-pen-1',
        points: [{ x: 10, y: 20 }],
        ...style,
      },
    ];
    const previews = [
      {
        id: 'rect-1',
        kind: 'rect-preview',
        x: 10,
        y: 20,
        w: 20,
        h: 20,
        ...style,
        fillStyle: 'solid',
      },
      {
        id: 'ellipse-1',
        kind: 'ellipse-preview',
        cx: 20,
        cy: 30,
        rx: 10,
        ry: 10,
        ...style,
        fillStyle: 'none',
      },
      {
        id: 'arrow-1',
        kind: 'arrow-preview',
        x1: 10,
        y1: 20,
        x2: 30,
        y2: 40,
        ...style,
      },
      {
        id: 'pen-1',
        kind: 'pen-preview',
        points: [{ x: 10, y: 20 }],
        ...style,
      },
    ];

    for (const draft of drafts) {
      expect(ShapeDraftSchema.parse(draft)).toEqual(draft);
      expect(() =>
        ShapeDraftSchema.parse({ ...draft, strokeStyle: undefined }),
      ).toThrow();
      expect(() =>
        ShapeDraftSchema.parse({ ...draft, strokeStyle: 'none' }),
      ).toThrow();
    }
    for (const preview of previews) {
      expect(PreviewAnnotationSchema.parse(preview)).toEqual(preview);
      expect(() =>
        PreviewAnnotationSchema.parse({ ...preview, strokeStyle: undefined }),
      ).toThrow();
      expect(() =>
        PreviewAnnotationSchema.parse({ ...preview, strokeStyle: 'none' }),
      ).toThrow();
      expect(() =>
        PreviewAnnotationSchema.parse({
          ...preview,
          selectionTargetId: 'target-preview-1',
        }),
      ).toThrow();
    }
  });

  it('requires Fill only on closed shapes, their drafts, previews, and style state', () => {
    for (const annotation of [rectangle, ellipse]) {
      expect(() =>
        AnnotationSchema.parse({ ...annotation, fillStyle: undefined }),
      ).toThrow();
      const missingFill = structuredClone(annotation);
      Reflect.deleteProperty(missingFill, 'fillStyle');
      expect(() => AnnotationSchema.parse(missingFill)).toThrow();
      expect(() =>
        AnnotationSchema.parse({ ...annotation, fillStyle: 'translucent' }),
      ).toThrow();
    }

    for (const annotation of [arrow, pen, text, label]) {
      expect(() =>
        AnnotationSchema.parse({ ...annotation, fillStyle: 'solid' }),
      ).toThrow();
    }

    const rectangleDraft = {
      pointerId: 1,
      annotationId: 'rect-1',
      selectionTargetId: 'target-rect-1',
      origin: { x: 10, y: 20 },
      current: { x: 30, y: 40 },
      ...style,
      kind: 'rect',
      constraint: 'free',
      fillStyle: 'solid',
    };
    const ellipseDraft = {
      ...rectangleDraft,
      kind: 'ellipse',
      fillStyle: 'none',
    };
    const arrowDraft = {
      pointerId: 1,
      annotationId: 'arrow-1',
      selectionTargetId: 'target-arrow-1',
      origin: { x: 10, y: 20 },
      current: { x: 30, y: 40 },
      ...style,
      kind: 'arrow',
    };
    const penDraft = {
      pointerId: 1,
      annotationId: 'pen-1',
      selectionTargetId: 'target-pen-1',
      points: [{ x: 10, y: 20 }],
      ...style,
      kind: 'pen',
    };
    for (const draft of [rectangleDraft, ellipseDraft]) {
      expect(ShapeDraftSchema.parse(draft)).toEqual(draft);
      const missingFill = structuredClone(draft);
      Reflect.deleteProperty(missingFill, 'fillStyle');
      expect(() => ShapeDraftSchema.parse(missingFill)).toThrow();
      expect(() =>
        ShapeDraftSchema.parse({ ...draft, fillStyle: undefined }),
      ).toThrow();
      expect(() =>
        ShapeDraftSchema.parse({ ...draft, fillStyle: 'translucent' }),
      ).toThrow();
    }
    for (const draft of [arrowDraft, penDraft]) {
      expect(() =>
        ShapeDraftSchema.parse({ ...draft, fillStyle: 'solid' }),
      ).toThrow();
    }

    const rectanglePreview = {
      id: 'rect-1',
      kind: 'rect-preview',
      x: 10,
      y: 20,
      w: 20,
      h: 20,
      ...style,
      fillStyle: 'solid',
    };
    const ellipsePreview = {
      id: 'ellipse-1',
      kind: 'ellipse-preview',
      cx: 20,
      cy: 30,
      rx: 10,
      ry: 10,
      ...style,
      fillStyle: 'none',
    };
    const arrowPreview = {
      id: 'arrow-1',
      kind: 'arrow-preview',
      x1: 10,
      y1: 20,
      x2: 30,
      y2: 40,
      ...style,
    };
    const penPreview = {
      id: 'pen-1',
      kind: 'pen-preview',
      points: [{ x: 10, y: 20 }],
      ...style,
    };
    const textPreview = {
      id: 'text-1',
      kind: 'text-preview',
      x: 10,
      y: 20,
      width: 160,
      minimumHeight: 40,
      text: 'first',
      color: '#e03131',
      size: 24,
    };
    for (const preview of [rectanglePreview, ellipsePreview]) {
      expect(PreviewAnnotationSchema.parse(preview)).toEqual(preview);
      const missingFill = structuredClone(preview);
      Reflect.deleteProperty(missingFill, 'fillStyle');
      expect(() => PreviewAnnotationSchema.parse(missingFill)).toThrow();
      expect(() =>
        PreviewAnnotationSchema.parse({ ...preview, fillStyle: undefined }),
      ).toThrow();
      expect(() =>
        PreviewAnnotationSchema.parse({ ...preview, fillStyle: 'translucent' }),
      ).toThrow();
    }
    for (const preview of [arrowPreview, penPreview, textPreview]) {
      expect(() =>
        PreviewAnnotationSchema.parse({ ...preview, fillStyle: 'solid' }),
      ).toThrow();
    }

    const highlight = {
      phase: 'picker-highlight',
      target: pickerTarget,
      ...style,
    };
    expect(() =>
      OverlayItemSchema.parse({ ...highlight, fillStyle: 'solid' }),
    ).toThrow();

    const styleState = { ...style, textSize: 18, fillStyle: 'none' };
    expect(StyleStateSchema.parse(styleState)).toEqual(styleState);
    expect(() => StyleStateSchema.parse(style)).toThrow();
    expect(() =>
      StyleStateSchema.parse({ ...styleState, fillStyle: undefined }),
    ).toThrow();
    expect(() =>
      StyleStateSchema.parse({ ...styleState, fillStyle: 'translucent' }),
    ).toThrow();
  });

  it('requires stroke style on picker highlights and style state', () => {
    const highlight = {
      phase: 'picker-highlight',
      target: pickerTarget,
      ...style,
    };

    expect(OverlayItemSchema.parse(highlight)).toEqual(highlight);
    expect(() =>
      OverlayItemSchema.parse({ ...highlight, strokeStyle: undefined }),
    ).toThrow();
    expect(() =>
      OverlayItemSchema.parse({ ...highlight, strokeStyle: 'none' }),
    ).toThrow();
    const styleState = { ...style, textSize: 18, fillStyle: 'none' };
    expect(StyleStateSchema.parse(styleState)).toEqual(styleState);
    expect(() =>
      StyleStateSchema.parse({ ...styleState, strokeStyle: undefined }),
    ).toThrow();
    expect(() =>
      StyleStateSchema.parse({ ...styleState, strokeStyle: 'none' }),
    ).toThrow();
    expect(() =>
      StyleStateSchema.parse({ ...styleState, textSize: undefined }),
    ).toThrow();
  });

  it('parses only bounded Text annotations and exact Text states', () => {
    expect(ToolSchema.parse('text')).toBe('text');
    expect(TextAnnotationSchema.parse(text)).toEqual(text);
    expect(AnnotationSchema.parse(text)).toEqual(text);

    const drawing = {
      kind: 'text-drawing',
      draft: {
        pointerId: 1,
        annotationId: 'text-1',
        selectionTargetId: 'target-text-1',
        origin: { x: 260, y: 180 },
        current: { x: 100, y: 120 },
        color: '#e03131',
        size: 24,
      },
    };
    const editing = {
      kind: 'text-editing',
      draft: {
        annotationId: 'text-1',
        selectionTargetId: 'target-text-1',
        x: 100,
        y: 120,
        width: 160,
        minimumHeight: 40,
        text: 'alpha  beta\n\nselector#long',
        color: '#e03131',
        size: 24,
      },
    };
    const boxPreview = {
      id: 'text-1',
      kind: 'text-box-preview',
      x: 100,
      y: 120,
      width: 160,
      height: 60,
      color: '#e03131',
    };
    const textPreview = {
      id: 'text-1',
      kind: 'text-preview',
      x: 100,
      y: 120,
      width: 160,
      minimumHeight: 40,
      text: 'alpha  beta\n\nselector#long',
      color: '#e03131',
      size: 24,
    };

    expect(ToolStateSchema.parse({ kind: 'text-armed' })).toEqual({
      kind: 'text-armed',
    });
    expect(ToolStateSchema.parse(drawing)).toEqual(drawing);
    expect(ToolStateSchema.parse(editing)).toEqual(editing);
    expect(PreviewAnnotationSchema.parse(boxPreview)).toEqual(boxPreview);
    expect(PreviewAnnotationSchema.parse(textPreview)).toEqual(textPreview);

    const oldText = structuredClone(text);
    Reflect.deleteProperty(oldText, 'width');
    Reflect.deleteProperty(oldText, 'minimumHeight');
    expect(() => TextAnnotationSchema.parse(oldText)).toThrow();
    expect(() =>
      ToolStateSchema.parse({
        ...editing,
        draft: { ...editing.draft, point: { x: 100, y: 120 } },
      }),
    ).toThrow();
    expect(() =>
      PreviewAnnotationSchema.parse({
        ...textPreview,
        lines: ['alpha  beta'],
        displayHeight: 40,
      }),
    ).toThrow();
    for (const preview of [boxPreview, textPreview]) {
      expect(() =>
        PreviewAnnotationSchema.parse({
          ...preview,
          selectionTargetId: 'target-text-1',
        }),
      ).toThrow();
    }
  });

  it('parses picker labels, targets, states, and highlights exactly', () => {
    expect(ToolSchema.parse('picker')).toBe('picker');
    expect(LabelAnnotationSchema.parse(label)).toEqual(label);
    expect(AnnotationSchema.parse(label)).toEqual(label);
    expect(ToolStateSchema.parse({ kind: 'picker-armed' })).toEqual({
      kind: 'picker-armed',
    });
    expect(
      ToolStateSchema.parse({ kind: 'picker-hovering', target: pickerTarget }),
    ).toEqual({ kind: 'picker-hovering', target: pickerTarget });

    const highlight = {
      phase: 'picker-highlight',
      target: pickerTarget,
      color: '#1971c2',
      strokeWidth: 4,
      strokeStyle: 'dotted',
    };
    expect(OverlayItemSchema.parse(highlight)).toEqual(highlight);
  });

  it('requires Selection target identity on creation inputs', () => {
    const textStart = {
      pointerId: 1,
      annotationId: 'text-1',
      selectionTargetId: 'target-text-1',
      point: { x: 10, y: 20 },
    };
    const gestureStart = {
      pointerId: 1,
      annotationId: 'rect-1',
      selectionTargetId: 'target-rect-1',
      point: { x: 10, y: 20 },
    };
    const pickerCommit = {
      rectangleAnnotationId: 'rect-1',
      labelAnnotationId: 'label-1',
      selectionTargetId: 'target-picker-1',
    };

    expect(TextPointerStartSchema.parse(textStart)).toEqual(textStart);
    expect(GesturePointerStartSchema.parse(gestureStart)).toEqual(gestureStart);
    expect(PickerCommitInputSchema.parse(pickerCommit)).toEqual(pickerCommit);
    expect(() =>
      TextPointerStartSchema.parse({
        ...textStart,
        selectionTargetId: undefined,
      }),
    ).toThrow();
    expect(() =>
      GesturePointerStartSchema.parse({
        ...gestureStart,
        selectionTargetId: undefined,
      }),
    ).toThrow();
    expect(() =>
      PickerCommitInputSchema.parse({
        ...pickerCommit,
        selectionTargetId: undefined,
      }),
    ).toThrow();
  });

  it('rejects invalid picker labels and targets', () => {
    expect(() => LabelAnnotationSchema.parse({ ...label, text: '' })).toThrow();
    expect(() =>
      LabelAnnotationSchema.parse({ ...label, text: 'x'.repeat(41) }),
    ).toThrow();
    expect(() => LabelAnnotationSchema.parse({ ...label, size: 14 })).toThrow();
    expect(() =>
      LabelAnnotationSchema.parse({ ...label, strokeWidth: 4 }),
    ).toThrow();
    expect(() =>
      LabelAnnotationSchema.parse({ ...label, strokeStyle: 'solid' }),
    ).toThrow();
    expect(() =>
      LabelAnnotationSchema.parse({ ...label, extra: true }),
    ).toThrow();
    expect(() => PickerTargetSchema.parse({ ...pickerTarget, w: 0 })).toThrow();
    expect(() => PickerTargetSchema.parse({ ...pickerTarget, h: 0 })).toThrow();
  });

  it('accepts an optional svelte loc on picker targets and labels', () => {
    const locTarget = { ...pickerTarget, svelteLoc: 'src/App.svelte:852' };
    const locLabel = { ...label, svelteLoc: 'src/App.svelte:852' };
    expect(PickerTargetSchema.parse(locTarget)).toEqual(locTarget);
    expect(LabelAnnotationSchema.parse(locLabel)).toEqual(locLabel);
    expect(() =>
      PickerTargetSchema.parse({ ...pickerTarget, svelteLoc: '' }),
    ).toThrow();
    expect(() =>
      LabelAnnotationSchema.parse({ ...label, svelteLoc: 'x'.repeat(81) }),
    ).toThrow();
  });

  it('parses the complete armed tool set and delete op', () => {
    const armedStates = [
      { kind: 'interact' },
      { kind: 'select-armed' },
      { kind: 'rect-armed' },
      { kind: 'ellipse-armed' },
      { kind: 'arrow-armed' },
      { kind: 'pen-armed' },
      { kind: 'text-armed' },
      { kind: 'picker-armed' },
      { kind: 'eraser-armed' },
    ];

    for (const state of armedStates) {
      expect(ToolStateSchema.parse(state)).toEqual(state);
    }

    const deletion = { type: 'delete', annotation: ellipse, index: 1 };
    expect(DeleteOpSchema.parse(deletion)).toEqual(deletion);
  });

  it('requires selection affordance on committed projection items', () => {
    const committed = {
      phase: 'committed',
      annotation: rectangle,
      opacity: 1,
      selectionAffordance: 'none',
    };
    const movePreview = {
      phase: 'move-preview',
      annotation: { ...rectangle, x: 20 },
      opacity: 1,
      selectionAffordance: 'selected',
    };

    expect(OverlayItemSchema.parse(committed)).toEqual(committed);
    expect(OverlayItemSchema.parse(movePreview)).toEqual(movePreview);
    expect(() =>
      OverlayItemSchema.parse({ ...committed, selectionAffordance: undefined }),
    ).toThrow();
  });

  it('rejects invalid committed text', () => {
    expect(() => TextAnnotationSchema.parse({ ...text, text: '' })).toThrow();
    expect(() => TextAnnotationSchema.parse({ ...text, size: 20 })).toThrow();
    expect(() =>
      TextAnnotationSchema.parse({ ...text, strokeWidth: 6 }),
    ).toThrow();
    expect(() =>
      TextAnnotationSchema.parse({ ...text, strokeStyle: 'solid' }),
    ).toThrow();
    expect(() =>
      PreviewAnnotationSchema.parse({
        id: 'text-1',
        kind: 'text-preview',
        x: 10,
        y: 20,
        width: 160,
        minimumHeight: 40,
        text: 'first',
        color: '#e03131',
        size: 24,
        strokeStyle: 'solid',
      }),
    ).toThrow();
    expect(() =>
      TextAnnotationSchema.parse({ ...text, extra: true }),
    ).toThrow();
  });

  it('rejects degenerate committed geometry and unknown fields', () => {
    expect(() => AnnotationSchema.parse({ ...rectangle, w: 0 })).toThrow();
    expect(() => AnnotationSchema.parse({ ...ellipse, rx: 0 })).toThrow();
    expect(() =>
      AnnotationSchema.parse({ ...pen, points: [{ x: 10, y: 20 }] }),
    ).toThrow();
    expect(() =>
      AnnotationSchema.parse({ ...rectangle, extra: true }),
    ).toThrow();
    expect(() => AnnotationSchema.parse({ ...rectangle, id: '' })).toThrow();
    expect(() =>
      AnnotationSchema.parse({ ...rectangle, selectionTargetId: '' }),
    ).toThrow();
    expect(AnnotationSchema.parse({ ...rectangle, color: '#ffffff' })).toEqual({
      ...rectangle,
      color: '#ffffff',
    });
    expect(() =>
      AnnotationSchema.parse({ ...rectangle, strokeWidth: 3 }),
    ).toThrow();
  });
});
