import { describe, expect, it } from 'vitest';

import {
  AnnotationIdSchema,
  PickerTargetSchema,
  PointerIdSchema,
  SampledColorSchema,
  SelectionTargetIdSchema,
  type AnnotationId,
  type DocumentPoint,
  type PointerId,
  type SelectionTargetId,
  type SessionState,
} from '../src/core/model';
import {
  activeTool,
  beginGesture,
  beginMove,
  beginTextDrawing,
  cancelGesture,
  cancelMove,
  cancelTextDrawing,
  clearSession,
  commitGesture,
  commitColorSample,
  commitMove,
  commitPickerTarget,
  commitTextEdit,
  createSessionState,
  finishTextDrawing,
  deselectSelection,
  eraseAnnotation,
  escapeSession,
  moveGesture,
  overlayCursor,
  overlayItems,
  setColor,
  setEraserTarget,
  setFillStyle,
  setPickerTarget,
  setStrokeStyle,
  setStrokeWidth,
  setTextSize,
  setTool,
  undoSession,
  updateMove,
  updateTextDrawing,
  updateTextEdit,
} from '../src/core/session';

const pointer1 = PointerIdSchema.parse(1);
const pointer2 = PointerIdSchema.parse(2);
const rect1 = AnnotationIdSchema.parse('rect-1');
const ellipse1 = AnnotationIdSchema.parse('ellipse-1');
const arrow1 = AnnotationIdSchema.parse('arrow-1');
const pen1 = AnnotationIdSchema.parse('pen-1');
const text1 = AnnotationIdSchema.parse('text-1');
const rectPick1 = AnnotationIdSchema.parse('rect-pick-1');
const labelPick1 = AnnotationIdSchema.parse('label-pick-1');
const colorSample1 = AnnotationIdSchema.parse('color-sample-1');
const targetRect1 = SelectionTargetIdSchema.parse('target-rect-1');
const targetEllipse1 = SelectionTargetIdSchema.parse('target-ellipse-1');
const targetArrow1 = SelectionTargetIdSchema.parse('target-arrow-1');
const targetPen1 = SelectionTargetIdSchema.parse('target-pen-1');
const targetText1 = SelectionTargetIdSchema.parse('target-text-1');
const targetPicker1 = SelectionTargetIdSchema.parse('target-picker-1');
const targetColorSample1 = SelectionTargetIdSchema.parse(
  'target-color-sample-1',
);
const pickerTarget = PickerTargetSchema.parse({
  x: 10,
  y: 20,
  w: 120,
  h: 30,
  selector: 'a.nav-link',
});

type DrawingTool = 'rect' | 'ellipse' | 'arrow' | 'pen';

function selectionTargetIdForTool(tool: DrawingTool): SelectionTargetId {
  switch (tool) {
    case 'rect':
      return targetRect1;
    case 'ellipse':
      return targetEllipse1;
    case 'arrow':
      return targetArrow1;
    case 'pen':
      return targetPen1;
  }
}

function committedGesture(
  state: SessionState,
  tool: DrawingTool,
  annotationId: AnnotationId,
  pointerId: PointerId,
  origin: DocumentPoint,
  moves: readonly DocumentPoint[],
): SessionState {
  let next = beginGesture(setTool(state, tool), {
    pointerId,
    annotationId,
    selectionTargetId: selectionTargetIdForTool(tool),
    point: origin,
  });
  for (const point of moves) {
    next = moveGesture(next, {
      pointerId,
      point,
      constraint: 'free',
    });
  }
  return commitGesture(next, pointerId);
}

function drawingGesture(
  tool: DrawingTool,
  annotationId: AnnotationId,
): SessionState {
  return beginGesture(setTool(createSessionState(), tool), {
    pointerId: pointer1,
    annotationId,
    selectionTargetId: selectionTargetIdForTool(tool),
    point: { x: 10, y: 20 },
  });
}

describe('Session state', () => {
  it('starts in interact mode with the specified initial style', () => {
    expect(createSessionState()).toEqual({
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
    });
  });

  it('changes only the live color and preserves identity for a repeat', () => {
    const state = createSessionState();
    expect(setColor(state, '#e03131')).toBe(state);

    const black = setColor(state, '#1e1e1e');
    expect(black).toEqual({
      ...state,
      style: { ...state.style, color: '#1e1e1e' },
    });
    expect(black.tool).toBe(state.tool);
    expect(black.annotations).toBe(state.annotations);
    expect(black.history).toBe(state.history);
  });

  it('changes only the live stroke style and preserves identity for a repeat', () => {
    const state = createSessionState();
    expect(setStrokeStyle(state, 'solid')).toBe(state);

    const dashed = setStrokeStyle(state, 'dashed');
    expect(dashed).toEqual({
      ...state,
      style: { ...state.style, strokeStyle: 'dashed' },
    });
    expect(dashed.tool).toBe(state.tool);
    expect(dashed.annotations).toBe(state.annotations);
    expect(dashed.history).toBe(state.history);
  });

  it('changes only the live text size and preserves identity for a repeat', () => {
    const state = createSessionState();
    expect(setTextSize(state, 14)).toBe(state);

    const large = setTextSize(state, 24);
    expect(large).toEqual({
      ...state,
      style: { ...state.style, textSize: 24 },
    });
    expect(large.tool).toBe(state.tool);
    expect(large.annotations).toBe(state.annotations);
    expect(large.history).toBe(state.history);
  });

  it('changes only the live Fill style and preserves identity for a repeat', () => {
    const state = createSessionState();
    expect(setFillStyle(state, 'none')).toBe(state);

    const solid = setFillStyle(state, 'solid');
    expect(solid).toEqual({
      ...state,
      style: { ...state.style, fillStyle: 'solid' },
    });
    expect(solid.tool).toBe(state.tool);
    expect(solid.annotations).toBe(state.annotations);
    expect(solid.history).toBe(state.history);
  });

  it('snapshots Fill for rectangles and ellipses but not other drafts', () => {
    let rectangle = beginGesture(
      setTool(setFillStyle(createSessionState(), 'solid'), 'rect'),
      {
        pointerId: pointer1,
        annotationId: rect1,
        selectionTargetId: targetRect1,
        point: { x: 10, y: 20 },
      },
    );
    rectangle = setFillStyle(rectangle, 'none');
    rectangle = moveGesture(rectangle, {
      pointerId: pointer1,
      point: { x: 50, y: 80 },
      constraint: 'free',
    });
    expect(overlayItems(rectangle).at(-1)).toMatchObject({
      phase: 'preview',
      annotation: { kind: 'rect-preview', fillStyle: 'solid' },
    });
    rectangle = commitGesture(rectangle, pointer1);
    expect(rectangle.style.fillStyle).toBe('none');
    expect(rectangle.annotations[0]).toMatchObject({
      kind: 'rect',
      fillStyle: 'solid',
    });

    let ellipse = beginGesture(
      setTool(setFillStyle(rectangle, 'solid'), 'ellipse'),
      {
        pointerId: pointer1,
        annotationId: ellipse1,
        selectionTargetId: targetEllipse1,
        point: { x: 100, y: 120 },
      },
    );
    ellipse = setFillStyle(ellipse, 'none');
    ellipse = moveGesture(ellipse, {
      pointerId: pointer1,
      point: { x: 160, y: 180 },
      constraint: 'free',
    });
    expect(overlayItems(ellipse).at(-1)).toMatchObject({
      phase: 'preview',
      annotation: { kind: 'ellipse-preview', fillStyle: 'solid' },
    });
    ellipse = commitGesture(ellipse, pointer1);
    expect(ellipse.style.fillStyle).toBe('none');
    expect(ellipse.annotations[1]).toMatchObject({
      kind: 'ellipse',
      fillStyle: 'solid',
    });

    const nonShapeTools: readonly ('arrow' | 'pen')[] = ['arrow', 'pen'];
    for (const tool of nonShapeTools) {
      const drawing = drawingGesture(tool, tool === 'arrow' ? arrow1 : pen1);
      if (drawing.tool.kind !== 'drawing') {
        throw new Error('expected drawing state');
      }
      expect('fillStyle' in drawing.tool.draft).toBe(false);
      const preview = overlayItems(drawing).at(-1);
      if (preview === undefined || preview.phase !== 'preview') {
        throw new Error('expected preview');
      }
      expect('fillStyle' in preview.annotation).toBe(false);
    }

    let textEditing = beginTextDrawing(setTool(ellipse, 'text'), {
      pointerId: pointer1,
      annotationId: text1,
      selectionTargetId: targetText1,
      point: { x: 200, y: 220 },
    });
    textEditing = updateTextDrawing(textEditing, {
      pointerId: pointer1,
      point: { x: 240, y: 260 },
    });
    textEditing = finishTextDrawing(textEditing, pointer1);
    if (textEditing.tool.kind !== 'text-editing') {
      throw new Error('expected text editing state');
    }
    expect('fillStyle' in textEditing.tool.draft).toBe(false);
    const textCommitted = commitTextEdit(updateTextEdit(textEditing, 'text'));
    const committedText = textCommitted.annotations.at(-1);
    if (committedText === undefined) {
      throw new Error('expected committed text');
    }
    expect('fillStyle' in committedText).toBe(false);

    const hovering = setPickerTarget(setTool(textCommitted, 'picker'), {
      kind: 'element',
      target: pickerTarget,
    });
    const highlight = overlayItems(hovering).at(-1);
    if (highlight === undefined) {
      throw new Error('expected picker highlight');
    }
    expect('fillStyle' in highlight).toBe(false);

    const white = committedGesture(
      setColor(setFillStyle(createSessionState(), 'solid'), '#ffffff'),
      'rect',
      rect1,
      pointer1,
      { x: 10, y: 20 },
      [{ x: 30, y: 40 }],
    );
    expect(white.annotations[0]).toMatchObject({
      kind: 'rect',
      color: '#ffffff',
      fillStyle: 'solid',
    });
  });

  it('forces Picker rectangles to none without changing live Fill', () => {
    let state = setFillStyle(createSessionState(), 'solid');
    state = setPickerTarget(setTool(state, 'picker'), {
      kind: 'element',
      target: pickerTarget,
    });
    state = commitPickerTarget(state, {
      rectangleAnnotationId: rectPick1,
      labelAnnotationId: labelPick1,
      selectionTargetId: targetPicker1,
    });

    expect(state.style.fillStyle).toBe('solid');
    expect(state.annotations[0]).toMatchObject({
      kind: 'rect',
      fillStyle: 'none',
    });
    const label = state.annotations[1];
    if (label === undefined) {
      throw new Error('expected Picker label');
    }
    expect('fillStyle' in label).toBe(false);
  });

  it('preserves solid Fill through move, erase, clear, and undo', () => {
    let state = committedGesture(
      setFillStyle(createSessionState(), 'solid'),
      'rect',
      rect1,
      pointer1,
      { x: 10, y: 20 },
      [{ x: 40, y: 60 }],
    );
    state = committedGesture(
      state,
      'ellipse',
      ellipse1,
      pointer1,
      { x: 100, y: 120 },
      [{ x: 160, y: 180 }],
    );
    const original = state.annotations;

    state = beginMove(setTool(state, 'select'), {
      pointerId: pointer1,
      selectionTargetId: targetRect1,
      point: { x: 15, y: 25 },
    });
    state = updateMove(state, {
      pointerId: pointer1,
      point: { x: 22.5, y: 21.75 },
    });
    state = commitMove(state, pointer1);
    expect(state.annotations).toEqual([
      { ...original[0], x: 17.5, y: 16.75 },
      original[1],
    ]);
    expect(
      state.annotations.map((annotation) =>
        'fillStyle' in annotation ? annotation.fillStyle : null,
      ),
    ).toEqual(['solid', 'solid']);
    state = undoSession(state);
    expect(state.annotations).toEqual(original);

    state = eraseAnnotation(setTool(state, 'eraser'), ellipse1);
    expect(state.annotations).toEqual([original[0]]);
    state = undoSession(state);
    expect(state.annotations).toEqual(original);

    state = clearSession(state);
    expect(state.annotations).toEqual([]);
    state = undoSession(state);
    expect(state.annotations).toEqual(original);
  });

  it('maps every tool state to its exact overlay cursor', () => {
    expect(overlayCursor(createSessionState())).toBe('auto');
    expect(overlayCursor(setTool(createSessionState(), 'select'))).toBe(
      'default',
    );
    expect(overlayCursor(setTool(createSessionState(), 'rect'))).toBe(
      'crosshair',
    );
    expect(overlayCursor(setTool(createSessionState(), 'ellipse'))).toBe(
      'crosshair',
    );
    expect(overlayCursor(setTool(createSessionState(), 'arrow'))).toBe(
      'crosshair',
    );
    expect(overlayCursor(setTool(createSessionState(), 'pen'))).toBe(
      'crosshair',
    );
    expect(overlayCursor(setTool(createSessionState(), 'text'))).toBe(
      'crosshair',
    );
    expect(overlayCursor(setTool(createSessionState(), 'picker'))).toBe('cell');
    expect(overlayCursor(setTool(createSessionState(), 'eyedropper'))).toBe(
      'crosshair',
    );
    expect(overlayCursor(setTool(createSessionState(), 'eraser'))).toBe(
      'not-allowed',
    );
  });

  it('commits a sampled pixel with the live stroke in one add op', () => {
    const armed = setStrokeStyle(
      setStrokeWidth(setTool(createSessionState(), 'eyedropper'), 4),
      'dotted',
    );
    const state = commitColorSample(armed, {
      annotationId: colorSample1,
      selectionTargetId: targetColorSample1,
      point: { x: 135.5, y: 248.25 },
      sampledColor: SampledColorSchema.parse('#0F80FF'),
    });
    const annotation = {
      id: 'color-sample-1',
      selectionTargetId: 'target-color-sample-1',
      kind: 'color-sample',
      x: 135.5,
      y: 248.25,
      sampledColor: '#0F80FF',
      strokeWidth: 4,
      strokeStyle: 'dotted',
    };

    expect(state).toEqual({
      ...armed,
      tool: { kind: 'eyedropper-armed' },
      annotations: [annotation],
      history: [{ type: 'add', annotations: [annotation] }],
    });
    expect(overlayItems(state)).toEqual([
      {
        phase: 'committed',
        annotation,
        opacity: 1,
        selectionAffordance: 'none',
      },
    ]);
    expect(undoSession(state)).toEqual(armed);
  });

  it('arms Select without changing Interact', () => {
    const interact = createSessionState();
    const selected = setTool(interact, 'select');

    expect(selected.tool).toEqual({ kind: 'select-armed' });
    expect(activeTool(selected)).toBe('select');
    expect(overlayCursor(selected)).toBe('default');
    expect(activeTool(interact)).toBe('interact');
    expect(overlayCursor(interact)).toBe('auto');
    expect(setTool(selected, 'select')).toBe(selected);
  });

  it('creation snapshots one stable Selection target id per ordinary Annotation and one shared id per Picker pair', () => {
    let state = committedGesture(
      createSessionState(),
      'rect',
      rect1,
      pointer1,
      { x: 10, y: 20 },
      [{ x: 50, y: 80 }],
    );
    state = beginTextDrawing(setTool(state, 'text'), {
      pointerId: pointer1,
      annotationId: text1,
      selectionTargetId: targetText1,
      point: { x: 70, y: 90 },
    });
    state = updateTextDrawing(state, {
      pointerId: pointer1,
      point: { x: 110, y: 130 },
    });
    state = finishTextDrawing(state, pointer1);
    state = commitTextEdit(updateTextEdit(state, 'text'));
    state = setPickerTarget(setTool(state, 'picker'), {
      kind: 'element',
      target: pickerTarget,
    });
    state = commitPickerTarget(state, {
      rectangleAnnotationId: rectPick1,
      labelAnnotationId: labelPick1,
      selectionTargetId: targetPicker1,
    });

    expect(
      state.annotations.map((annotation) => annotation.selectionTargetId),
    ).toEqual([targetRect1, targetText1, targetPicker1, targetPicker1]);
    expect(state.annotations[2]?.id).not.toBe(state.annotations[3]?.id);
    expect(state.history).toEqual([
      { type: 'add', annotations: [state.annotations[0]] },
      { type: 'add', annotations: [state.annotations[1]] },
      {
        type: 'add',
        annotations: [state.annotations[2], state.annotations[3]],
      },
    ]);
  });

  it('carries the picker svelte loc onto the committed label', () => {
    const locTarget = PickerTargetSchema.parse({
      ...pickerTarget,
      svelteLoc: 'src/App.svelte:852',
    });
    let state = setPickerTarget(setTool(createSessionState(), 'picker'), {
      kind: 'element',
      target: locTarget,
    });
    state = commitPickerTarget(state, {
      rectangleAnnotationId: rectPick1,
      labelAnnotationId: labelPick1,
      selectionTargetId: targetPicker1,
    });

    expect(state.annotations[0]).not.toHaveProperty('svelteLoc');
    expect(state.annotations[1]).toMatchObject({
      kind: 'label',
      text: 'a.nav-link',
      svelteLoc: 'src/App.svelte:852',
    });
  });

  it('re-highlights when only the svelte loc changes', () => {
    const locTarget = PickerTargetSchema.parse({
      ...pickerTarget,
      svelteLoc: 'src/App.svelte:852',
    });
    const state = setPickerTarget(setTool(createSessionState(), 'picker'), {
      kind: 'element',
      target: pickerTarget,
    });
    const next = setPickerTarget(state, {
      kind: 'element',
      target: locTarget,
    });

    expect(next).not.toBe(state);
    expect(next.tool).toEqual({ kind: 'picker-hovering', target: locTarget });
  });

  it('draws a normalized bounded Text box before editing', () => {
    const armed = setTextSize(
      setColor(setTool(createSessionState(), 'text'), '#e03131'),
      24,
    );
    let state = beginTextDrawing(armed, {
      pointerId: pointer1,
      annotationId: text1,
      selectionTargetId: targetText1,
      point: { x: 260, y: 180 },
    });

    expect(state).toEqual({
      ...armed,
      tool: {
        kind: 'text-drawing',
        draft: {
          pointerId: 1,
          annotationId: 'text-1',
          selectionTargetId: 'target-text-1',
          origin: { x: 260, y: 180 },
          current: { x: 260, y: 180 },
          color: '#e03131',
          size: 24,
        },
      },
    });
    expect(activeTool(state)).toBe('text');
    expect(overlayCursor(state)).toBe('crosshair');
    expect(
      updateTextDrawing(state, {
        pointerId: pointer2,
        point: { x: 100, y: 120 },
      }),
    ).toBe(state);
    expect(finishTextDrawing(state, pointer2)).toBe(state);
    expect(cancelTextDrawing(state, pointer2)).toBe(state);

    state = updateTextDrawing(state, {
      pointerId: pointer1,
      point: { x: 100, y: 120 },
    });
    expect(overlayItems(state)).toEqual([
      {
        phase: 'preview',
        opacity: 1,
        annotation: {
          id: 'text-1',
          kind: 'text-box-preview',
          x: 100,
          y: 120,
          width: 160,
          height: 60,
          color: '#e03131',
        },
      },
    ]);

    state = finishTextDrawing(state, pointer1);
    expect(state.tool).toEqual({
      kind: 'text-editing',
      draft: {
        annotationId: 'text-1',
        selectionTargetId: 'target-text-1',
        x: 100,
        y: 120,
        width: 160,
        minimumHeight: 60,
        text: '',
        color: '#e03131',
        size: 24,
      },
    });
    expect(overlayCursor(state)).toBe('text');
    const preview = overlayItems(state);
    expect(preview).toEqual([
      {
        phase: 'preview',
        opacity: 1,
        annotation: {
          id: 'text-1',
          kind: 'text-preview',
          x: 100,
          y: 120,
          width: 160,
          minimumHeight: 60,
          text: '',
          color: '#e03131',
          size: 24,
        },
      },
    ]);
    const previewItem = preview[0];
    if (previewItem === undefined || previewItem.phase !== 'preview') {
      throw new Error('expected Text preview');
    }
    expect(previewItem.annotation).not.toHaveProperty('lines');
    expect(previewItem.annotation).not.toHaveProperty('displayHeight');
  });

  it('discards invalid and cancelled Text boxes without annotations or history', () => {
    const armed = setTextSize(setTool(createSessionState(), 'text'), 24);
    const start = (point: DocumentPoint): SessionState =>
      beginTextDrawing(armed, {
        pointerId: pointer1,
        annotationId: text1,
        selectionTargetId: targetText1,
        point,
      });
    const finishAt = (point: DocumentPoint): SessionState =>
      finishTextDrawing(
        updateTextDrawing(start({ x: 100, y: 120 }), {
          pointerId: pointer1,
          point,
        }),
        pointer1,
      );

    for (const state of [
      finishAt({ x: 100, y: 120 }),
      finishAt({ x: 140, y: 120 }),
      finishAt({ x: 123, y: 160 }),
    ]) {
      expect(state).toEqual(armed);
      expect(state.annotations).toEqual([]);
      expect(state.history).toEqual([]);
      expect(overlayItems(state)).toEqual([]);
    }

    const drawing = updateTextDrawing(start({ x: 260, y: 180 }), {
      pointerId: pointer1,
      point: { x: 100, y: 120 },
    });
    expect(undoSession(drawing)).toBe(drawing);
    expect(clearSession(drawing)).toBe(drawing);
    expect(cancelTextDrawing(drawing, pointer1)).toEqual(armed);
    expect(escapeSession(drawing)).toEqual({
      kind: 'state-changed',
      state: armed,
    });
  });

  it('preserves exact authored Text and commits one bounded add operation', () => {
    const armed = setTextSize(
      setStrokeStyle(
        setStrokeWidth(
          setColor(setTool(createSessionState(), 'text'), '#e03131'),
          6,
        ),
        'dashed',
      ),
      24,
    );
    let editing = beginTextDrawing(armed, {
      pointerId: pointer1,
      annotationId: text1,
      selectionTargetId: targetText1,
      point: { x: 260, y: 180 },
    });
    editing = updateTextDrawing(editing, {
      pointerId: pointer1,
      point: { x: 100, y: 120 },
    });
    editing = finishTextDrawing(editing, pointer1);
    editing = updateTextEdit(editing, 'alpha  beta\n\nselector#long');

    expect(setColor(editing, '#1e1e1e')).toBe(editing);
    expect(setFillStyle(editing, 'solid')).toBe(editing);
    expect(setStrokeWidth(editing, 2)).toBe(editing);
    expect(setStrokeStyle(editing, 'solid')).toBe(editing);
    expect(setTextSize(editing, 14)).toBe(editing);
    expect(setTool(editing, 'rect')).toBe(editing);
    expect(undoSession(editing)).toBe(editing);
    expect(clearSession(editing)).toBe(editing);
    expect(updateTextEdit(editing, 'alpha  beta\n\nselector#long')).toBe(
      editing,
    );

    const committed = commitTextEdit(editing);
    const annotation = {
      id: 'text-1',
      selectionTargetId: 'target-text-1',
      kind: 'text',
      x: 100,
      y: 120,
      width: 160,
      minimumHeight: 60,
      text: 'alpha  beta\n\nselector#long',
      color: '#e03131',
      size: 24,
    };
    expect(committed).toEqual({
      ...armed,
      annotations: [annotation],
      history: [{ type: 'add', annotations: [annotation] }],
    });
    expect(undoSession(committed)).toEqual(armed);

    const empty = finishTextDrawing(
      updateTextDrawing(
        beginTextDrawing(armed, {
          pointerId: pointer1,
          annotationId: text1,
          selectionTargetId: targetText1,
          point: { x: 100, y: 120 },
        }),
        { pointerId: pointer1, point: { x: 140, y: 160 } },
      ),
      pointer1,
    );
    expect(commitTextEdit(empty)).toEqual(armed);
    const whitespace = commitTextEdit(updateTextEdit(empty, ' \n '));
    expect(whitespace.annotations[0]).toMatchObject({
      width: 40,
      minimumHeight: 40,
      text: ' \n ',
    });
    expect(whitespace.history).toEqual([
      { type: 'add', annotations: whitespace.annotations },
    ]);

    const interact = createSessionState();
    expect(updateTextEdit(interact, 'first')).toBe(interact);
    expect(commitTextEdit(interact)).toBe(interact);
  });

  it('moves bounded Text without reflow and follows the exact Escape ladder', () => {
    let drawing = beginTextDrawing(
      setTextSize(setTool(createSessionState(), 'text'), 24),
      {
        pointerId: pointer1,
        annotationId: text1,
        selectionTargetId: targetText1,
        point: { x: 100, y: 120 },
      },
    );
    drawing = updateTextDrawing(drawing, {
      pointerId: pointer1,
      point: { x: 260, y: 180 },
    });
    const editing = updateTextEdit(
      finishTextDrawing(drawing, pointer1),
      'alpha  beta\n\nselector#long',
    );
    const escapedEditing = escapeSession(editing);
    if (escapedEditing.kind !== 'state-changed') {
      throw new Error('expected state change');
    }
    const committed = escapedEditing.state;
    const original = committed.annotations[0];
    if (original === undefined) {
      throw new Error('expected committed Text');
    }

    let moving = beginMove(setTool(committed, 'select'), {
      pointerId: pointer1,
      selectionTargetId: targetText1,
      point: { x: 110, y: 130 },
    });
    moving = updateMove(moving, {
      pointerId: pointer1,
      point: { x: 117.5, y: 126.75 },
    });
    expect(overlayItems(moving)).toEqual([
      {
        phase: 'move-preview',
        annotation: { ...original, x: 107.5, y: 116.75 },
        opacity: 1,
        selectionAffordance: 'selected',
      },
    ]);
    const moved = commitMove(moving, pointer1);
    expect(moved.annotations).toEqual([{ ...original, x: 107.5, y: 116.75 }]);
    expect(moved.annotations[0]).toMatchObject({
      width: 160,
      minimumHeight: 60,
      text: 'alpha  beta\n\nselector#long',
      id: text1,
      selectionTargetId: targetText1,
      color: '#e03131',
      size: 24,
    });
    expect(undoSession(moved).annotations).toEqual([original]);

    const escapedDrawing = escapeSession(drawing);
    expect(escapedDrawing).toMatchObject({
      kind: 'state-changed',
      state: { tool: { kind: 'text-armed' } },
    });
    expect(escapeSession(finishTextDrawing(drawing, pointer1))).toMatchObject({
      kind: 'state-changed',
      state: { tool: { kind: 'text-armed' }, annotations: [] },
    });
    const armed = escapeSession(committed);
    expect(armed).toMatchObject({
      kind: 'state-changed',
      state: { tool: { kind: 'interact' } },
    });
    if (armed.kind !== 'state-changed') {
      throw new Error('expected state change');
    }
    expect(escapeSession(armed.state)).toEqual({ kind: 'teardown' });
  });

  it('arms picker hover with one live topmost highlight and stable identity', () => {
    const armed = setTool(createSessionState(), 'picker');
    expect(armed.tool).toEqual({ kind: 'picker-armed' });
    expect(activeTool(armed)).toBe('picker');
    expect(setPickerTarget(armed, { kind: 'none' })).toBe(armed);

    const hovering = setPickerTarget(armed, {
      kind: 'element',
      target: pickerTarget,
    });
    expect(activeTool(hovering)).toBe('picker');
    expect(hovering).toEqual({
      ...armed,
      tool: { kind: 'picker-hovering', target: pickerTarget },
    });
    expect(overlayItems(hovering)).toEqual([
      {
        phase: 'picker-highlight',
        target: pickerTarget,
        color: '#e03131',
        strokeWidth: 2,
        strokeStyle: 'solid',
      },
    ]);
    expect(hovering.annotations).toEqual([]);
    expect(hovering.history).toEqual([]);
    expect(
      setPickerTarget(hovering, { kind: 'element', target: pickerTarget }),
    ).toBe(hovering);
    expect(setPickerTarget(hovering, { kind: 'none' })).toEqual(armed);
  });

  it('commits a live-styled picker rectangle and label in one add op', () => {
    let state = setPickerTarget(setTool(createSessionState(), 'picker'), {
      kind: 'element',
      target: pickerTarget,
    });
    state = setStrokeStyle(
      setStrokeWidth(setColor(state, '#2f9e44'), 4),
      'dotted',
    );

    expect(overlayItems(state)).toEqual([
      {
        phase: 'picker-highlight',
        target: pickerTarget,
        color: '#2f9e44',
        strokeWidth: 4,
        strokeStyle: 'dotted',
      },
    ]);

    state = commitPickerTarget(state, {
      rectangleAnnotationId: rectPick1,
      labelAnnotationId: labelPick1,
      selectionTargetId: targetPicker1,
    });
    const rectangle = {
      id: 'rect-pick-1',
      selectionTargetId: 'target-picker-1',
      kind: 'rect',
      x: 10,
      y: 20,
      w: 120,
      h: 30,
      color: '#2f9e44',
      strokeWidth: 4,
      strokeStyle: 'dotted',
      fillStyle: 'none',
    };
    const label = {
      id: 'label-pick-1',
      selectionTargetId: 'target-picker-1',
      kind: 'label',
      x: 10,
      y: 20,
      text: 'a.nav-link',
      color: '#2f9e44',
    };
    expect(state).toEqual({
      tool: { kind: 'picker-armed' },
      style: {
        color: '#2f9e44',
        strokeWidth: 4,
        strokeStyle: 'dotted',
        textSize: 14,
        fillStyle: 'none',
      },
      annotations: [rectangle, label],
      history: [{ type: 'add', annotations: [rectangle, label] }],
    });
    expect(undoSession(state)).toMatchObject({ annotations: [], history: [] });
  });

  it('preserves identity when picker commit is not hovering', () => {
    const interact = createSessionState();
    const armed = setTool(interact, 'picker');
    const input = {
      rectangleAnnotationId: rectPick1,
      labelAnnotationId: labelPick1,
      selectionTargetId: targetPicker1,
    };
    expect(commitPickerTarget(interact, input)).toBe(interact);
    expect(commitPickerTarget(armed, input)).toBe(armed);
  });

  it('erases a committed picker label and restores its exact index', () => {
    let state = committedGesture(
      createSessionState(),
      'rect',
      rect1,
      pointer1,
      { x: 0, y: 0 },
      [{ x: 5, y: 5 }],
    );
    state = setPickerTarget(setTool(state, 'picker'), {
      kind: 'element',
      target: pickerTarget,
    });
    state = commitPickerTarget(state, {
      rectangleAnnotationId: rectPick1,
      labelAnnotationId: labelPick1,
      selectionTargetId: targetPicker1,
    });
    const original = state.annotations;
    state = setEraserTarget(setTool(state, 'eraser'), {
      kind: 'annotation',
      annotationId: labelPick1,
    });
    expect(
      overlayItems(state).map((item) =>
        'opacity' in item ? item.opacity : null,
      ),
    ).toEqual([1, 1, 0.4]);

    state = eraseAnnotation(state, labelPick1);
    expect(state.annotations.map((annotation) => annotation.id)).toEqual([
      rect1,
      rectPick1,
    ]);
    expect(state.history.at(-1)).toMatchObject({
      type: 'delete',
      annotation: { id: labelPick1, kind: 'label' },
      index: 2,
    });
    expect(undoSession(state).annotations).toEqual(original);
  });

  it('escapes picker hover to interact without a highlight, then tears down', () => {
    const hovering = setPickerTarget(setTool(createSessionState(), 'picker'), {
      kind: 'element',
      target: pickerTarget,
    });
    const interact = escapeSession(hovering);
    expect(interact).toMatchObject({
      kind: 'state-changed',
      state: { tool: { kind: 'interact' } },
    });
    if (interact.kind !== 'state-changed') {
      throw new Error('expected state change');
    }
    expect(overlayItems(interact.state)).toEqual([]);
    expect(escapeSession(interact.state)).toEqual({ kind: 'teardown' });
  });

  it('commits a styled rectangle and exposes its preview', () => {
    let state = createSessionState();
    state = setTool(state, 'rect');
    state = setColor(state, '#e03131');
    state = setStrokeWidth(state, 4);
    state = beginGesture(state, {
      pointerId: pointer1,
      annotationId: rect1,
      selectionTargetId: targetRect1,
      point: { x: 10, y: 20 },
    });
    state = moveGesture(state, {
      pointerId: pointer1,
      point: { x: 50, y: 80 },
      constraint: 'free',
    });

    expect(overlayItems(state)).toEqual([
      {
        phase: 'preview',
        opacity: 1,
        annotation: {
          id: 'rect-1',
          kind: 'rect-preview',
          x: 10,
          y: 20,
          w: 40,
          h: 60,
          color: '#e03131',
          strokeWidth: 4,
          strokeStyle: 'solid',
          fillStyle: 'none',
        },
      },
    ]);

    state = commitGesture(state, pointer1);

    const annotation = {
      id: 'rect-1',
      selectionTargetId: 'target-rect-1',
      kind: 'rect',
      x: 10,
      y: 20,
      w: 40,
      h: 60,
      color: '#e03131',
      strokeWidth: 4,
      strokeStyle: 'solid',
      fillStyle: 'none',
    };
    expect(state).toEqual({
      tool: { kind: 'rect-armed' },
      style: {
        color: '#e03131',
        strokeWidth: 4,
        strokeStyle: 'solid',
        textSize: 14,
        fillStyle: 'none',
      },
      annotations: [annotation],
      history: [{ type: 'add', annotations: [annotation] }],
    });
    expect(overlayItems(state)).toEqual([
      {
        phase: 'committed',
        annotation,
        opacity: 1,
        selectionAffordance: 'none',
      },
    ]);
  });

  it('snapshots style when a rectangle begins', () => {
    let state = setStrokeStyle(
      setStrokeWidth(
        setColor(setTool(createSessionState(), 'rect'), '#e03131'),
        4,
      ),
      'dashed',
    );
    state = beginGesture(state, {
      pointerId: pointer1,
      annotationId: rect1,
      selectionTargetId: targetRect1,
      point: { x: 10, y: 20 },
    });
    state = setStrokeStyle(
      setStrokeWidth(setColor(state, '#1971c2'), 6),
      'dotted',
    );
    state = moveGesture(state, {
      pointerId: pointer1,
      point: { x: 50, y: 80 },
      constraint: 'free',
    });
    state = commitGesture(state, pointer1);

    expect(state.annotations[0]).toMatchObject({
      color: '#e03131',
      strokeWidth: 4,
      strokeStyle: 'dashed',
    });
    expect(state.style).toEqual({
      color: '#1971c2',
      strokeWidth: 6,
      strokeStyle: 'dotted',
      textSize: 14,
      fillStyle: 'none',
    });
  });

  it('commits every new S3 gesture with one add op', () => {
    const ellipse = {
      id: 'ellipse-1',
      selectionTargetId: 'target-ellipse-1',
      kind: 'ellipse',
      cx: 30,
      cy: 50,
      rx: 20,
      ry: 30,
      color: '#e03131',
      strokeWidth: 2,
      strokeStyle: 'solid',
      fillStyle: 'none',
    };
    const arrow = {
      id: 'arrow-1',
      selectionTargetId: 'target-arrow-1',
      kind: 'arrow',
      x1: 10,
      y1: 20,
      x2: 50,
      y2: 80,
      color: '#e03131',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };
    const pen = {
      id: 'pen-1',
      selectionTargetId: 'target-pen-1',
      kind: 'pen',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 6, y: 2 },
        { x: 8, y: 4 },
      ],
      color: '#e03131',
      strokeWidth: 2,
      strokeStyle: 'solid',
    };
    const cases = [
      {
        state: committedGesture(
          createSessionState(),
          'ellipse',
          ellipse1,
          pointer1,
          { x: 10, y: 20 },
          [{ x: 50, y: 80 }],
        ),
        armed: 'ellipse-armed',
        annotation: ellipse,
      },
      {
        state: committedGesture(
          createSessionState(),
          'arrow',
          arrow1,
          pointer1,
          { x: 10, y: 20 },
          [{ x: 50, y: 80 }],
        ),
        armed: 'arrow-armed',
        annotation: arrow,
      },
      {
        state: committedGesture(
          createSessionState(),
          'pen',
          pen1,
          pointer1,
          { x: 0, y: 0 },
          [
            { x: 1, y: 0 },
            { x: 4, y: 0 },
            { x: 8, y: 4 },
          ],
        ),
        armed: 'pen-armed',
        annotation: pen,
      },
    ];

    for (const testCase of cases) {
      expect(testCase.state.tool).toEqual({ kind: testCase.armed });
      expect(testCase.state.annotations).toEqual([testCase.annotation]);
      expect(testCase.state.history).toEqual([
        { type: 'add', annotations: [testCase.annotation] },
      ]);
    }
  });

  it('preserves dotted ellipse, arrow, and pen snapshots through history', () => {
    function verifySnapshot(
      tool: DrawingTool,
      annotationId: AnnotationId,
    ): void {
      let state = beginGesture(
        setTool(setStrokeStyle(createSessionState(), 'dotted'), tool),
        {
          pointerId: pointer1,
          annotationId,
          selectionTargetId: selectionTargetIdForTool(tool),
          point: { x: 10, y: 20 },
        },
      );
      expect(state.tool).toMatchObject({
        kind: 'drawing',
        draft: { strokeStyle: 'dotted' },
      });

      state = setStrokeStyle(state, 'solid');
      state = moveGesture(state, {
        pointerId: pointer1,
        point: { x: 50, y: 80 },
        constraint: 'free',
      });
      expect(overlayItems(state).at(-1)).toMatchObject({
        phase: 'preview',
        annotation: { strokeStyle: 'dotted' },
      });

      state = commitGesture(state, pointer1);
      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0]).toMatchObject({ strokeStyle: 'dotted' });
      expect(state.history).toEqual([
        { type: 'add', annotations: state.annotations },
      ]);
      expect(undoSession(state)).toMatchObject({
        annotations: [],
        history: [],
      });

      const cleared = clearSession(state);
      expect(cleared.history.at(-1)).toEqual({
        type: 'clear',
        annotations: state.annotations,
      });
      expect(undoSession(cleared).annotations).toEqual(state.annotations);
    }

    verifySnapshot('ellipse', ellipse1);
    verifySnapshot('arrow', arrow1);
    verifySnapshot('pen', pen1);
  });

  it('exposes one preview without committing it', () => {
    let ellipse = drawingGesture('ellipse', ellipse1);
    ellipse = moveGesture(ellipse, {
      pointerId: pointer1,
      point: { x: 50, y: 80 },
      constraint: 'equal-axes',
    });
    let arrow = drawingGesture('arrow', arrow1);
    arrow = moveGesture(arrow, {
      pointerId: pointer1,
      point: { x: 50, y: 80 },
      constraint: 'equal-axes',
    });
    let pen = drawingGesture('pen', pen1);
    pen = moveGesture(pen, {
      pointerId: pointer1,
      point: { x: 30, y: 40 },
      constraint: 'equal-axes',
    });

    expect(overlayItems(ellipse)).toEqual([
      {
        phase: 'preview',
        opacity: 1,
        annotation: {
          id: 'ellipse-1',
          kind: 'ellipse-preview',
          cx: 40,
          cy: 50,
          rx: 30,
          ry: 30,
          color: '#e03131',
          strokeWidth: 2,
          strokeStyle: 'solid',
          fillStyle: 'none',
        },
      },
    ]);
    expect(overlayItems(arrow)).toEqual([
      {
        phase: 'preview',
        opacity: 1,
        annotation: {
          id: 'arrow-1',
          kind: 'arrow-preview',
          x1: 10,
          y1: 20,
          x2: 50,
          y2: 80,
          color: '#e03131',
          strokeWidth: 2,
          strokeStyle: 'solid',
        },
      },
    ]);
    expect(overlayItems(pen)).toEqual([
      {
        phase: 'preview',
        opacity: 1,
        annotation: {
          id: 'pen-1',
          kind: 'pen-preview',
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
          color: '#e03131',
          strokeWidth: 2,
          strokeStyle: 'solid',
        },
      },
    ]);
    expect(ellipse.annotations).toEqual([]);
    expect(arrow.annotations).toEqual([]);
    expect(pen.annotations).toEqual([]);
  });

  it('returns the exact state for non-owning pointer commands', () => {
    const state = drawingGesture('rect', rect1);

    expect(
      moveGesture(state, {
        pointerId: pointer2,
        point: { x: 50, y: 80 },
        constraint: 'free',
      }),
    ).toBe(state);
    expect(commitGesture(state, pointer2)).toBe(state);
    expect(cancelGesture(state, pointer2)).toBe(state);
  });

  it('eraser hovers one annotation, deletes it, and undo restores exact z-order', () => {
    let state = createSessionState();
    state = committedGesture(state, 'rect', rect1, pointer1, { x: 10, y: 20 }, [
      { x: 50, y: 80 },
    ]);
    state = committedGesture(
      state,
      'ellipse',
      ellipse1,
      pointer1,
      { x: 100, y: 120 },
      [{ x: 160, y: 180 }],
    );
    state = committedGesture(
      state,
      'arrow',
      arrow1,
      pointer1,
      { x: 200, y: 220 },
      [{ x: 260, y: 280 }],
    );
    state = committedGesture(state, 'pen', pen1, pointer1, { x: 300, y: 320 }, [
      { x: 360, y: 380 },
    ]);
    const original = JSON.stringify(state.annotations);
    state = setTool(state, 'eraser');
    state = setEraserTarget(state, {
      kind: 'annotation',
      annotationId: arrow1,
    });

    expect(
      overlayItems(state).map((item) =>
        'opacity' in item ? item.opacity : null,
      ),
    ).toEqual([1, 1, 0.4, 1]);

    const arrow = state.annotations[2];
    state = eraseAnnotation(state, arrow1);
    expect(state.annotations.map((annotation) => annotation.id)).toEqual([
      rect1,
      ellipse1,
      pen1,
    ]);
    expect(state.history.at(-1)).toEqual({
      type: 'delete',
      annotation: arrow,
      index: 2,
    });

    state = undoSession(state);
    expect(JSON.stringify(state.annotations)).toBe(original);
  });

  it('undoes each S3 add kind', () => {
    const cases = [
      committedGesture(
        createSessionState(),
        'rect',
        rect1,
        pointer1,
        { x: 10, y: 20 },
        [{ x: 50, y: 80 }],
      ),
      committedGesture(
        createSessionState(),
        'ellipse',
        ellipse1,
        pointer1,
        { x: 10, y: 20 },
        [{ x: 50, y: 80 }],
      ),
      committedGesture(
        createSessionState(),
        'arrow',
        arrow1,
        pointer1,
        { x: 10, y: 20 },
        [{ x: 50, y: 80 }],
      ),
      committedGesture(
        createSessionState(),
        'pen',
        pen1,
        pointer1,
        { x: 10, y: 20 },
        [{ x: 50, y: 80 }],
      ),
    ];

    for (const state of cases) {
      expect(undoSession(state)).toMatchObject({
        annotations: [],
        history: [],
      });
    }
  });

  it('clears mixed annotations and restores order', () => {
    let state = createSessionState();
    state = committedGesture(state, 'rect', rect1, pointer1, { x: 10, y: 20 }, [
      { x: 50, y: 80 },
    ]);
    state = committedGesture(
      state,
      'ellipse',
      ellipse1,
      pointer1,
      { x: 100, y: 120 },
      [{ x: 160, y: 180 }],
    );
    state = committedGesture(
      state,
      'arrow',
      arrow1,
      pointer1,
      { x: 200, y: 220 },
      [{ x: 260, y: 280 }],
    );
    state = committedGesture(state, 'pen', pen1, pointer1, { x: 300, y: 320 }, [
      { x: 360, y: 380 },
    ]);
    const annotations = state.annotations;

    const cleared = clearSession(state);
    expect(cleared.annotations).toEqual([]);
    expect(cleared.history.at(-1)).toEqual({ type: 'clear', annotations });

    const restored = undoSession(cleared);
    expect(restored.annotations).toEqual(annotations);
    expect(restored.history).toEqual(state.history);
  });

  it('discards every degenerate gesture without history', () => {
    const cases = [
      committedGesture(
        createSessionState(),
        'rect',
        rect1,
        pointer1,
        { x: 10, y: 20 },
        [{ x: 10, y: 80 }],
      ),
      committedGesture(
        createSessionState(),
        'ellipse',
        ellipse1,
        pointer1,
        { x: 10, y: 20 },
        [{ x: 10, y: 80 }],
      ),
      committedGesture(
        createSessionState(),
        'arrow',
        arrow1,
        pointer1,
        { x: 10, y: 20 },
        [{ x: 10, y: 20 }],
      ),
      committedGesture(
        createSessionState(),
        'pen',
        pen1,
        pointer1,
        { x: 10, y: 20 },
        [{ x: 10, y: 20 }],
      ),
    ];

    for (const state of cases) {
      expect(state.annotations).toEqual([]);
      expect(state.history).toEqual([]);
    }
  });

  it('leaves the exact state unchanged for undo and clear during a draft', () => {
    const state = drawingGesture('rect', rect1);

    expect(undoSession(state)).toBe(state);
    expect(clearSession(state)).toBe(state);
  });

  it('applies the exact Escape ladder to every S3 draft and eraser hover', () => {
    const drafts = [
      { state: drawingGesture('rect', rect1), armed: 'rect-armed' },
      { state: drawingGesture('ellipse', ellipse1), armed: 'ellipse-armed' },
      { state: drawingGesture('arrow', arrow1), armed: 'arrow-armed' },
      { state: drawingGesture('pen', pen1), armed: 'pen-armed' },
    ];

    for (const draft of drafts) {
      expect(escapeSession(draft.state)).toMatchObject({
        kind: 'state-changed',
        state: { tool: { kind: draft.armed } },
      });
    }

    let eraser = committedGesture(
      createSessionState(),
      'rect',
      rect1,
      pointer1,
      { x: 10, y: 20 },
      [{ x: 50, y: 80 }],
    );
    eraser = setTool(eraser, 'eraser');
    eraser = setEraserTarget(eraser, {
      kind: 'annotation',
      annotationId: rect1,
    });
    expect(escapeSession(eraser)).toMatchObject({
      kind: 'state-changed',
      state: { tool: { kind: 'interact' } },
    });

    const armed = escapeSession(drawingGesture('rect', rect1));
    if (armed.kind !== 'state-changed') {
      throw new Error('expected state change');
    }
    const interact = escapeSession(armed.state);
    if (interact.kind !== 'state-changed') {
      throw new Error('expected state change');
    }
    expect(escapeSession(interact.state)).toEqual({ kind: 'teardown' });
  });

  it('direct selection previews and commits one exact move', () => {
    let state = committedGesture(
      createSessionState(),
      'rect',
      rect1,
      pointer1,
      { x: 10, y: 20 },
      [{ x: 40, y: 60 }],
    );
    const originalAnnotations = state.annotations;
    const original = state.annotations[0];
    if (original === undefined) {
      throw new Error('expected rectangle');
    }
    state = beginMove(setTool(state, 'select'), {
      pointerId: pointer1,
      selectionTargetId: targetRect1,
      point: { x: 15, y: 25 },
    });
    state = updateMove(state, {
      pointerId: pointer1,
      point: { x: 18, y: 24 },
    });
    state = updateMove(state, {
      pointerId: pointer1,
      point: { x: 22.5, y: 20 },
    });

    expect(state.annotations).toBe(originalAnnotations);
    expect(state.annotations[0]).toBe(original);
    expect(overlayItems(state)).toEqual([
      {
        phase: 'move-preview',
        annotation: { ...original, x: 17.5, y: 15 },
        opacity: 1,
        selectionAffordance: 'selected',
      },
    ]);

    state = commitMove(state, pointer1);
    const translated = { ...original, x: 17.5, y: 15 };
    expect(state.tool).toEqual({
      kind: 'select-selected',
      selectionTargetId: targetRect1,
    });
    expect(state.annotations).toEqual([translated]);
    expect(state.history.at(-1)).toEqual({
      type: 'move',
      before: [original],
      after: [translated],
    });
  });

  it('zero, cancelled, escaped, and foreign-pointer moves create no Op', () => {
    const committed = committedGesture(
      createSessionState(),
      'rect',
      rect1,
      pointer1,
      { x: 10, y: 20 },
      [{ x: 40, y: 60 }],
    );
    const armed = setTool(committed, 'select');
    const dragging = beginMove(armed, {
      pointerId: pointer1,
      selectionTargetId: targetRect1,
      point: { x: 15, y: 25 },
    });
    expect(
      updateMove(dragging, {
        pointerId: pointer2,
        point: { x: 20, y: 30 },
      }),
    ).toBe(dragging);
    expect(commitMove(dragging, pointer2)).toBe(dragging);
    expect(cancelMove(dragging, pointer2)).toBe(dragging);

    const zero = commitMove(dragging, pointer1);
    expect(zero.annotations).toBe(committed.annotations);
    expect(zero.history).toBe(committed.history);
    expect(zero.tool).toEqual({
      kind: 'select-selected',
      selectionTargetId: targetRect1,
    });

    const moved = updateMove(dragging, {
      pointerId: pointer1,
      point: { x: 30, y: 40 },
    });
    const cancelled = cancelMove(moved, pointer1);
    expect(cancelled.annotations).toBe(committed.annotations);
    expect(cancelled.history).toBe(committed.history);
    expect(cancelled.tool).toEqual(zero.tool);

    const escaped = escapeSession(moved);
    expect(escaped).toEqual({ kind: 'state-changed', state: cancelled });
  });

  it('Picker pair movement is atomic from either member', () => {
    let state = committedGesture(
      createSessionState(),
      'ellipse',
      ellipse1,
      pointer1,
      { x: 0, y: 0 },
      [{ x: 10, y: 20 }],
    );
    state = setPickerTarget(setTool(state, 'picker'), {
      kind: 'element',
      target: pickerTarget,
    });
    state = commitPickerTarget(state, {
      rectangleAnnotationId: rectPick1,
      labelAnnotationId: labelPick1,
      selectionTargetId: targetPicker1,
    });
    const beforeAnnotations = state.annotations;
    const beforePair = state.annotations.filter(
      (annotation) => annotation.selectionTargetId === targetPicker1,
    );
    state = beginMove(setTool(state, 'select'), {
      pointerId: pointer1,
      selectionTargetId: targetPicker1,
      point: { x: 15, y: 25 },
    });
    state = updateMove(state, {
      pointerId: pointer1,
      point: { x: 35, y: 55 },
    });
    state = commitMove(state, pointer1);

    expect(state.annotations.map((annotation) => annotation.id)).toEqual(
      beforeAnnotations.map((annotation) => annotation.id),
    );
    expect(state.annotations[1]).toEqual({
      ...beforeAnnotations[1],
      x: 30,
      y: 50,
    });
    expect(state.annotations[2]).toEqual({
      ...beforeAnnotations[2],
      x: 30,
      y: 50,
    });
    expect(state.history.at(-1)).toEqual({
      type: 'move',
      before: beforePair,
      after: [state.annotations[1], state.annotations[2]],
    });

    const undone = undoSession(state);
    expect(undone.annotations).toEqual(beforeAnnotations);
    expect(undone.tool).toEqual({
      kind: 'select-selected',
      selectionTargetId: targetPicker1,
    });
  });

  it('selection reconciliation follows history and tools', () => {
    let state = committedGesture(
      createSessionState(),
      'rect',
      rect1,
      pointer1,
      { x: 10, y: 20 },
      [{ x: 40, y: 60 }],
    );
    state = committedGesture(
      state,
      'ellipse',
      ellipse1,
      pointer1,
      { x: 100, y: 120 },
      [{ x: 160, y: 180 }],
    );
    state = commitMove(
      beginMove(setTool(state, 'select'), {
        pointerId: pointer1,
        selectionTargetId: targetRect1,
        point: { x: 15, y: 25 },
      }),
      pointer1,
    );
    expect(deselectSelection(state).tool).toEqual({ kind: 'select-armed' });

    state = beginMove(state, {
      pointerId: pointer1,
      selectionTargetId: targetEllipse1,
      point: { x: 110, y: 130 },
    });
    expect(state.tool).toMatchObject({
      kind: 'select-dragging',
      draft: { selectionTargetId: targetEllipse1 },
    });
    const dragging = updateMove(state, {
      pointerId: pointer1,
      point: { x: 120, y: 140 },
    });
    expect(undoSession(dragging)).toBe(dragging);
    expect(clearSession(dragging)).toBe(dragging);
    const otherTool = setTool(dragging, 'arrow');
    expect(otherTool.tool).toEqual({ kind: 'arrow-armed' });
    expect(otherTool.annotations).toBe(dragging.annotations);
    expect(otherTool.history).toBe(dragging.history);

    state = commitMove(dragging, pointer1);
    const movedUndone = undoSession(state);
    expect(movedUndone.tool).toEqual({
      kind: 'select-selected',
      selectionTargetId: targetEllipse1,
    });
    const addUndone = undoSession(movedUndone);
    expect(addUndone.tool).toEqual({ kind: 'select-armed' });

    const selectedRect = commitMove(
      beginMove(addUndone, {
        pointerId: pointer1,
        selectionTargetId: targetRect1,
        point: { x: 15, y: 25 },
      }),
      pointer1,
    );
    const cleared = clearSession(selectedRect);
    expect(cleared.tool).toEqual({ kind: 'select-armed' });
    const restored = undoSession(cleared);
    expect(restored.annotations).toEqual(selectedRect.annotations);
    expect(restored.tool).toEqual({ kind: 'select-armed' });
  });

  it('Esc follows the four selection rungs', () => {
    const committed = committedGesture(
      createSessionState(),
      'rect',
      rect1,
      pointer1,
      { x: 10, y: 20 },
      [{ x: 40, y: 60 }],
    );
    const dragging = updateMove(
      beginMove(setTool(committed, 'select'), {
        pointerId: pointer1,
        selectionTargetId: targetRect1,
        point: { x: 15, y: 25 },
      }),
      { pointerId: pointer1, point: { x: 25, y: 35 } },
    );

    const selected = escapeSession(dragging);
    expect(selected).toMatchObject({
      kind: 'state-changed',
      state: {
        tool: {
          kind: 'select-selected',
          selectionTargetId: targetRect1,
        },
        annotations: committed.annotations,
        history: committed.history,
      },
    });
    if (selected.kind !== 'state-changed') {
      throw new Error('expected selected state');
    }
    const armed = escapeSession(selected.state);
    expect(armed).toMatchObject({
      kind: 'state-changed',
      state: { tool: { kind: 'select-armed' } },
    });
    if (armed.kind !== 'state-changed') {
      throw new Error('expected armed state');
    }
    const interact = escapeSession(armed.state);
    expect(interact).toMatchObject({
      kind: 'state-changed',
      state: { tool: { kind: 'interact' } },
    });
    if (interact.kind !== 'state-changed') {
      throw new Error('expected interact state');
    }
    expect(escapeSession(interact.state)).toEqual({ kind: 'teardown' });
  });
});
