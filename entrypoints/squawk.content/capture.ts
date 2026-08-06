import {
  CaptureVisibleTabRequestSchema,
  CaptureVisibleTabResponseSchema,
  type CaptureVisibleTabRequest,
  type CaptureVisibleTabResponse,
  type PngDataUrl,
} from '../../src/capture/protocol';

export async function requestVisibleTabCapture(): Promise<CaptureVisibleTabResponse> {
  const request = CaptureVisibleTabRequestSchema.parse({
    type: 'capture-visible-tab',
  });
  const response = await browser.runtime.sendMessage<
    CaptureVisibleTabRequest,
    unknown
  >(request);
  return CaptureVisibleTabResponseSchema.parse(response);
}

export function waitForCaptureFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

export async function writePngToClipboard(
  pngDataUrl: PngDataUrl,
): Promise<void> {
  const response = await fetch(pngDataUrl);
  const blob = await response.blob();
  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': blob,
    }),
  ]);
}

export function downloadPng(
  pngDataUrl: PngDataUrl,
  root: ShadowRoot,
): Promise<void> {
  const anchor = document.createElement('a');
  anchor.href = pngDataUrl;
  anchor.download = 'squawk-annotation.png';
  root.append(anchor);
  anchor.click();
  anchor.remove();
  return Promise.resolve();
}
