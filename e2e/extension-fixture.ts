import { resolve } from 'node:path';
import { chromium, expect, test as base } from '@playwright/test';

import { extensionIdFromWorker, type ExtensionId } from './extension-driver';

type ExtensionFixtures = Readonly<{
  extensionId: ExtensionId;
}>;

export const test = base.extend<ExtensionFixtures>({
  context: async ({ browserName }, use) => {
    if (browserName !== 'chromium') {
      throw new Error('Chromium browser is unavailable');
    }

    const extensionPath = resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--enable-unsafe-extension-debugging',
        '--host-resolver-rules=MAP squawk.test 127.0.0.1',
      ],
    });

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const existingWorker = context.serviceWorkers().at(0);
    const worker =
      existingWorker ?? (await context.waitForEvent('serviceworker'));

    await worker.evaluate(() => true);
    await use(extensionIdFromWorker(worker));
  },
});

export { expect };
