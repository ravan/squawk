import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

import {
  dragPointer,
  requiredBox,
  selectSquawkColor,
  selectStrokeWidth,
} from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';
import {
  startInsecureFixtureServer,
  type InsecureFixtureServer,
} from './insecure-fixture-server';

const ClipboardSurfaceEvidenceSchema = z
  .object({
    isSecureContext: z.literal(false),
    hasClipboard: z.literal(false),
  })
  .strict()
  .readonly();
type ClipboardSurfaceEvidence = z.infer<typeof ClipboardSurfaceEvidenceSchema>;

async function drawAround(page: Page, target: Locator): Promise<void> {
  const box = await requiredBox(target);
  const start = {
    x: Math.round(box.x) - 12,
    y: Math.round(box.y) - 12,
  };
  const end = {
    x: Math.round(box.x + box.width) + 12,
    y: Math.round(box.y + box.height) + 12,
  };

  await dragPointer(page, { constraint: 'free', start, end });
}

test.describe.configure({ mode: 'serial' });

test('downloads the captured PNG when the browser clipboard surface is unavailable', async ({
  context,
  extensionId,
  page,
}) => {
  const server: InsecureFixtureServer = await startInsecureFixtureServer(
    new URL('./fixture-site/index.html', import.meta.url),
  );

  try {
    await page.goto(server.url.toString());
    const evaluatedEvidence = await page.evaluate(() => ({
      isSecureContext: window.isSecureContext,
      hasClipboard: 'clipboard' in navigator,
    }));
    const evidence: ClipboardSurfaceEvidence =
      ClipboardSurfaceEvidenceSchema.parse(evaluatedEvidence);
    expect(evidence).toEqual({
      isSecureContext: false,
      hasClipboard: false,
    });

    await triggerExtensionAction(context, page, extensionId);
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
    await selectSquawkColor(page, '#e03131');
    await selectStrokeWidth(page, 6);
    await drawAround(page, page.locator('#capture-target'));

    const committed = page.locator(
      '#squawk-root svg.overlay rect[data-phase="committed"]',
    );
    await expect(committed).toHaveCount(1);
    await expect(committed).toHaveAttribute('stroke', '#e03131');
    await expect(committed).toHaveAttribute('stroke-width', '6');

    const camera = page.getByRole('button', { name: 'Camera', exact: true });
    const downloadPromise = page.waitForEvent('download');
    await camera.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('squawk-annotation.png');
    const host = page.locator('#squawk-root');
    await expect(host.getByRole('status')).toHaveText('Downloaded');
    await expect(camera).toBeEnabled();
    await expect(committed).toHaveCount(1);
    await expect(host).toHaveCount(1);
  } finally {
    await server.close();
  }
});
