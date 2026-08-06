import {
  createCaptureController,
  type SquawkChromeVisibility,
} from '../../src/capture/controller';
import type { SessionState } from '../../src/core/model';
import {
  clearSession,
  commitTextEdit,
  createSessionState,
  escapeSession,
  setColor,
  setEraserTarget,
  setFillStyle,
  setPickerTarget,
  setStrokeStyle,
  setStrokeWidth,
  setTool,
  undoSession,
  updateTextEdit,
} from '../../src/core/session';
import {
  downloadPng,
  requestVisibleTabCapture,
  waitForCaptureFrame,
  writePngToClipboard,
} from './capture';
import {
  annotationIdFromEntropy,
  browserIdentityEntropy,
  selectionTargetIdFromEntropy,
} from './identity';
import { SQUAWK_HOST_ID } from '../../src/core/svelte-loc';
import { createElementPicker } from './element-picker';
import { createOverlay } from './overlay';
import { createPalette } from './palette';
import { bindPointerRouting } from './pointer-routing';
import { SQUAWK_STYLES } from './styles';
import { createTextEditor } from './text-editor';
import { installTextFont } from './text-font';
import { createTextMetricsAdapter } from './text-metrics';
import { createToast } from './toast';

export type SquawkToggleOutcome =
  Readonly<{ kind: 'mounted' }> | Readonly<{ kind: 'torn-down' }>;
export type SquawkSession = Readonly<{
  host: HTMLDivElement;
  teardown: () => void;
}>;

const HOST_ID = SQUAWK_HOST_ID;
const TEARDOWN_EVENT = 'squawk:teardown';

export function mountSquawkSession(): SquawkSession {
  const host = document.createElement('div');
  host.id = HOST_ID;

  const textFont = installTextFont();
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const stylesheet = new CSSStyleSheet();
  stylesheet.replaceSync(SQUAWK_STYLES);
  shadowRoot.adoptedStyleSheets = [stylesheet];

  const teardownController = new AbortController();
  let tornDown = false;
  let state = createSessionState();

  const teardown = (): void => {
    if (tornDown) {
      return;
    }

    tornDown = true;
    teardownController.abort();
    host.remove();
  };

  const textMetrics = createTextMetricsAdapter();
  const overlay = createOverlay(textMetrics, teardownController.signal);
  const elementPicker = createElementPicker(host);
  const toast = createToast(teardownController.signal);

  function render(): void {
    const activity = captureController.activity();
    overlay.render(state);
    editor.render(state, activity);
    palette.render(state, activity);
  }

  function updateState(nextState: SessionState): void {
    if (nextState === state) {
      return;
    }

    state = nextState;
    render();
  }

  function capture(): void {
    if (
      state.tool.kind === 'select-dragging' ||
      state.tool.kind === 'text-drawing'
    ) {
      return;
    }
    updateState(commitTextEdit(state));
    updateState(setEraserTarget(state, { kind: 'none' }));
    updateState(setPickerTarget(state, { kind: 'none' }));
    toast.hide();
    void captureController.capture();
  }

  function setChromeVisibility(visibility: SquawkChromeVisibility): void {
    overlay.setChromeVisibility(visibility);
    const hidden = visibility === 'hidden-for-capture';
    palette.element.hidden = hidden;
    if (hidden) {
      editor.element.hidden = true;
    }
  }

  function captureActivityChanged(): void {
    render();
  }

  const editor = createTextEditor(
    {
      updateText: (text) => {
        updateState(updateTextEdit(state, text));
      },
      commitText: () => {
        updateState(commitTextEdit(state));
      },
      escapeText: () => {
        const outcome = escapeSession(state);
        if (outcome.kind === 'teardown') {
          teardown();
        } else {
          updateState(outcome.state);
        }
      },
    },
    textMetrics,
    teardownController.signal,
  );

  const palette = createPalette(
    {
      setTool: (tool) => {
        updateState(setTool(state, tool));
      },
      setColor: (color) => {
        updateState(setColor(state, color));
      },
      toggleFillStyle: () => {
        updateState(
          setFillStyle(
            state,
            state.style.fillStyle === 'none' ? 'solid' : 'none',
          ),
        );
      },
      setStrokeWidth: (strokeWidth) => {
        updateState(setStrokeWidth(state, strokeWidth));
      },
      setStrokeStyle: (strokeStyle) => {
        updateState(setStrokeStyle(state, strokeStyle));
      },
      undo: () => {
        updateState(undoSession(state));
      },
      clear: () => {
        updateState(clearSession(state));
      },
      capture,
      close: teardown,
    },
    toast,
    teardownController.signal,
  );
  const captureController = createCaptureController(
    {
      setChromeVisibility,
      waitForCaptureFrame,
      requestCapture: requestVisibleTabCapture,
      writeClipboard: writePngToClipboard,
      download: (pngDataUrl) => downloadPng(pngDataUrl, shadowRoot),
      showToast: toast.show,
      activityChanged: captureActivityChanged,
    },
    teardownController.signal,
  );

  bindPointerRouting({
    overlay: overlay.element,
    signal: teardownController.signal,
    state: () => state,
    updateState,
    captureActivity: () => captureController.activity(),
    createAnnotationId: () => annotationIdFromEntropy(browserIdentityEntropy()),
    createSelectionTargetId: () =>
      selectionTargetIdFromEntropy(browserIdentityEntropy()),
    elementPicker,
  });

  host.addEventListener(TEARDOWN_EVENT, teardown, {
    signal: teardownController.signal,
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (state.tool.kind === 'text-editing') {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const outcome = escapeSession(state);
        if (outcome.kind === 'teardown') {
          teardown();
        } else if (captureController.activity() !== 'capturing') {
          updateState(outcome.state);
        }
        return;
      }

      if (
        event.key === 'z' &&
        !event.shiftKey &&
        !event.altKey &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (captureController.activity() !== 'capturing') {
          updateState(undoSession(state));
        }
      }
    },
    { capture: true, signal: teardownController.signal },
  );

  shadowRoot.append(
    overlay.element,
    textMetrics.element,
    editor.element,
    palette.element,
  );
  document.documentElement.append(host);
  palette.constrainToViewport();
  render();
  void textFont.ready.then(() => {
    if (!tornDown && host.isConnected) {
      render();
    }
  });

  return { host, teardown };
}

export function toggleSquawkSession(): SquawkToggleOutcome {
  const existingHost = document.getElementById(HOST_ID);

  if (existingHost !== null) {
    existingHost.dispatchEvent(new Event(TEARDOWN_EVENT));
    return { kind: 'torn-down' };
  }

  mountSquawkSession();
  return { kind: 'mounted' };
}
