import type { CaptureActivity } from '../../src/capture/controller';
import { documentPointFromViewport } from '../../src/core/geometry';
import {
  AnnotationIdSchema,
  PointerIdSchema,
  SelectionTargetIdSchema,
  type AnnotationId,
  type EraserTarget,
  type SelectionTargetHit,
  type SelectionTargetId,
  type SessionState,
} from '../../src/core/model';
import {
  beginGesture,
  beginMove,
  beginTextDrawing,
  cancelGesture,
  cancelMove,
  cancelTextDrawing,
  commitGesture,
  commitMove,
  commitPickerTarget,
  commitTextEdit,
  deselectSelection,
  eraseAnnotation,
  finishTextDrawing,
  moveGesture,
  setEraserTarget,
  setPickerTarget,
  updateMove,
  updateTextDrawing,
} from '../../src/core/session';
import type { ElementPickerView } from './element-picker';

export type PointerRoutingDependencies = Readonly<{
  overlay: SVGSVGElement;
  signal: AbortSignal;
  state: () => SessionState;
  updateState: (state: SessionState) => void;
  captureActivity: () => CaptureActivity;
  createAnnotationId: () => AnnotationId;
  createSelectionTargetId: () => SelectionTargetId;
  elementPicker: ElementPickerView;
}>;

function viewportPointFromPointer(event: PointerEvent) {
  return { x: event.clientX, y: event.clientY };
}

function pointFromPointer(event: PointerEvent) {
  return documentPointFromViewport(viewportPointFromPointer(event), {
    x: window.scrollX,
    y: window.scrollY,
  });
}

function eraserTargetFromPointer(event: PointerEvent): EraserTarget {
  if (!(event.target instanceof SVGElement)) {
    return { kind: 'none' };
  }
  const root = event.target.closest('[data-annotation-id]');
  if (!(root instanceof SVGElement)) {
    return { kind: 'none' };
  }
  const parsed = AnnotationIdSchema.safeParse(root.dataset.annotationId);
  if (!parsed.success) {
    return { kind: 'none' };
  }
  return { kind: 'annotation', annotationId: parsed.data };
}

function selectionTargetFromPointer(event: PointerEvent): SelectionTargetHit {
  if (!(event.target instanceof SVGElement)) {
    return { kind: 'none' };
  }
  const root = event.target.closest('[data-selection-target-id]');
  if (!(root instanceof SVGElement)) {
    return { kind: 'none' };
  }
  const parsed = SelectionTargetIdSchema.safeParse(
    root.dataset.selectionTargetId,
  );
  if (!parsed.success) {
    return { kind: 'none' };
  }
  return { kind: 'target', selectionTargetId: parsed.data };
}

export function bindPointerRouting(
  dependencies: PointerRoutingDependencies,
): void {
  const {
    overlay,
    signal,
    state,
    updateState,
    captureActivity,
    createAnnotationId,
    createSelectionTargetId,
    elementPicker,
  } = dependencies;

  overlay.addEventListener(
    'pointerdown',
    (event) => {
      if (
        captureActivity() === 'capturing' ||
        event.button !== 0 ||
        !event.isPrimary
      ) {
        return;
      }

      const current = state();
      switch (current.tool.kind) {
        case 'select-armed':
        case 'select-selected': {
          const target = selectionTargetFromPointer(event);
          if (target.kind === 'none') {
            updateState(deselectSelection(current));
            return;
          }
          const next = beginMove(current, {
            pointerId: PointerIdSchema.parse(event.pointerId),
            selectionTargetId: target.selectionTargetId,
            point: pointFromPointer(event),
          });
          updateState(next);
          if (next.tool.kind === 'select-dragging') {
            overlay.setPointerCapture(event.pointerId);
          }
          event.preventDefault();
          return;
        }
        case 'rect-armed':
        case 'ellipse-armed':
        case 'arrow-armed':
        case 'pen-armed': {
          const next = beginGesture(current, {
            pointerId: PointerIdSchema.parse(event.pointerId),
            annotationId: createAnnotationId(),
            selectionTargetId: createSelectionTargetId(),
            point: pointFromPointer(event),
          });
          updateState(next);
          overlay.setPointerCapture(event.pointerId);
          event.preventDefault();
          return;
        }
        case 'text-armed': {
          const next = beginTextDrawing(current, {
            pointerId: PointerIdSchema.parse(event.pointerId),
            annotationId: createAnnotationId(),
            selectionTargetId: createSelectionTargetId(),
            point: pointFromPointer(event),
          });
          updateState(next);
          overlay.setPointerCapture(event.pointerId);
          event.preventDefault();
          return;
        }
        case 'text-editing':
          updateState(commitTextEdit(current));
          event.preventDefault();
          return;
        case 'picker-armed':
        case 'picker-hovering': {
          const selection = elementPicker.targetAt(
            viewportPointFromPointer(event),
          );
          if (selection.kind === 'none') {
            updateState(setPickerTarget(current, selection));
            return;
          }
          const hovering = setPickerTarget(current, selection);
          updateState(
            commitPickerTarget(hovering, {
              rectangleAnnotationId: createAnnotationId(),
              labelAnnotationId: createAnnotationId(),
              selectionTargetId: createSelectionTargetId(),
            }),
          );
          event.preventDefault();
          return;
        }
        case 'eraser-armed':
        case 'eraser-hovering': {
          const target = eraserTargetFromPointer(event);
          if (target.kind === 'none') {
            updateState(setEraserTarget(current, target));
            return;
          }
          updateState(
            eraseAnnotation(
              setEraserTarget(current, target),
              target.annotationId,
            ),
          );
          event.preventDefault();
          return;
        }
        case 'interact':
        case 'select-dragging':
        case 'drawing':
        case 'text-drawing':
          return;
      }
    },
    { signal },
  );

  overlay.addEventListener(
    'pointermove',
    (event) => {
      if (captureActivity() === 'capturing') {
        return;
      }

      const current = state();
      if (current.tool.kind === 'select-dragging') {
        if (!event.isPrimary) {
          return;
        }
        updateState(
          updateMove(current, {
            pointerId: PointerIdSchema.parse(event.pointerId),
            point: pointFromPointer(event),
          }),
        );
        return;
      }
      if (current.tool.kind === 'text-drawing') {
        const pointerId = PointerIdSchema.parse(event.pointerId);
        if (!event.isPrimary || current.tool.draft.pointerId !== pointerId) {
          return;
        }
        updateState(
          updateTextDrawing(current, {
            pointerId,
            point: pointFromPointer(event),
          }),
        );
        return;
      }
      if (
        current.tool.kind === 'eraser-armed' ||
        current.tool.kind === 'eraser-hovering'
      ) {
        updateState(setEraserTarget(current, eraserTargetFromPointer(event)));
        return;
      }
      if (
        current.tool.kind === 'picker-armed' ||
        current.tool.kind === 'picker-hovering'
      ) {
        updateState(
          setPickerTarget(
            current,
            elementPicker.targetAt(viewportPointFromPointer(event)),
          ),
        );
        return;
      }
      if (current.tool.kind !== 'drawing') {
        return;
      }
      updateState(
        moveGesture(current, {
          pointerId: PointerIdSchema.parse(event.pointerId),
          point: pointFromPointer(event),
          constraint: event.shiftKey ? 'equal-axes' : 'free',
        }),
      );
    },
    { signal },
  );

  overlay.addEventListener(
    'pointerup',
    (event) => {
      if (captureActivity() === 'capturing') {
        return;
      }

      const current = state();
      if (current.tool.kind === 'select-dragging') {
        if (!event.isPrimary) {
          return;
        }
        const pointerId = PointerIdSchema.parse(event.pointerId);
        const moved = updateMove(current, {
          pointerId,
          point: pointFromPointer(event),
        });
        updateState(commitMove(moved, pointerId));
        return;
      }
      if (current.tool.kind === 'text-drawing') {
        const pointerId = PointerIdSchema.parse(event.pointerId);
        if (!event.isPrimary || current.tool.draft.pointerId !== pointerId) {
          return;
        }
        const moved = updateTextDrawing(current, {
          pointerId,
          point: pointFromPointer(event),
        });
        updateState(finishTextDrawing(moved, pointerId));
        overlay.releasePointerCapture(event.pointerId);
        return;
      }
      if (current.tool.kind !== 'drawing') {
        return;
      }
      const pointerId = PointerIdSchema.parse(event.pointerId);
      const moved = moveGesture(current, {
        pointerId,
        point: pointFromPointer(event),
        constraint: event.shiftKey ? 'equal-axes' : 'free',
      });
      updateState(commitGesture(moved, pointerId));
    },
    { signal },
  );

  const cancelPointer = (event: PointerEvent): void => {
    if (captureActivity() === 'capturing') {
      return;
    }
    const current = state();
    const pointerId = PointerIdSchema.parse(event.pointerId);
    if (current.tool.kind === 'select-dragging') {
      if (!event.isPrimary) {
        return;
      }
      updateState(cancelMove(current, pointerId));
      return;
    }
    if (current.tool.kind === 'text-drawing') {
      if (!event.isPrimary || current.tool.draft.pointerId !== pointerId) {
        return;
      }
      updateState(cancelTextDrawing(current, pointerId));
      return;
    }
    if (current.tool.kind === 'drawing') {
      updateState(cancelGesture(current, pointerId));
    }
  };

  overlay.addEventListener('pointercancel', cancelPointer, { signal });
  overlay.addEventListener('lostpointercapture', cancelPointer, { signal });

  overlay.addEventListener(
    'pointerleave',
    () => {
      if (captureActivity() === 'capturing') {
        return;
      }
      updateState(
        setPickerTarget(setEraserTarget(state(), { kind: 'none' }), {
          kind: 'none',
        }),
      );
    },
    { signal },
  );
}
