import {
  documentDelta,
  ellipseGeometryFromDrag,
  finalizePenPoints,
  normalizeTextBoxDrag,
  rectGeometryFromDrag,
  translateAnnotation,
  validateTextBoxGeometry,
} from './geometry';
import {
  AnnotationGroupSchema,
  AnnotationIndexSchema,
  AnnotationTextSchema,
} from './model';
import type {
  Annotation,
  AnnotationId,
  ColorSampleCommitInput,
  EraserTarget,
  FillStyle,
  FontCommitInput,
  FontTarget,
  FontTargetSelection,
  GesturePointerMove,
  GesturePointerStart,
  MovePointerMove,
  MovePointerStart,
  OverlayItem,
  PickerCommitInput,
  PickerTarget,
  PickerTargetSelection,
  PointerId,
  SessionEscapeOutcome,
  SessionState,
  ShapeDraft,
  SquawkColor,
  StrokeStyle,
  StrokeWidth,
  TextEditValue,
  TextPointerMove,
  TextPointerStart,
  TextSize,
  Tool,
  ToolCursor,
  ToolState,
} from './model';

export function createSessionState(): SessionState {
  return {
    tool: { kind: 'interact' },
    style: {
      color: '#e03131',
      strokeWidth: 2,
      strokeStyle: 'solid',
      textSize: 14,
      fillStyle: 'none',
    },
    annotations: [],
    history: [],
  };
}

export function activeTool(state: SessionState): Tool {
  switch (state.tool.kind) {
    case 'interact':
      return 'interact';
    case 'select-armed':
    case 'select-selected':
    case 'select-dragging':
      return 'select';
    case 'rect-armed':
      return 'rect';
    case 'ruler-armed':
      return 'ruler';
    case 'ellipse-armed':
      return 'ellipse';
    case 'arrow-armed':
      return 'arrow';
    case 'pen-armed':
      return 'pen';
    case 'text-armed':
    case 'text-drawing':
    case 'text-editing':
      return 'text';
    case 'picker-armed':
    case 'picker-hovering':
      return 'picker';
    case 'font-armed':
    case 'font-hovering':
      return 'font';
    case 'eyedropper-armed':
      return 'eyedropper';
    case 'eraser-armed':
    case 'eraser-hovering':
      return 'eraser';
    case 'drawing':
      return state.tool.draft.kind;
  }
}

export function overlayCursor(state: SessionState): ToolCursor {
  switch (state.tool.kind) {
    case 'interact':
      return 'auto';
    case 'select-armed':
    case 'select-selected':
      return 'default';
    case 'select-dragging':
      return 'grabbing';
    case 'rect-armed':
    case 'ruler-armed':
    case 'ellipse-armed':
    case 'arrow-armed':
    case 'pen-armed':
    case 'text-armed':
    case 'text-drawing':
    case 'drawing':
    case 'eyedropper-armed':
      return 'crosshair';
    case 'text-editing':
      return 'text';
    case 'picker-armed':
    case 'picker-hovering':
    case 'font-armed':
    case 'font-hovering':
      return 'cell';
    case 'eraser-armed':
    case 'eraser-hovering':
      return 'not-allowed';
  }
}

function armedToolState(tool: Tool): ToolState {
  switch (tool) {
    case 'interact':
      return { kind: 'interact' };
    case 'select':
      return { kind: 'select-armed' };
    case 'rect':
      return { kind: 'rect-armed' };
    case 'ruler':
      return { kind: 'ruler-armed' };
    case 'ellipse':
      return { kind: 'ellipse-armed' };
    case 'arrow':
      return { kind: 'arrow-armed' };
    case 'pen':
      return { kind: 'pen-armed' };
    case 'text':
      return { kind: 'text-armed' };
    case 'picker':
      return { kind: 'picker-armed' };
    case 'font':
      return { kind: 'font-armed' };
    case 'eyedropper':
      return { kind: 'eyedropper-armed' };
    case 'eraser':
      return { kind: 'eraser-armed' };
  }
}

export function setTool(state: SessionState, tool: Tool): SessionState {
  if (state.tool.kind === 'text-editing') {
    return state;
  }
  const nextTool = armedToolState(tool);
  if (state.tool.kind === nextTool.kind) {
    return state;
  }
  return { ...state, tool: nextTool };
}

export function beginMove(
  state: SessionState,
  input: MovePointerStart,
): SessionState {
  if (
    state.tool.kind !== 'select-armed' &&
    state.tool.kind !== 'select-selected'
  ) {
    return state;
  }
  const before = AnnotationGroupSchema.safeParse(
    state.annotations.filter(
      (annotation) => annotation.selectionTargetId === input.selectionTargetId,
    ),
  );
  if (!before.success) {
    return state;
  }
  return {
    ...state,
    tool: {
      kind: 'select-dragging',
      draft: {
        pointerId: input.pointerId,
        selectionTargetId: input.selectionTargetId,
        before: before.data,
        origin: input.point,
        current: input.point,
      },
    },
  };
}

export function updateMove(
  state: SessionState,
  input: MovePointerMove,
): SessionState {
  if (
    state.tool.kind !== 'select-dragging' ||
    state.tool.draft.pointerId !== input.pointerId
  ) {
    return state;
  }
  return {
    ...state,
    tool: {
      kind: 'select-dragging',
      draft: { ...state.tool.draft, current: input.point },
    },
  };
}

export function commitMove(
  state: SessionState,
  pointerId: PointerId,
): SessionState {
  if (
    state.tool.kind !== 'select-dragging' ||
    state.tool.draft.pointerId !== pointerId
  ) {
    return state;
  }
  const { draft } = state.tool;
  const selectedTool: ToolState = {
    kind: 'select-selected',
    selectionTargetId: draft.selectionTargetId,
  };
  const delta = documentDelta(draft.origin, draft.current);
  if (delta.x === 0 && delta.y === 0) {
    return { ...state, tool: selectedTool };
  }
  const annotations = state.annotations.map((annotation) =>
    annotation.selectionTargetId === draft.selectionTargetId
      ? translateAnnotation(annotation, delta)
      : annotation,
  );
  const after = AnnotationGroupSchema.parse(
    annotations.filter(
      (annotation) => annotation.selectionTargetId === draft.selectionTargetId,
    ),
  );
  return {
    ...state,
    tool: selectedTool,
    annotations,
    history: [...state.history, { type: 'move', before: draft.before, after }],
  };
}

export function cancelMove(
  state: SessionState,
  pointerId: PointerId,
): SessionState {
  if (
    state.tool.kind !== 'select-dragging' ||
    state.tool.draft.pointerId !== pointerId
  ) {
    return state;
  }
  return {
    ...state,
    tool: {
      kind: 'select-selected',
      selectionTargetId: state.tool.draft.selectionTargetId,
    },
  };
}

export function deselectSelection(state: SessionState): SessionState {
  if (state.tool.kind !== 'select-selected') {
    return state;
  }
  return { ...state, tool: { kind: 'select-armed' } };
}

export function setColor(
  state: SessionState,
  color: SquawkColor,
): SessionState {
  if (state.tool.kind === 'text-editing' || state.style.color === color) {
    return state;
  }
  return { ...state, style: { ...state.style, color } };
}

export function setFillStyle(
  state: SessionState,
  fillStyle: FillStyle,
): SessionState {
  if (
    state.tool.kind === 'text-editing' ||
    state.style.fillStyle === fillStyle
  ) {
    return state;
  }
  return { ...state, style: { ...state.style, fillStyle } };
}

export function setStrokeWidth(
  state: SessionState,
  strokeWidth: StrokeWidth,
): SessionState {
  if (
    state.tool.kind === 'text-editing' ||
    state.style.strokeWidth === strokeWidth
  ) {
    return state;
  }
  return { ...state, style: { ...state.style, strokeWidth } };
}

export function setStrokeStyle(
  state: SessionState,
  strokeStyle: StrokeStyle,
): SessionState {
  if (
    state.tool.kind === 'text-editing' ||
    state.style.strokeStyle === strokeStyle
  ) {
    return state;
  }
  return { ...state, style: { ...state.style, strokeStyle } };
}

export function setTextSize(
  state: SessionState,
  textSize: TextSize,
): SessionState {
  if (state.tool.kind === 'text-editing' || state.style.textSize === textSize) {
    return state;
  }
  return { ...state, style: { ...state.style, textSize } };
}

export function beginTextDrawing(
  state: SessionState,
  input: TextPointerStart,
): SessionState {
  if (state.tool.kind !== 'text-armed') {
    return state;
  }
  return {
    ...state,
    tool: {
      kind: 'text-drawing',
      draft: {
        pointerId: input.pointerId,
        annotationId: input.annotationId,
        selectionTargetId: input.selectionTargetId,
        origin: input.point,
        current: input.point,
        color: state.style.color,
        size: state.style.textSize,
      },
    },
  };
}

export function updateTextDrawing(
  state: SessionState,
  input: TextPointerMove,
): SessionState {
  if (
    state.tool.kind !== 'text-drawing' ||
    state.tool.draft.pointerId !== input.pointerId
  ) {
    return state;
  }
  return {
    ...state,
    tool: {
      kind: 'text-drawing',
      draft: { ...state.tool.draft, current: input.point },
    },
  };
}

export function finishTextDrawing(
  state: SessionState,
  pointerId: PointerId,
): SessionState {
  if (
    state.tool.kind !== 'text-drawing' ||
    state.tool.draft.pointerId !== pointerId
  ) {
    return state;
  }
  const { draft } = state.tool;
  const outcome = validateTextBoxGeometry(
    normalizeTextBoxDrag(draft.origin, draft.current),
    draft.size,
  );
  if (outcome.kind === 'discard') {
    return { ...state, tool: { kind: 'text-armed' } };
  }
  return {
    ...state,
    tool: {
      kind: 'text-editing',
      draft: {
        annotationId: draft.annotationId,
        selectionTargetId: draft.selectionTargetId,
        ...outcome.geometry,
        text: '',
        color: draft.color,
        size: draft.size,
      },
    },
  };
}

export function cancelTextDrawing(
  state: SessionState,
  pointerId: PointerId,
): SessionState {
  if (
    state.tool.kind !== 'text-drawing' ||
    state.tool.draft.pointerId !== pointerId
  ) {
    return state;
  }
  return { ...state, tool: { kind: 'text-armed' } };
}

export function updateTextEdit(
  state: SessionState,
  text: TextEditValue,
): SessionState {
  if (state.tool.kind !== 'text-editing' || state.tool.draft.text === text) {
    return state;
  }
  return {
    ...state,
    tool: {
      kind: 'text-editing',
      draft: { ...state.tool.draft, text },
    },
  };
}

export function commitTextEdit(state: SessionState): SessionState {
  if (state.tool.kind !== 'text-editing') {
    return state;
  }
  const { draft } = state.tool;
  if (draft.text === '') {
    return { ...state, tool: { kind: 'text-armed' } };
  }
  const annotation: Annotation = {
    id: draft.annotationId,
    selectionTargetId: draft.selectionTargetId,
    kind: 'text',
    x: draft.x,
    y: draft.y,
    width: draft.width,
    minimumHeight: draft.minimumHeight,
    text: AnnotationTextSchema.parse(draft.text),
    color: draft.color,
    size: draft.size,
  };
  return {
    ...state,
    tool: { kind: 'text-armed' },
    annotations: [...state.annotations, annotation],
    history: [...state.history, { type: 'add', annotations: [annotation] }],
  };
}

export function beginGesture(
  state: SessionState,
  input: GesturePointerStart,
): SessionState {
  const style = {
    color: state.style.color,
    strokeWidth: state.style.strokeWidth,
    strokeStyle: state.style.strokeStyle,
  };
  switch (state.tool.kind) {
    case 'rect-armed':
      return {
        ...state,
        tool: {
          kind: 'drawing',
          draft: {
            kind: 'rect',
            pointerId: input.pointerId,
            annotationId: input.annotationId,
            selectionTargetId: input.selectionTargetId,
            origin: input.point,
            current: input.point,
            constraint: 'free',
            ...style,
            fillStyle: state.style.fillStyle,
          },
        },
      };
    case 'ruler-armed':
      return {
        ...state,
        tool: {
          kind: 'drawing',
          draft: {
            kind: 'ruler',
            pointerId: input.pointerId,
            annotationId: input.annotationId,
            selectionTargetId: input.selectionTargetId,
            origin: input.point,
            current: input.point,
            constraint: 'free',
          },
        },
      };
    case 'ellipse-armed':
      return {
        ...state,
        tool: {
          kind: 'drawing',
          draft: {
            kind: 'ellipse',
            pointerId: input.pointerId,
            annotationId: input.annotationId,
            selectionTargetId: input.selectionTargetId,
            origin: input.point,
            current: input.point,
            constraint: 'free',
            ...style,
            fillStyle: state.style.fillStyle,
          },
        },
      };
    case 'arrow-armed':
      return {
        ...state,
        tool: {
          kind: 'drawing',
          draft: {
            kind: 'arrow',
            pointerId: input.pointerId,
            annotationId: input.annotationId,
            selectionTargetId: input.selectionTargetId,
            origin: input.point,
            current: input.point,
            ...style,
          },
        },
      };
    case 'pen-armed':
      return {
        ...state,
        tool: {
          kind: 'drawing',
          draft: {
            kind: 'pen',
            pointerId: input.pointerId,
            annotationId: input.annotationId,
            selectionTargetId: input.selectionTargetId,
            points: [input.point],
            ...style,
          },
        },
      };
    case 'interact':
    case 'select-armed':
    case 'select-selected':
    case 'select-dragging':
    case 'text-armed':
    case 'text-drawing':
    case 'text-editing':
    case 'picker-armed':
    case 'picker-hovering':
    case 'font-armed':
    case 'font-hovering':
    case 'eyedropper-armed':
    case 'eraser-armed':
    case 'eraser-hovering':
    case 'drawing':
      return state;
  }
}

export function moveGesture(
  state: SessionState,
  input: GesturePointerMove,
): SessionState {
  if (
    state.tool.kind !== 'drawing' ||
    state.tool.draft.pointerId !== input.pointerId
  ) {
    return state;
  }

  const { draft } = state.tool;
  switch (draft.kind) {
    case 'rect':
    case 'ruler':
    case 'ellipse':
      return {
        ...state,
        tool: {
          kind: 'drawing',
          draft: {
            ...draft,
            current: input.point,
            constraint: input.constraint,
          },
        },
      };
    case 'arrow':
      return {
        ...state,
        tool: {
          kind: 'drawing',
          draft: { ...draft, current: input.point },
        },
      };
    case 'pen': {
      const previous = draft.points.at(-1);
      if (
        previous !== undefined &&
        previous.x === input.point.x &&
        previous.y === input.point.y
      ) {
        return state;
      }
      return {
        ...state,
        tool: {
          kind: 'drawing',
          draft: { ...draft, points: [...draft.points, input.point] },
        },
      };
    }
  }
}

function armedToolStateForDraft(draft: ShapeDraft): ToolState {
  switch (draft.kind) {
    case 'rect':
      return { kind: 'rect-armed' };
    case 'ruler':
      return { kind: 'ruler-armed' };
    case 'ellipse':
      return { kind: 'ellipse-armed' };
    case 'arrow':
      return { kind: 'arrow-armed' };
    case 'pen':
      return { kind: 'pen-armed' };
  }
}

function discardDraft(state: SessionState, draft: ShapeDraft): SessionState {
  return { ...state, tool: armedToolStateForDraft(draft) };
}

function commitAnnotation(
  state: SessionState,
  draft: ShapeDraft,
  annotation: Annotation,
): SessionState {
  return {
    ...state,
    tool: armedToolStateForDraft(draft),
    annotations: [...state.annotations, annotation],
    history: [...state.history, { type: 'add', annotations: [annotation] }],
  };
}

export function commitGesture(
  state: SessionState,
  pointerId: PointerId,
): SessionState {
  if (
    state.tool.kind !== 'drawing' ||
    state.tool.draft.pointerId !== pointerId
  ) {
    return state;
  }

  const { draft } = state.tool;
  switch (draft.kind) {
    case 'rect': {
      const geometry = rectGeometryFromDrag(
        draft.origin,
        draft.current,
        draft.constraint,
      );
      if (geometry.w === 0 || geometry.h === 0) {
        return discardDraft(state, draft);
      }
      return commitAnnotation(state, draft, {
        id: draft.annotationId,
        selectionTargetId: draft.selectionTargetId,
        kind: 'rect',
        ...geometry,
        color: draft.color,
        strokeWidth: draft.strokeWidth,
        strokeStyle: draft.strokeStyle,
        fillStyle: draft.fillStyle,
      });
    }
    case 'ruler': {
      const geometry = rectGeometryFromDrag(
        draft.origin,
        draft.current,
        draft.constraint,
      );
      if (geometry.w === 0 || geometry.h === 0) {
        return discardDraft(state, draft);
      }
      return commitAnnotation(state, draft, {
        id: draft.annotationId,
        selectionTargetId: draft.selectionTargetId,
        kind: 'ruler',
        ...geometry,
      });
    }
    case 'ellipse': {
      const geometry = ellipseGeometryFromDrag(
        draft.origin,
        draft.current,
        draft.constraint,
      );
      if (geometry.rx === 0 || geometry.ry === 0) {
        return discardDraft(state, draft);
      }
      return commitAnnotation(state, draft, {
        id: draft.annotationId,
        selectionTargetId: draft.selectionTargetId,
        kind: 'ellipse',
        ...geometry,
        color: draft.color,
        strokeWidth: draft.strokeWidth,
        strokeStyle: draft.strokeStyle,
        fillStyle: draft.fillStyle,
      });
    }
    case 'arrow':
      if (
        draft.origin.x === draft.current.x &&
        draft.origin.y === draft.current.y
      ) {
        return discardDraft(state, draft);
      }
      return commitAnnotation(state, draft, {
        id: draft.annotationId,
        selectionTargetId: draft.selectionTargetId,
        kind: 'arrow',
        x1: draft.origin.x,
        y1: draft.origin.y,
        x2: draft.current.x,
        y2: draft.current.y,
        color: draft.color,
        strokeWidth: draft.strokeWidth,
        strokeStyle: draft.strokeStyle,
      });
    case 'pen': {
      const outcome = finalizePenPoints(draft.points, draft.strokeWidth);
      if (outcome.kind === 'discard') {
        return discardDraft(state, draft);
      }
      return commitAnnotation(state, draft, {
        id: draft.annotationId,
        selectionTargetId: draft.selectionTargetId,
        kind: 'pen',
        points: outcome.points,
        color: draft.color,
        strokeWidth: draft.strokeWidth,
        strokeStyle: draft.strokeStyle,
      });
    }
  }
}

export function cancelGesture(
  state: SessionState,
  pointerId: PointerId,
): SessionState {
  if (
    state.tool.kind !== 'drawing' ||
    state.tool.draft.pointerId !== pointerId
  ) {
    return state;
  }
  return discardDraft(state, state.tool.draft);
}

function pickerTargetsEqual(left: PickerTarget, right: PickerTarget): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.w === right.w &&
    left.h === right.h &&
    left.selector === right.selector &&
    left.svelteLoc === right.svelteLoc
  );
}

export function setPickerTarget(
  state: SessionState,
  selection: PickerTargetSelection,
): SessionState {
  if (
    state.tool.kind !== 'picker-armed' &&
    state.tool.kind !== 'picker-hovering'
  ) {
    return state;
  }
  if (selection.kind === 'none') {
    if (state.tool.kind === 'picker-armed') {
      return state;
    }
    return { ...state, tool: { kind: 'picker-armed' } };
  }
  if (
    state.tool.kind === 'picker-hovering' &&
    pickerTargetsEqual(state.tool.target, selection.target)
  ) {
    return state;
  }
  return {
    ...state,
    tool: { kind: 'picker-hovering', target: selection.target },
  };
}

export function commitPickerTarget(
  state: SessionState,
  input: PickerCommitInput,
): SessionState {
  if (state.tool.kind !== 'picker-hovering') {
    return state;
  }
  const { target } = state.tool;
  const rectangle: Annotation = {
    id: input.rectangleAnnotationId,
    selectionTargetId: input.selectionTargetId,
    kind: 'rect',
    x: target.x,
    y: target.y,
    w: target.w,
    h: target.h,
    color: state.style.color,
    strokeWidth: state.style.strokeWidth,
    strokeStyle: state.style.strokeStyle,
    fillStyle: 'none',
  };
  const label: Annotation = {
    id: input.labelAnnotationId,
    selectionTargetId: input.selectionTargetId,
    kind: 'label',
    x: target.x,
    y: target.y,
    text: target.selector,
    ...(target.svelteLoc === undefined ? {} : { svelteLoc: target.svelteLoc }),
    color: state.style.color,
  };
  const annotations: readonly Annotation[] = [rectangle, label];
  return {
    ...state,
    tool: { kind: 'picker-armed' },
    annotations: [...state.annotations, ...annotations],
    history: [...state.history, { type: 'add', annotations }],
  };
}

function fontTargetsEqual(left: FontTarget, right: FontTarget): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.w === right.w &&
    left.h === right.h &&
    left.fontSize === right.fontSize &&
    left.fontFamily === right.fontFamily
  );
}

export function setFontTarget(
  state: SessionState,
  selection: FontTargetSelection,
): SessionState {
  if (state.tool.kind !== 'font-armed' && state.tool.kind !== 'font-hovering') {
    return state;
  }
  if (selection.kind === 'none') {
    if (state.tool.kind === 'font-armed') {
      return state;
    }
    return { ...state, tool: { kind: 'font-armed' } };
  }
  if (
    state.tool.kind === 'font-hovering' &&
    fontTargetsEqual(state.tool.target, selection.target)
  ) {
    return state;
  }
  return {
    ...state,
    tool: { kind: 'font-hovering', target: selection.target },
  };
}

export function commitFontTarget(
  state: SessionState,
  input: FontCommitInput,
): SessionState {
  if (state.tool.kind !== 'font-hovering') {
    return state;
  }
  const annotation: Annotation = {
    id: input.annotationId,
    selectionTargetId: input.selectionTargetId,
    kind: 'font',
    ...state.tool.target,
  };
  return {
    ...state,
    tool: { kind: 'font-armed' },
    annotations: [...state.annotations, annotation],
    history: [...state.history, { type: 'add', annotations: [annotation] }],
  };
}

export function commitColorSample(
  state: SessionState,
  input: ColorSampleCommitInput,
): SessionState {
  if (state.tool.kind !== 'eyedropper-armed') {
    return state;
  }
  const annotation: Annotation = {
    id: input.annotationId,
    selectionTargetId: input.selectionTargetId,
    kind: 'color-sample',
    x: input.point.x,
    y: input.point.y,
    sampledColor: input.sampledColor,
    strokeWidth: state.style.strokeWidth,
    strokeStyle: state.style.strokeStyle,
  };
  return {
    ...state,
    annotations: [...state.annotations, annotation],
    history: [...state.history, { type: 'add', annotations: [annotation] }],
  };
}

export function setEraserTarget(
  state: SessionState,
  target: EraserTarget,
): SessionState {
  if (
    state.tool.kind !== 'eraser-armed' &&
    state.tool.kind !== 'eraser-hovering'
  ) {
    return state;
  }
  if (target.kind === 'none') {
    if (state.tool.kind === 'eraser-armed') {
      return state;
    }
    return { ...state, tool: { kind: 'eraser-armed' } };
  }
  if (
    !state.annotations.some(
      (annotation) => annotation.id === target.annotationId,
    )
  ) {
    return state;
  }
  if (
    state.tool.kind === 'eraser-hovering' &&
    state.tool.annotationId === target.annotationId
  ) {
    return state;
  }
  return {
    ...state,
    tool: {
      kind: 'eraser-hovering',
      annotationId: target.annotationId,
    },
  };
}

export function eraseAnnotation(
  state: SessionState,
  annotationId: AnnotationId,
): SessionState {
  if (
    state.tool.kind !== 'eraser-armed' &&
    state.tool.kind !== 'eraser-hovering'
  ) {
    return state;
  }
  const rawIndex = state.annotations.findIndex(
    (annotation) => annotation.id === annotationId,
  );
  if (rawIndex < 0) {
    return state;
  }
  const annotation = state.annotations[rawIndex];
  if (annotation === undefined) {
    return state;
  }
  const index = AnnotationIndexSchema.parse(rawIndex);
  return {
    ...state,
    tool: { kind: 'eraser-armed' },
    annotations: [
      ...state.annotations.slice(0, rawIndex),
      ...state.annotations.slice(rawIndex + 1),
    ],
    history: [...state.history, { type: 'delete', annotation, index }],
  };
}

function reconcileSelection(
  tool: ToolState,
  annotations: readonly Annotation[],
): ToolState {
  if (
    tool.kind === 'select-selected' &&
    !annotations.some(
      (annotation) => annotation.selectionTargetId === tool.selectionTargetId,
    )
  ) {
    return { kind: 'select-armed' };
  }
  return tool;
}

export function undoSession(state: SessionState): SessionState {
  if (
    state.tool.kind === 'drawing' ||
    state.tool.kind === 'text-drawing' ||
    state.tool.kind === 'text-editing' ||
    state.tool.kind === 'select-dragging' ||
    state.history.length === 0
  ) {
    return state;
  }

  const operation = state.history.at(-1);
  if (operation === undefined) {
    return state;
  }
  const history = state.history.slice(0, -1);
  switch (operation.type) {
    case 'add': {
      const annotations = state.annotations.slice(
        0,
        state.annotations.length - operation.annotations.length,
      );
      return {
        ...state,
        tool: reconcileSelection(state.tool, annotations),
        annotations,
        history,
      };
    }
    case 'delete': {
      const annotations = [
        ...state.annotations.slice(0, operation.index),
        operation.annotation,
        ...state.annotations.slice(operation.index),
      ];
      return {
        ...state,
        tool: reconcileSelection(state.tool, annotations),
        annotations,
        history,
      };
    }
    case 'clear':
      return { ...state, annotations: operation.annotations, history };
    case 'move': {
      const beforeById = new Map(
        operation.before.map((annotation) => [annotation.id, annotation]),
      );
      const annotations = state.annotations.map(
        (annotation) => beforeById.get(annotation.id) ?? annotation,
      );
      return {
        ...state,
        tool: reconcileSelection(state.tool, annotations),
        annotations,
        history,
      };
    }
  }
}

function clearedTool(tool: ToolState): ToolState {
  switch (tool.kind) {
    case 'select-selected':
      return { kind: 'select-armed' };
    case 'eraser-hovering':
      return { kind: 'eraser-armed' };
    case 'font-hovering':
      return { kind: 'font-armed' };
    default:
      return tool;
  }
}

export function clearSession(state: SessionState): SessionState {
  if (
    state.tool.kind === 'drawing' ||
    state.tool.kind === 'text-drawing' ||
    state.tool.kind === 'text-editing' ||
    state.tool.kind === 'select-dragging' ||
    state.annotations.length === 0
  ) {
    return state;
  }
  return {
    ...state,
    tool: clearedTool(state.tool),
    annotations: [],
    history: [
      ...state.history,
      { type: 'clear', annotations: state.annotations },
    ],
  };
}

export function escapeSession(state: SessionState): SessionEscapeOutcome {
  switch (state.tool.kind) {
    case 'drawing':
      return {
        kind: 'state-changed',
        state: discardDraft(state, state.tool.draft),
      };
    case 'text-drawing':
      return {
        kind: 'state-changed',
        state: cancelTextDrawing(state, state.tool.draft.pointerId),
      };
    case 'text-editing':
      return {
        kind: 'state-changed',
        state: commitTextEdit(state),
      };
    case 'select-dragging':
      return {
        kind: 'state-changed',
        state: cancelMove(state, state.tool.draft.pointerId),
      };
    case 'select-selected':
      return {
        kind: 'state-changed',
        state: { ...state, tool: { kind: 'select-armed' } },
      };
    case 'select-armed':
    case 'rect-armed':
    case 'ruler-armed':
    case 'ellipse-armed':
    case 'arrow-armed':
    case 'pen-armed':
    case 'text-armed':
    case 'picker-armed':
    case 'picker-hovering':
    case 'font-armed':
    case 'font-hovering':
    case 'eyedropper-armed':
    case 'eraser-armed':
    case 'eraser-hovering':
      return {
        kind: 'state-changed',
        state: { ...state, tool: { kind: 'interact' } },
      };
    case 'interact':
      return { kind: 'teardown' };
  }
}

export function overlayItems(state: SessionState): readonly OverlayItem[] {
  const hoveredId =
    state.tool.kind === 'eraser-hovering' ? state.tool.annotationId : undefined;
  const selectedTargetId =
    state.tool.kind === 'select-selected'
      ? state.tool.selectionTargetId
      : state.tool.kind === 'select-dragging'
        ? state.tool.draft.selectionTargetId
        : undefined;
  const moveDelta =
    state.tool.kind === 'select-dragging'
      ? documentDelta(state.tool.draft.origin, state.tool.draft.current)
      : undefined;
  const committed: readonly OverlayItem[] = state.annotations.map(
    (annotation): OverlayItem => {
      if (
        state.tool.kind === 'select-dragging' &&
        moveDelta !== undefined &&
        annotation.selectionTargetId === selectedTargetId
      ) {
        return {
          phase: 'move-preview',
          annotation: translateAnnotation(annotation, moveDelta),
          opacity: 1,
          selectionAffordance: 'selected',
        };
      }
      return {
        phase: 'committed',
        annotation,
        opacity: annotation.id === hoveredId ? 0.4 : 1,
        selectionAffordance:
          annotation.selectionTargetId === selectedTargetId
            ? 'selected'
            : 'none',
      };
    },
  );
  if (state.tool.kind === 'text-drawing') {
    const { draft } = state.tool;
    return [
      ...committed,
      {
        phase: 'preview',
        opacity: 1,
        annotation: {
          id: draft.annotationId,
          kind: 'text-box-preview',
          ...normalizeTextBoxDrag(draft.origin, draft.current),
          color: draft.color,
        },
      },
    ];
  }
  if (state.tool.kind === 'text-editing') {
    const { draft } = state.tool;
    return [
      ...committed,
      {
        phase: 'preview',
        opacity: 1,
        annotation: {
          id: draft.annotationId,
          kind: 'text-preview',
          x: draft.x,
          y: draft.y,
          width: draft.width,
          minimumHeight: draft.minimumHeight,
          text: draft.text,
          color: draft.color,
          size: draft.size,
        },
      },
    ];
  }
  if (state.tool.kind === 'picker-hovering') {
    return [
      ...committed,
      {
        phase: 'picker-highlight',
        target: state.tool.target,
        color: state.style.color,
        strokeWidth: state.style.strokeWidth,
        strokeStyle: state.style.strokeStyle,
      },
    ];
  }
  if (state.tool.kind === 'font-hovering') {
    return [
      ...committed,
      {
        phase: 'font-highlight',
        target: state.tool.target,
      },
    ];
  }
  if (state.tool.kind !== 'drawing') {
    return committed;
  }

  const { draft } = state.tool;
  switch (draft.kind) {
    case 'rect': {
      const geometry = rectGeometryFromDrag(
        draft.origin,
        draft.current,
        draft.constraint,
      );
      return [
        ...committed,
        {
          phase: 'preview',
          opacity: 1,
          annotation: {
            id: draft.annotationId,
            kind: 'rect-preview',
            ...geometry,
            color: draft.color,
            strokeWidth: draft.strokeWidth,
            strokeStyle: draft.strokeStyle,
            fillStyle: draft.fillStyle,
          },
        },
      ];
    }
    case 'ruler': {
      const geometry = rectGeometryFromDrag(
        draft.origin,
        draft.current,
        draft.constraint,
      );
      return [
        ...committed,
        {
          phase: 'preview',
          opacity: 1,
          annotation: {
            id: draft.annotationId,
            kind: 'ruler-preview',
            ...geometry,
          },
        },
      ];
    }
    case 'ellipse': {
      const geometry = ellipseGeometryFromDrag(
        draft.origin,
        draft.current,
        draft.constraint,
      );
      return [
        ...committed,
        {
          phase: 'preview',
          opacity: 1,
          annotation: {
            id: draft.annotationId,
            kind: 'ellipse-preview',
            ...geometry,
            color: draft.color,
            strokeWidth: draft.strokeWidth,
            strokeStyle: draft.strokeStyle,
            fillStyle: draft.fillStyle,
          },
        },
      ];
    }
    case 'arrow':
      return [
        ...committed,
        {
          phase: 'preview',
          opacity: 1,
          annotation: {
            id: draft.annotationId,
            kind: 'arrow-preview',
            x1: draft.origin.x,
            y1: draft.origin.y,
            x2: draft.current.x,
            y2: draft.current.y,
            color: draft.color,
            strokeWidth: draft.strokeWidth,
            strokeStyle: draft.strokeStyle,
          },
        },
      ];
    case 'pen':
      return [
        ...committed,
        {
          phase: 'preview',
          opacity: 1,
          annotation: {
            id: draft.annotationId,
            kind: 'pen-preview',
            points: draft.points,
            color: draft.color,
            strokeWidth: draft.strokeWidth,
            strokeStyle: draft.strokeStyle,
          },
        },
      ];
  }
}
