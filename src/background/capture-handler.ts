import { z } from 'zod';

import {
  PngDataUrlSchema,
  type CaptureVisibleTabRequest,
  type CaptureVisibleTabResponse,
} from '../capture/protocol';

export const BrowserWindowIdSchema = z
  .number()
  .int()
  .nonnegative()
  .brand<'BrowserWindowId'>();
export type BrowserWindowId = z.infer<typeof BrowserWindowIdSchema>;

export const CaptureSenderSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('tab'), windowId: BrowserWindowIdSchema })
      .strict(),
    z.object({ kind: z.literal('unsupported') }).strict(),
  ])
  .readonly();
export type CaptureSender = z.infer<typeof CaptureSenderSchema>;

export type CaptureVisibleTab = (windowId: BrowserWindowId) => Promise<unknown>;
export type CaptureRequestHandler = (
  request: CaptureVisibleTabRequest,
  sender: CaptureSender,
) => Promise<CaptureVisibleTabResponse>;

export function captureSenderFromWindowId(windowId: unknown): CaptureSender {
  const parsedWindowId = BrowserWindowIdSchema.safeParse(windowId);
  if (!parsedWindowId.success) return { kind: 'unsupported' };
  return { kind: 'tab', windowId: parsedWindowId.data };
}

export function createCaptureRequestHandler(
  captureVisibleTab: CaptureVisibleTab,
): CaptureRequestHandler {
  return async (_request, sender) => {
    if (sender.kind === 'unsupported') {
      return { kind: 'capture-failed', reason: 'missing-window-id' };
    }

    let result: unknown;
    try {
      result = await captureVisibleTab(sender.windowId);
    } catch {
      return { kind: 'capture-failed', reason: 'capture-rejected' };
    }

    const parsedPngDataUrl = PngDataUrlSchema.safeParse(result);
    if (!parsedPngDataUrl.success) {
      return { kind: 'capture-failed', reason: 'invalid-png-data-url' };
    }

    return { kind: 'captured', pngDataUrl: parsedPngDataUrl.data };
  };
}
