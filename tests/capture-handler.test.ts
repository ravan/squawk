import { describe, expect, it, vi } from 'vitest';

import {
  captureSenderFromWindowId,
  createCaptureRequestHandler,
} from '../src/background/capture-handler';
import { CaptureVisibleTabRequestSchema } from '../src/capture/protocol';

const request = CaptureVisibleTabRequestSchema.parse({
  type: 'capture-visible-tab',
});
const validPngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';

describe('capture request handler', () => {
  it('converts browser window ids to typed senders', () => {
    expect(captureSenderFromWindowId(17)).toEqual({
      kind: 'tab',
      windowId: 17,
    });
    expect(captureSenderFromWindowId(undefined)).toEqual({
      kind: 'unsupported',
    });
    expect(captureSenderFromWindowId(-1)).toEqual({ kind: 'unsupported' });
    expect(captureSenderFromWindowId(1.5)).toEqual({ kind: 'unsupported' });
  });

  it('captures the sender window and returns typed PNG data', async () => {
    const captureVisibleTab = vi.fn().mockResolvedValue(validPngDataUrl);
    const handler = createCaptureRequestHandler(captureVisibleTab);
    const sender = captureSenderFromWindowId(17);

    await expect(handler(request, sender)).resolves.toEqual({
      kind: 'captured',
      pngDataUrl: validPngDataUrl,
    });
    expect(captureVisibleTab).toHaveBeenCalledOnce();
    expect(captureVisibleTab).toHaveBeenCalledWith(17);
  });

  it('rejects unsupported senders without capturing', async () => {
    const captureVisibleTab = vi.fn();
    const handler = createCaptureRequestHandler(captureVisibleTab);

    await expect(handler(request, { kind: 'unsupported' })).resolves.toEqual({
      kind: 'capture-failed',
      reason: 'missing-window-id',
    });
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });

  it('maps capture rejection to a typed failure', async () => {
    const captureVisibleTab = vi.fn().mockRejectedValue(new Error('denied'));
    const handler = createCaptureRequestHandler(captureVisibleTab);

    await expect(
      handler(request, captureSenderFromWindowId(17)),
    ).resolves.toEqual({
      kind: 'capture-failed',
      reason: 'capture-rejected',
    });
  });

  it.each([
    'data:image/jpeg;base64,iVBORw0KGgo=',
    'data:image/png;base64,QUFBQQ==',
  ])('maps fulfilled invalid data %s to a typed failure', async (result) => {
    const captureVisibleTab = vi.fn().mockResolvedValue(result);
    const handler = createCaptureRequestHandler(captureVisibleTab);

    await expect(
      handler(request, captureSenderFromWindowId(17)),
    ).resolves.toEqual({
      kind: 'capture-failed',
      reason: 'invalid-png-data-url',
    });
  });
});
