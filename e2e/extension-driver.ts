import type { BrowserContext, Page, Worker } from '@playwright/test';
import { z } from 'zod';

import {
  PageTargetInfoResultSchema,
  TabTargetsResultSchema,
  tabTargetIdForPage,
} from './tab-target';

export const ExtensionIdSchema = z
  .string()
  .regex(/^[a-p]{32}$/)
  .brand<'ExtensionId'>();
export type ExtensionId = z.infer<typeof ExtensionIdSchema>;

export function extensionIdFromWorker(worker: Worker): ExtensionId {
  return ExtensionIdSchema.parse(new URL(worker.url()).host);
}

export async function triggerExtensionAction(
  context: BrowserContext,
  page: Page,
  extensionId: ExtensionId,
): Promise<void> {
  const browser = context.browser();

  if (browser === null) {
    throw new Error('Chromium browser is unavailable');
  }

  const pageSession = await context.newCDPSession(page);
  const pageTargetInfo = PageTargetInfoResultSchema.parse(
    await pageSession.send('Target.getTargetInfo'),
  );
  const browserSession = await browser.newBrowserCDPSession();
  const tabTargets = TabTargetsResultSchema.parse(
    await browserSession.send('Target.getTargets', {
      filter: [{ type: 'tab' }],
    }),
  );
  const targetId = tabTargetIdForPage(
    pageTargetInfo.targetInfo,
    tabTargets.targetInfos,
  );

  await browserSession.send('Extensions.triggerAction', {
    id: extensionId,
    targetId,
  });
}
