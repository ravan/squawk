import { createActionClickHandler } from '../src/background/action-handler';
import {
  captureSenderFromWindowId,
  createCaptureRequestHandler,
} from '../src/background/capture-handler';
import { CaptureVisibleTabRequestSchema } from '../src/capture/protocol';

export default defineBackground(() => {
  const debugLog: string[] = [];
  (globalThis as unknown as Record<string, unknown>).__squawkDebugLog =
    debugLog;
  const handleActionClick = createActionClickHandler(async (tabId) => {
    debugLog.push(`click tab=${String(tabId)}`);
    // The svelte-loc bridge must live in the MAIN world to read
    // `__svelte_meta`; a page that refuses it must not block Squawk itself.
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['/svelte-meta-bridge.js'],
      });
      debugLog.push('bridge ok');
    } catch (error: unknown) {
      debugLog.push(`bridge fail ${String(error)}`);
      console.warn('Squawk svelte-loc bridge injection failed', error);
    }
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/squawk.js'],
    });
    debugLog.push('content ok');
  });
  const handleCaptureRequest = createCaptureRequestHandler((windowId) =>
    browser.tabs.captureVisibleTab(windowId, { format: 'png' }),
  );

  browser.action.onClicked.addListener((tab) => {
    void handleActionClick({ id: tab.id, url: tab.url }).catch(
      (error: unknown) => {
        console.error('Squawk injection failed', error);
      },
    );
  });

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      const request = CaptureVisibleTabRequestSchema.safeParse(message);
      if (!request.success) return;

      const captureSender = captureSenderFromWindowId(sender.tab?.windowId);
      void handleCaptureRequest(request.data, captureSender).then(sendResponse);

      // Keep Chrome's response channel open for the asynchronous capture.
      return true;
    },
  );
});
