import { describe, expect, it } from 'vitest';

import {
  createCaptureController,
  type CaptureControllerDependencies,
} from '../src/capture/controller';
import { CaptureVisibleTabResponseSchema } from '../src/capture/protocol';

const capturedResponse = CaptureVisibleTabResponseSchema.parse({
  kind: 'captured',
  pngDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
});
const failedResponse = CaptureVisibleTabResponseSchema.parse({
  kind: 'capture-failed',
  reason: 'capture-rejected',
});

function createDeferred<T>() {
  const resolveFunctions: ((value: T) => void)[] = [];
  const promise = new Promise<T>((resolve) => {
    resolveFunctions.push(resolve);
  });

  function resolve(value: T): void {
    for (const resolveFunction of resolveFunctions) {
      resolveFunction(value);
    }
  }

  return { promise, resolve };
}

function resolved<T>(events: string[], event: string, value: T): Promise<T> {
  events.push(event);
  return Promise.resolve(value);
}

function rejected(events: string[], event: string): Promise<never> {
  events.push(event);
  return Promise.reject(new Error(`${event} rejected`));
}

function commonDependencies(
  events: string[],
  waitForCaptureFrame: CaptureControllerDependencies['waitForCaptureFrame'],
  requestCapture: CaptureControllerDependencies['requestCapture'],
  writeClipboard: CaptureControllerDependencies['writeClipboard'],
  download: CaptureControllerDependencies['download'],
): CaptureControllerDependencies {
  return {
    setChromeVisibility: (visibility) => {
      events.push(`chrome:${visibility}`);
    },
    waitForCaptureFrame,
    requestCapture,
    writeClipboard,
    download,
    showToast: (message) => {
      events.push(`toast:${message}`);
    },
    activityChanged: (activity) => {
      events.push(`activity:${activity}`);
    },
  };
}

describe('capture controller', () => {
  it('copies a captured PNG in exact order', async () => {
    const events: string[] = [];
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => resolved(events, 'request', capturedResponse),
      () => resolved(events, 'clipboard', undefined),
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      new AbortController().signal,
    );

    expect(controller.activity()).toBe('idle');
    await expect(controller.capture()).resolves.toEqual({ kind: 'copied' });
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
      'chrome:visible',
      'clipboard',
      'toast:Copied',
      'activity:idle',
    ]);
  });

  it('downloads when clipboard writing fails', async () => {
    const events: string[] = [];
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => resolved(events, 'request', capturedResponse),
      () => rejected(events, 'clipboard'),
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      new AbortController().signal,
    );

    await expect(controller.capture()).resolves.toEqual({
      kind: 'downloaded',
    });
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
      'chrome:visible',
      'clipboard',
      'download',
      'toast:Downloaded',
      'activity:idle',
    ]);
  });

  it('reports download failure when clipboard and download reject', async () => {
    const events: string[] = [];
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => resolved(events, 'request', capturedResponse),
      () => rejected(events, 'clipboard'),
      () => rejected(events, 'download'),
    );
    const controller = createCaptureController(
      dependencies,
      new AbortController().signal,
    );

    await expect(controller.capture()).resolves.toEqual({
      kind: 'download-failed',
    });
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
      'chrome:visible',
      'clipboard',
      'download',
      'toast:Download failed',
      'activity:idle',
    ]);
  });

  it('reports a typed capture failure without clipboard work', async () => {
    const events: string[] = [];
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => resolved(events, 'request', failedResponse),
      () => resolved(events, 'clipboard', undefined),
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      new AbortController().signal,
    );

    await expect(controller.capture()).resolves.toEqual({
      kind: 'capture-failed',
    });
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
      'chrome:visible',
      'toast:Capture failed',
      'activity:idle',
    ]);
  });

  it('reports request rejection and restores chrome', async () => {
    const events: string[] = [];
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => rejected(events, 'request'),
      () => resolved(events, 'clipboard', undefined),
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      new AbortController().signal,
    );

    await expect(controller.capture()).resolves.toEqual({
      kind: 'capture-failed',
    });
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
      'chrome:visible',
      'toast:Capture failed',
      'activity:idle',
    ]);
  });

  it('reports frame rejection without requesting capture', async () => {
    const events: string[] = [];
    const dependencies = commonDependencies(
      events,
      () => rejected(events, 'wait'),
      () => resolved(events, 'request', capturedResponse),
      () => resolved(events, 'clipboard', undefined),
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      new AbortController().signal,
    );

    await expect(controller.capture()).resolves.toEqual({
      kind: 'capture-failed',
    });
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'chrome:visible',
      'toast:Capture failed',
      'activity:idle',
    ]);
  });

  it('ignores a concurrent capture while the first request is held', async () => {
    const events: string[] = [];
    const request = createDeferred<typeof capturedResponse>();
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => {
        events.push('request');
        return request.promise;
      },
      () => resolved(events, 'clipboard', undefined),
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      new AbortController().signal,
    );

    const firstCapture = controller.capture();
    await expect(controller.capture()).resolves.toEqual({
      kind: 'ignored-busy',
    });
    expect(events.filter((event) => event === 'wait')).toHaveLength(1);
    expect(events.filter((event) => event === 'request')).toHaveLength(1);

    request.resolve(capturedResponse);
    await expect(firstCapture).resolves.toEqual({ kind: 'copied' });
  });

  it('cancels while the request is held and ignores late settlement', async () => {
    const events: string[] = [];
    const abortController = new AbortController();
    const request = createDeferred<typeof capturedResponse>();
    const requestStarted = createDeferred<undefined>();
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => {
        events.push('request');
        requestStarted.resolve(undefined);
        return request.promise;
      },
      () => resolved(events, 'clipboard', undefined),
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      abortController.signal,
    );

    const capture = controller.capture();
    await requestStarted.promise;
    abortController.abort();
    await expect(capture).resolves.toEqual({ kind: 'cancelled' });
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
    ]);

    request.resolve(capturedResponse);
    await Promise.resolve();
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
    ]);
  });

  it('cancels while clipboard writing is held without fallback', async () => {
    const events: string[] = [];
    const abortController = new AbortController();
    const clipboard = createDeferred<undefined>();
    const clipboardStarted = createDeferred<undefined>();
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => resolved(events, 'request', capturedResponse),
      () => {
        events.push('clipboard');
        clipboardStarted.resolve(undefined);
        return clipboard.promise;
      },
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      abortController.signal,
    );

    const capture = controller.capture();
    await clipboardStarted.promise;
    abortController.abort();
    await expect(capture).resolves.toEqual({ kind: 'cancelled' });
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
      'chrome:visible',
      'clipboard',
    ]);

    clipboard.resolve(undefined);
    await Promise.resolve();
    expect(events).toEqual([
      'activity:capturing',
      'chrome:hidden-for-capture',
      'wait',
      'request',
      'chrome:visible',
      'clipboard',
    ]);
  });

  it('returns cancelled without effects when already aborted', async () => {
    const events: string[] = [];
    const abortController = new AbortController();
    abortController.abort();
    const dependencies = commonDependencies(
      events,
      () => resolved(events, 'wait', undefined),
      () => resolved(events, 'request', capturedResponse),
      () => resolved(events, 'clipboard', undefined),
      () => resolved(events, 'download', undefined),
    );
    const controller = createCaptureController(
      dependencies,
      abortController.signal,
    );

    await expect(controller.capture()).resolves.toEqual({ kind: 'cancelled' });
    expect(events).toEqual([]);
  });
});
