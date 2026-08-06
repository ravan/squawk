import type { CaptureVisibleTabResponse, PngDataUrl } from './protocol';
import type { CaptureToast } from './toast';

export type CaptureActivity = 'idle' | 'capturing';
export type SquawkChromeVisibility = 'visible' | 'hidden-for-capture';
export type CaptureOutcome =
  | Readonly<{ kind: 'copied' }>
  | Readonly<{ kind: 'downloaded' }>
  | Readonly<{ kind: 'capture-failed' }>
  | Readonly<{ kind: 'download-failed' }>
  | Readonly<{ kind: 'ignored-busy' }>
  | Readonly<{ kind: 'cancelled' }>;

export type CaptureControllerDependencies = Readonly<{
  setChromeVisibility: (visibility: SquawkChromeVisibility) => void;
  waitForCaptureFrame: () => Promise<void>;
  requestCapture: () => Promise<CaptureVisibleTabResponse>;
  writeClipboard: (pngDataUrl: PngDataUrl) => Promise<void>;
  download: (pngDataUrl: PngDataUrl) => Promise<void>;
  showToast: (message: CaptureToast) => void;
  activityChanged: (activity: CaptureActivity) => void;
}>;
export type CaptureController = Readonly<{
  activity: () => CaptureActivity;
  capture: () => Promise<CaptureOutcome>;
}>;

const CAPTURE_CANCELLED = Symbol('capture-cancelled');
type CaptureCancelled = typeof CAPTURE_CANCELLED;

function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T | CaptureCancelled> {
  if (signal.aborted) return Promise.resolve(CAPTURE_CANCELLED);
  return new Promise((resolve, reject) => {
    const cancel = () => {
      resolve(CAPTURE_CANCELLED);
    };
    signal.addEventListener('abort', cancel, { once: true });
    void operation.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', cancel);
    });
  });
}

export function createCaptureController(
  dependencies: CaptureControllerDependencies,
  signal: AbortSignal,
): CaptureController {
  let activity: CaptureActivity = 'idle';

  function aborted(): boolean {
    return signal.aborted;
  }

  function finish(
    message: CaptureToast,
    outcome: CaptureOutcome,
  ): CaptureOutcome {
    dependencies.showToast(message);
    activity = 'idle';
    dependencies.activityChanged(activity);
    return outcome;
  }

  function captureFailed(): CaptureOutcome {
    dependencies.setChromeVisibility('visible');
    return finish('Capture failed', { kind: 'capture-failed' });
  }

  async function capture(): Promise<CaptureOutcome> {
    if (aborted()) return { kind: 'cancelled' };
    if (activity === 'capturing') return { kind: 'ignored-busy' };

    activity = 'capturing';
    dependencies.activityChanged(activity);
    dependencies.setChromeVisibility('hidden-for-capture');

    let frameResult: undefined | CaptureCancelled;
    try {
      frameResult = await raceWithAbort(
        dependencies.waitForCaptureFrame().then(() => undefined),
        signal,
      );
    } catch {
      return captureFailed();
    }
    if (frameResult === CAPTURE_CANCELLED) return { kind: 'cancelled' };
    if (aborted()) return { kind: 'cancelled' };

    let response: CaptureVisibleTabResponse | CaptureCancelled;
    try {
      response = await raceWithAbort(dependencies.requestCapture(), signal);
    } catch {
      return captureFailed();
    }
    if (response === CAPTURE_CANCELLED) return { kind: 'cancelled' };
    if (response.kind === 'capture-failed') return captureFailed();

    dependencies.setChromeVisibility('visible');
    if (aborted()) return { kind: 'cancelled' };

    let clipboardResult: undefined | CaptureCancelled;
    try {
      clipboardResult = await raceWithAbort(
        dependencies.writeClipboard(response.pngDataUrl).then(() => undefined),
        signal,
      );
    } catch {
      if (aborted()) return { kind: 'cancelled' };
      try {
        const downloadResult = await raceWithAbort(
          dependencies.download(response.pngDataUrl),
          signal,
        );
        if (downloadResult === CAPTURE_CANCELLED) return { kind: 'cancelled' };
        return finish('Downloaded', { kind: 'downloaded' });
      } catch {
        return finish('Download failed', { kind: 'download-failed' });
      }
    }

    if (clipboardResult === CAPTURE_CANCELLED) return { kind: 'cancelled' };
    return finish('Copied', { kind: 'copied' });
  }

  return {
    activity: () => activity,
    capture,
  };
}
