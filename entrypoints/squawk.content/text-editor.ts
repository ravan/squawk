import type { CaptureActivity } from '../../src/capture/controller';
import { deriveTextLayout } from '../../src/core/geometry';
import type {
  AnnotationId,
  SessionState,
  TextEditValue,
} from '../../src/core/model';
import type { TextMetricsAdapter } from './text-metrics';

export type TextEditorCallbacks = Readonly<{
  updateText: (text: TextEditValue) => void;
  commitText: () => void;
  escapeText: () => void;
}>;

export type TextEditorView = Readonly<{
  element: HTMLTextAreaElement;
  render: (state: SessionState, activity: CaptureActivity) => void;
}>;

export function createTextEditor(
  callbacks: TextEditorCallbacks,
  textMetrics: TextMetricsAdapter,
  signal: AbortSignal,
): TextEditorView {
  const editor = document.createElement('textarea');
  editor.className = 'text-editor';
  editor.ariaLabel = 'Squawk text editor';
  editor.wrap = 'soft';
  editor.spellcheck = false;
  editor.setAttribute('autocorrect', 'off');
  editor.setAttribute('autocapitalize', 'off');
  editor.hidden = true;

  let activeDraftId: AnnotationId | undefined;

  editor.addEventListener(
    'input',
    () => {
      callbacks.updateText(editor.value);
    },
    { signal },
  );
  editor.addEventListener(
    'blur',
    () => {
      callbacks.commitText();
    },
    { signal },
  );
  editor.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      callbacks.escapeText();
    },
    { signal },
  );

  return {
    element: editor,
    render: (state, activity) => {
      if (state.tool.kind !== 'text-editing') {
        activeDraftId = undefined;
        editor.hidden = true;
        return;
      }
      if (activity === 'capturing') {
        editor.hidden = true;
        return;
      }

      const { draft } = state.tool;
      const enteringDraft = activeDraftId !== draft.annotationId;
      const layout = deriveTextLayout(draft, textMetrics.measureWidth);
      editor.style.left = `${String(draft.x)}px`;
      editor.style.top = `${String(draft.y)}px`;
      editor.style.width = `${String(layout.displayWidth)}px`;
      editor.style.height = `${String(layout.displayHeight)}px`;
      editor.style.color = 'transparent';
      editor.style.caretColor = draft.color;
      editor.style.fontSize = `${String(draft.size)}px`;
      editor.style.lineHeight = `${String(layout.lineHeight)}px`;
      editor.hidden = false;

      if (!enteringDraft) {
        return;
      }
      activeDraftId = draft.annotationId;
      editor.value = draft.text;
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    },
  };
}
