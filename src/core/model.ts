import { z } from 'zod';

export const AnnotationIdSchema = z.string().min(1).brand<'AnnotationId'>();
export type AnnotationId = z.infer<typeof AnnotationIdSchema>;
export const SelectionTargetIdSchema = z
  .string()
  .min(1)
  .brand<'SelectionTargetId'>();
export type SelectionTargetId = z.infer<typeof SelectionTargetIdSchema>;
export const AnnotationIndexSchema = z
  .number()
  .int()
  .nonnegative()
  .brand<'AnnotationIndex'>();
export type AnnotationIndex = z.infer<typeof AnnotationIndexSchema>;
export const PointerIdSchema = z.number().int().brand<'PointerId'>();
export type PointerId = z.infer<typeof PointerIdSchema>;
export const CssPixelsSchema = z.number();
export type CssPixels = z.infer<typeof CssPixelsSchema>;
export const SelectorLabelSchema = z
  .string()
  .min(1)
  .max(40)
  .brand<'SelectorLabel'>();
export type SelectorLabel = z.infer<typeof SelectorLabelSchema>;
export const SvelteLocSchema = z.string().min(1).max(80).brand<'SvelteLoc'>();
export type SvelteLoc = z.infer<typeof SvelteLocSchema>;
export const FontSizeCssSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?px$/)
  .brand<'FontSizeCss'>();
export type FontSizeCss = z.infer<typeof FontSizeCssSchema>;
export const FontFamilySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .brand<'FontFamily'>();
export type FontFamily = z.infer<typeof FontFamilySchema>;

export const ViewportRectSchema = z
  .object({
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    w: CssPixelsSchema.nonnegative(),
    h: CssPixelsSchema.nonnegative(),
  })
  .strict()
  .readonly();
export type ViewportRect = z.infer<typeof ViewportRectSchema>;

export const DocumentPointSchema = z
  .object({ x: CssPixelsSchema, y: CssPixelsSchema })
  .strict()
  .readonly();
export type DocumentPoint = z.infer<typeof DocumentPointSchema>;
export const DocumentDeltaSchema = z
  .object({ x: CssPixelsSchema, y: CssPixelsSchema })
  .strict()
  .readonly()
  .brand<'DocumentDelta'>();
export type DocumentDelta = z.infer<typeof DocumentDeltaSchema>;
export type ViewportPoint = Readonly<{ x: CssPixels; y: CssPixels }>;
export type ScrollOffset = Readonly<{ x: CssPixels; y: CssPixels }>;
export const SquawkColorSchema = z.enum([
  '#1e1e1e',
  '#e03131',
  '#2f9e44',
  '#1971c2',
  '#f08c00',
  '#ffffff',
]);
export type SquawkColor = z.infer<typeof SquawkColorSchema>;
export const SampledColorSchema = z
  .string()
  .regex(/^#[0-9A-F]{6}$/)
  .brand<'SampledColor'>();
export type SampledColor = z.infer<typeof SampledColorSchema>;

export const FillStyleSchema = z.enum(['none', 'solid']);
export type FillStyle = z.infer<typeof FillStyleSchema>;

const FillShape = {
  fillStyle: FillStyleSchema,
};

export const StrokeWidthSchema = z.union([
  z.literal(2),
  z.literal(4),
  z.literal(6),
]);
export type StrokeWidth = z.infer<typeof StrokeWidthSchema>;
export const StrokeStyleSchema = z.enum(['solid', 'dashed', 'dotted']);
export type StrokeStyle = z.infer<typeof StrokeStyleSchema>;

export const StrokePatternSchema = z
  .discriminatedUnion('style', [
    z
      .object({
        style: z.literal('solid'),
        lineCap: z.literal('round'),
      })
      .strict()
      .readonly(),
    z
      .object({
        style: z.literal('dashed'),
        dashArray: z
          .tuple([z.number().positive(), z.number().positive()])
          .readonly(),
        lineCap: z.literal('round'),
      })
      .strict()
      .readonly(),
    z
      .object({
        style: z.literal('dotted'),
        dashArray: z.tuple([z.literal(0), z.number().positive()]).readonly(),
        lineCap: z.literal('round'),
      })
      .strict()
      .readonly(),
  ])
  .readonly();
export type StrokePattern = z.infer<typeof StrokePatternSchema>;
export const TextSizeSchema = z.union([
  z.literal(14),
  z.literal(18),
  z.literal(24),
]);
export type TextSize = z.infer<typeof TextSizeSchema>;

export const TextLineHeightSchema = z.union([
  z.literal(16.8),
  z.literal(21.6),
  z.literal(28.8),
]);
export type TextLineHeight = z.infer<typeof TextLineHeightSchema>;

export const TextEditValueSchema = z.string();
export type TextEditValue = z.infer<typeof TextEditValueSchema>;

export const AnnotationTextSchema = z.string().min(1).brand<'AnnotationText'>();
export type AnnotationText = z.infer<typeof AnnotationTextSchema>;

const AnnotationIdentityShape = {
  id: AnnotationIdSchema,
  selectionTargetId: SelectionTargetIdSchema,
};

export const TextBoxDraftGeometrySchema = z
  .object({
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    width: CssPixelsSchema.nonnegative(),
    height: CssPixelsSchema.nonnegative(),
  })
  .strict()
  .readonly();
export type TextBoxDraftGeometry = z.infer<typeof TextBoxDraftGeometrySchema>;

export const TextBoxGeometrySchema = z
  .object({
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    width: CssPixelsSchema.positive(),
    minimumHeight: CssPixelsSchema.positive(),
  })
  .strict()
  .readonly();
export type TextBoxGeometry = z.infer<typeof TextBoxGeometrySchema>;

export const TextLineBoundsSchema = z
  .object({
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    width: CssPixelsSchema.nonnegative(),
    height: CssPixelsSchema.positive(),
  })
  .strict()
  .readonly();
export type TextLineBounds = z.infer<typeof TextLineBoundsSchema>;

export const DerivedTextLayoutSchema = z
  .object({
    lines: z.array(TextEditValueSchema).min(1).readonly(),
    lineHeight: TextLineHeightSchema,
    displayWidth: CssPixelsSchema.positive(),
    displayHeight: CssPixelsSchema.positive(),
    lineBounds: z.array(TextLineBoundsSchema).min(1).readonly(),
  })
  .strict()
  .readonly();
export type DerivedTextLayout = z.infer<typeof DerivedTextLayoutSchema>;

export const TextAnnotationSchema = z
  .object({
    ...AnnotationIdentityShape,
    kind: z.literal('text'),
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    width: CssPixelsSchema.positive(),
    minimumHeight: CssPixelsSchema.positive(),
    text: AnnotationTextSchema,
    color: SquawkColorSchema,
    size: TextSizeSchema,
  })
  .strict()
  .readonly();
export type TextAnnotation = z.infer<typeof TextAnnotationSchema>;

export const LabelAnnotationSchema = z
  .object({
    ...AnnotationIdentityShape,
    kind: z.literal('label'),
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    text: SelectorLabelSchema,
    svelteLoc: SvelteLocSchema.optional(),
    color: SquawkColorSchema,
  })
  .strict()
  .readonly();
export type LabelAnnotation = z.infer<typeof LabelAnnotationSchema>;

export const PickerTargetSchema = z
  .object({
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    w: CssPixelsSchema.positive(),
    h: CssPixelsSchema.positive(),
    selector: SelectorLabelSchema,
    svelteLoc: SvelteLocSchema.optional(),
  })
  .strict()
  .readonly();
export type PickerTarget = z.infer<typeof PickerTargetSchema>;

export const PickerTargetSelectionSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('none') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('element'), target: PickerTargetSchema })
      .strict()
      .readonly(),
  ])
  .readonly();
export type PickerTargetSelection = z.infer<typeof PickerTargetSelectionSchema>;

export const PickerCommitInputSchema = z
  .object({
    rectangleAnnotationId: AnnotationIdSchema,
    labelAnnotationId: AnnotationIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
  })
  .strict()
  .readonly();
export type PickerCommitInput = z.infer<typeof PickerCommitInputSchema>;

export const FontTargetSchema = z
  .object({
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    w: CssPixelsSchema.positive(),
    h: CssPixelsSchema.positive(),
    fontSize: FontSizeCssSchema,
    fontFamily: FontFamilySchema,
  })
  .strict()
  .readonly();
export type FontTarget = z.infer<typeof FontTargetSchema>;

export const FontTargetSelectionSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('none') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('element'), target: FontTargetSchema })
      .strict()
      .readonly(),
  ])
  .readonly();
export type FontTargetSelection = z.infer<typeof FontTargetSelectionSchema>;

export const FontCommitInputSchema = z
  .object({
    annotationId: AnnotationIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
  })
  .strict()
  .readonly();
export type FontCommitInput = z.infer<typeof FontCommitInputSchema>;

export const TextDrawingDraftSchema = z
  .object({
    pointerId: PointerIdSchema,
    annotationId: AnnotationIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
    origin: DocumentPointSchema,
    current: DocumentPointSchema,
    color: SquawkColorSchema,
    size: TextSizeSchema,
  })
  .strict()
  .readonly();
export type TextDrawingDraft = z.infer<typeof TextDrawingDraftSchema>;

export const TextEditingDraftSchema = z
  .object({
    annotationId: AnnotationIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    width: CssPixelsSchema.positive(),
    minimumHeight: CssPixelsSchema.positive(),
    text: TextEditValueSchema,
    color: SquawkColorSchema,
    size: TextSizeSchema,
  })
  .strict()
  .readonly();
export type TextEditingDraft = z.infer<typeof TextEditingDraftSchema>;

export const TextPointerStartSchema = z
  .object({
    pointerId: PointerIdSchema,
    annotationId: AnnotationIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
    point: DocumentPointSchema,
  })
  .strict()
  .readonly();
export type TextPointerStart = z.infer<typeof TextPointerStartSchema>;

export const TextPointerMoveSchema = z
  .object({ pointerId: PointerIdSchema, point: DocumentPointSchema })
  .strict()
  .readonly();
export type TextPointerMove = z.infer<typeof TextPointerMoveSchema>;

export const TextBoxValidationOutcomeSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('discard') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('valid'), geometry: TextBoxGeometrySchema })
      .strict()
      .readonly(),
  ])
  .readonly();
export type TextBoxValidationOutcome = z.infer<
  typeof TextBoxValidationOutcomeSchema
>;

export const ToolSchema = z.enum([
  'interact',
  'select',
  'rect',
  'ruler',
  'ellipse',
  'arrow',
  'pen',
  'text',
  'picker',
  'font',
  'eyedropper',
  'eraser',
]);
export type Tool = z.infer<typeof ToolSchema>;
export const ToolCursorSchema = z.enum([
  'auto',
  'default',
  'crosshair',
  'text',
  'cell',
  'not-allowed',
  'grabbing',
]);
export type ToolCursor = z.infer<typeof ToolCursorSchema>;
export const DrawingConstraintSchema = z.enum(['free', 'equal-axes']);
export type DrawingConstraint = z.infer<typeof DrawingConstraintSchema>;

export const RectGeometrySchema = z
  .object({
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    w: CssPixelsSchema.nonnegative(),
    h: CssPixelsSchema.nonnegative(),
  })
  .strict()
  .readonly();
export type RectGeometry = z.infer<typeof RectGeometrySchema>;
export const EllipseGeometrySchema = z
  .object({
    cx: CssPixelsSchema,
    cy: CssPixelsSchema,
    rx: CssPixelsSchema.nonnegative(),
    ry: CssPixelsSchema.nonnegative(),
  })
  .strict()
  .readonly();
export type EllipseGeometry = z.infer<typeof EllipseGeometrySchema>;
export const ArrowHeadGeometrySchema = z
  .object({
    tip: DocumentPointSchema,
    left: DocumentPointSchema,
    right: DocumentPointSchema,
  })
  .strict()
  .readonly();
export type ArrowHeadGeometry = z.infer<typeof ArrowHeadGeometrySchema>;

const StrokeAnnotationShape = {
  ...AnnotationIdentityShape,
  color: SquawkColorSchema,
  strokeWidth: StrokeWidthSchema,
  strokeStyle: StrokeStyleSchema,
};
const PreviewStrokeShape = {
  id: AnnotationIdSchema,
  color: SquawkColorSchema,
  strokeWidth: StrokeWidthSchema,
  strokeStyle: StrokeStyleSchema,
};
const DragDraftShape = {
  pointerId: PointerIdSchema,
  annotationId: AnnotationIdSchema,
  selectionTargetId: SelectionTargetIdSchema,
  origin: DocumentPointSchema,
  current: DocumentPointSchema,
  color: SquawkColorSchema,
  strokeWidth: StrokeWidthSchema,
  strokeStyle: StrokeStyleSchema,
};

export const RectangleAnnotationSchema = z
  .object({
    ...StrokeAnnotationShape,
    ...FillShape,
    kind: z.literal('rect'),
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    w: CssPixelsSchema.positive(),
    h: CssPixelsSchema.positive(),
  })
  .strict()
  .readonly();
export type RectangleAnnotation = z.infer<typeof RectangleAnnotationSchema>;
export const RulerAnnotationSchema = z
  .object({
    ...AnnotationIdentityShape,
    kind: z.literal('ruler'),
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    w: CssPixelsSchema.positive(),
    h: CssPixelsSchema.positive(),
  })
  .strict()
  .readonly();
export type RulerAnnotation = z.infer<typeof RulerAnnotationSchema>;
export const EllipseAnnotationSchema = z
  .object({
    ...StrokeAnnotationShape,
    ...FillShape,
    kind: z.literal('ellipse'),
    cx: CssPixelsSchema,
    cy: CssPixelsSchema,
    rx: CssPixelsSchema.positive(),
    ry: CssPixelsSchema.positive(),
  })
  .strict()
  .readonly();
export type EllipseAnnotation = z.infer<typeof EllipseAnnotationSchema>;
export const ArrowAnnotationSchema = z
  .object({
    ...StrokeAnnotationShape,
    kind: z.literal('arrow'),
    x1: CssPixelsSchema,
    y1: CssPixelsSchema,
    x2: CssPixelsSchema,
    y2: CssPixelsSchema,
  })
  .strict()
  .readonly();
export type ArrowAnnotation = z.infer<typeof ArrowAnnotationSchema>;
export const PenPointsSchema = z.array(DocumentPointSchema).min(2).readonly();
export type PenPoints = z.infer<typeof PenPointsSchema>;
export const PenAnnotationSchema = z
  .object({
    ...StrokeAnnotationShape,
    kind: z.literal('pen'),
    points: PenPointsSchema,
  })
  .strict()
  .readonly();
export type PenAnnotation = z.infer<typeof PenAnnotationSchema>;
export const ColorSampleAnnotationSchema = z
  .object({
    ...AnnotationIdentityShape,
    kind: z.literal('color-sample'),
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    sampledColor: SampledColorSchema,
    strokeWidth: StrokeWidthSchema,
    strokeStyle: StrokeStyleSchema,
  })
  .strict()
  .readonly();
export type ColorSampleAnnotation = z.infer<typeof ColorSampleAnnotationSchema>;
export const FontAnnotationSchema = z
  .object({
    ...AnnotationIdentityShape,
    kind: z.literal('font'),
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    w: CssPixelsSchema.positive(),
    h: CssPixelsSchema.positive(),
    fontSize: FontSizeCssSchema,
    fontFamily: FontFamilySchema,
  })
  .strict()
  .readonly();
export type FontAnnotation = z.infer<typeof FontAnnotationSchema>;
export const AnnotationSchema = z
  .discriminatedUnion('kind', [
    RectangleAnnotationSchema,
    RulerAnnotationSchema,
    EllipseAnnotationSchema,
    ArrowAnnotationSchema,
    PenAnnotationSchema,
    ColorSampleAnnotationSchema,
    FontAnnotationSchema,
    TextAnnotationSchema,
    LabelAnnotationSchema,
  ])
  .readonly();
export type Annotation = z.infer<typeof AnnotationSchema>;

export const AnnotationGroupSchema = z
  .tuple([AnnotationSchema])
  .rest(AnnotationSchema)
  .readonly();
export type AnnotationGroup = z.infer<typeof AnnotationGroupSchema>;

export const SelectionTargetHitSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('none') })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('target'),
        selectionTargetId: SelectionTargetIdSchema,
      })
      .strict()
      .readonly(),
  ])
  .readonly();
export type SelectionTargetHit = z.infer<typeof SelectionTargetHitSchema>;

export const MovePointerStartSchema = z
  .object({
    pointerId: PointerIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
    point: DocumentPointSchema,
  })
  .strict()
  .readonly();
export type MovePointerStart = z.infer<typeof MovePointerStartSchema>;

export const MovePointerMoveSchema = z
  .object({
    pointerId: PointerIdSchema,
    point: DocumentPointSchema,
  })
  .strict()
  .readonly();
export type MovePointerMove = z.infer<typeof MovePointerMoveSchema>;

export const MoveDraftSchema = z
  .object({
    pointerId: PointerIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
    before: AnnotationGroupSchema,
    origin: DocumentPointSchema,
    current: DocumentPointSchema,
  })
  .strict()
  .readonly();
export type MoveDraft = z.infer<typeof MoveDraftSchema>;

export const AddOpSchema = z
  .object({
    type: z.literal('add'),
    annotations: z.array(AnnotationSchema).min(1).readonly(),
  })
  .strict()
  .readonly();
export const DeleteOpSchema = z
  .object({
    type: z.literal('delete'),
    annotation: AnnotationSchema,
    index: AnnotationIndexSchema,
  })
  .strict()
  .readonly();
export const ClearOpSchema = z
  .object({
    type: z.literal('clear'),
    annotations: z.array(AnnotationSchema).min(1).readonly(),
  })
  .strict()
  .readonly();
export const MoveOpSchema = z
  .object({
    type: z.literal('move'),
    before: AnnotationGroupSchema,
    after: AnnotationGroupSchema,
  })
  .strict()
  .readonly();
export type MoveOp = z.infer<typeof MoveOpSchema>;
export const HistoryOpSchema = z
  .discriminatedUnion('type', [
    AddOpSchema,
    DeleteOpSchema,
    ClearOpSchema,
    MoveOpSchema,
  ])
  .readonly();
export type HistoryOp = z.infer<typeof HistoryOpSchema>;
export const StyleStateSchema = z
  .object({
    color: SquawkColorSchema,
    strokeWidth: StrokeWidthSchema,
    strokeStyle: StrokeStyleSchema,
    textSize: TextSizeSchema,
    fillStyle: FillStyleSchema,
  })
  .strict()
  .readonly();
export type StyleState = z.infer<typeof StyleStateSchema>;

export const ShapeDraftSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        ...DragDraftShape,
        ...FillShape,
        kind: z.literal('rect'),
        constraint: DrawingConstraintSchema,
      })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('ruler'),
        pointerId: PointerIdSchema,
        annotationId: AnnotationIdSchema,
        selectionTargetId: SelectionTargetIdSchema,
        origin: DocumentPointSchema,
        current: DocumentPointSchema,
        constraint: DrawingConstraintSchema,
      })
      .strict()
      .readonly(),
    z
      .object({
        ...DragDraftShape,
        ...FillShape,
        kind: z.literal('ellipse'),
        constraint: DrawingConstraintSchema,
      })
      .strict()
      .readonly(),
    z
      .object({ ...DragDraftShape, kind: z.literal('arrow') })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('pen'),
        pointerId: PointerIdSchema,
        annotationId: AnnotationIdSchema,
        selectionTargetId: SelectionTargetIdSchema,
        points: z.array(DocumentPointSchema).min(1).readonly(),
        color: SquawkColorSchema,
        strokeWidth: StrokeWidthSchema,
        strokeStyle: StrokeStyleSchema,
      })
      .strict()
      .readonly(),
  ])
  .readonly();
export type ShapeDraft = z.infer<typeof ShapeDraftSchema>;
export const ToolStateSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('interact') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('rect-armed') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('ruler-armed') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('ellipse-armed') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('arrow-armed') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('pen-armed') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('text-armed') })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('text-drawing'),
        draft: TextDrawingDraftSchema,
      })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('text-editing'),
        draft: TextEditingDraftSchema,
      })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('picker-armed') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('font-armed') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('eyedropper-armed') })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('picker-hovering'),
        target: PickerTargetSchema,
      })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('font-hovering'),
        target: FontTargetSchema,
      })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('select-armed') })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('select-selected'),
        selectionTargetId: SelectionTargetIdSchema,
      })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('select-dragging'), draft: MoveDraftSchema })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('eraser-armed') })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('eraser-hovering'),
        annotationId: AnnotationIdSchema,
      })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('drawing'), draft: ShapeDraftSchema })
      .strict()
      .readonly(),
  ])
  .readonly();
export type ToolState = z.infer<typeof ToolStateSchema>;
export const SessionStateSchema = z
  .object({
    tool: ToolStateSchema,
    style: StyleStateSchema,
    annotations: z.array(AnnotationSchema).readonly(),
    history: z.array(HistoryOpSchema).readonly(),
  })
  .strict()
  .readonly();
export type SessionState = z.infer<typeof SessionStateSchema>;

export const GesturePointerStartSchema = z
  .object({
    pointerId: PointerIdSchema,
    annotationId: AnnotationIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
    point: DocumentPointSchema,
  })
  .strict()
  .readonly();
export type GesturePointerStart = z.infer<typeof GesturePointerStartSchema>;
export const ColorSampleCommitInputSchema = z
  .object({
    annotationId: AnnotationIdSchema,
    selectionTargetId: SelectionTargetIdSchema,
    point: DocumentPointSchema,
    sampledColor: SampledColorSchema,
  })
  .strict()
  .readonly();
export type ColorSampleCommitInput = z.infer<
  typeof ColorSampleCommitInputSchema
>;
export const GesturePointerMoveSchema = z
  .object({
    pointerId: PointerIdSchema,
    point: DocumentPointSchema,
    constraint: DrawingConstraintSchema,
  })
  .strict()
  .readonly();
export type GesturePointerMove = z.infer<typeof GesturePointerMoveSchema>;
export const EraserTargetSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('none') })
      .strict()
      .readonly(),
    z
      .object({
        kind: z.literal('annotation'),
        annotationId: AnnotationIdSchema,
      })
      .strict()
      .readonly(),
  ])
  .readonly();
export type EraserTarget = z.infer<typeof EraserTargetSchema>;
export const PenFinalizationOutcomeSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('discard') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('commit'), points: PenPointsSchema })
      .strict()
      .readonly(),
  ])
  .readonly();
export type PenFinalizationOutcome = z.infer<
  typeof PenFinalizationOutcomeSchema
>;

export const TextBoxPreviewSchema = z
  .object({
    id: AnnotationIdSchema,
    kind: z.literal('text-box-preview'),
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    width: CssPixelsSchema.nonnegative(),
    height: CssPixelsSchema.nonnegative(),
    color: SquawkColorSchema,
  })
  .strict()
  .readonly();
export type TextBoxPreview = z.infer<typeof TextBoxPreviewSchema>;

export const TextPreviewSchema = z
  .object({
    id: AnnotationIdSchema,
    kind: z.literal('text-preview'),
    x: CssPixelsSchema,
    y: CssPixelsSchema,
    width: CssPixelsSchema.positive(),
    minimumHeight: CssPixelsSchema.positive(),
    text: TextEditValueSchema,
    color: SquawkColorSchema,
    size: TextSizeSchema,
  })
  .strict()
  .readonly();
export type TextPreview = z.infer<typeof TextPreviewSchema>;

export const PreviewAnnotationSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        ...PreviewStrokeShape,
        ...FillShape,
        kind: z.literal('rect-preview'),
        x: CssPixelsSchema,
        y: CssPixelsSchema,
        w: CssPixelsSchema.nonnegative(),
        h: CssPixelsSchema.nonnegative(),
      })
      .strict()
      .readonly(),
    z
      .object({
        id: AnnotationIdSchema,
        kind: z.literal('ruler-preview'),
        x: CssPixelsSchema,
        y: CssPixelsSchema,
        w: CssPixelsSchema.nonnegative(),
        h: CssPixelsSchema.nonnegative(),
      })
      .strict()
      .readonly(),
    z
      .object({
        ...PreviewStrokeShape,
        ...FillShape,
        kind: z.literal('ellipse-preview'),
        cx: CssPixelsSchema,
        cy: CssPixelsSchema,
        rx: CssPixelsSchema.nonnegative(),
        ry: CssPixelsSchema.nonnegative(),
      })
      .strict()
      .readonly(),
    z
      .object({
        ...PreviewStrokeShape,
        kind: z.literal('arrow-preview'),
        x1: CssPixelsSchema,
        y1: CssPixelsSchema,
        x2: CssPixelsSchema,
        y2: CssPixelsSchema,
      })
      .strict()
      .readonly(),
    z
      .object({
        ...PreviewStrokeShape,
        kind: z.literal('pen-preview'),
        points: z.array(DocumentPointSchema).min(1).readonly(),
      })
      .strict()
      .readonly(),
    TextBoxPreviewSchema,
    TextPreviewSchema,
  ])
  .readonly();
export type PreviewAnnotation = z.infer<typeof PreviewAnnotationSchema>;
export const SelectionAffordanceSchema = z.enum(['none', 'selected']);
export type SelectionAffordance = z.infer<typeof SelectionAffordanceSchema>;
export const OverlayItemSchema = z
  .discriminatedUnion('phase', [
    z
      .object({
        phase: z.literal('committed'),
        annotation: AnnotationSchema,
        opacity: z.union([z.literal(1), z.literal(0.4)]),
        selectionAffordance: SelectionAffordanceSchema,
      })
      .strict()
      .readonly(),
    z
      .object({
        phase: z.literal('move-preview'),
        annotation: AnnotationSchema,
        opacity: z.literal(1),
        selectionAffordance: z.literal('selected'),
      })
      .strict()
      .readonly(),
    z
      .object({
        phase: z.literal('preview'),
        annotation: PreviewAnnotationSchema,
        opacity: z.literal(1),
      })
      .strict()
      .readonly(),
    z
      .object({
        phase: z.literal('picker-highlight'),
        target: PickerTargetSchema,
        color: SquawkColorSchema,
        strokeWidth: StrokeWidthSchema,
        strokeStyle: StrokeStyleSchema,
      })
      .strict()
      .readonly(),
    z
      .object({
        phase: z.literal('font-highlight'),
        target: FontTargetSchema,
      })
      .strict()
      .readonly(),
  ])
  .readonly();
export type OverlayItem = z.infer<typeof OverlayItemSchema>;
export type SessionEscapeOutcome =
  | Readonly<{ kind: 'state-changed'; state: SessionState }>
  | Readonly<{ kind: 'teardown' }>;
