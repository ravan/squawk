import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

import { dragPointer, requiredBox, selectSquawkColor } from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

const RgbaSchema = z
  .tuple([
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
  ])
  .readonly();
const ClipboardPngEvidenceSchema = z
  .object({
    mimeTypes: z.array(z.string()).readonly(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    devicePixelRatio: z.number().positive(),
    chromePixels: z.array(RgbaSchema).length(2).readonly(),
    annotationPixels: z.array(RgbaSchema).min(1).readonly(),
  })
  .strict()
  .readonly();
type ClipboardPngEvidence = z.infer<typeof ClipboardPngEvidenceSchema>;

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

test('copies an Annotation-only viewport PNG through the real extension', async ({
  context,
  extensionId,
  page,
}) => {
  const origin = 'http://127.0.0.1:4173';
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  await page.goto(origin);
  await triggerExtensionAction(context, page, extensionId);

  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await selectSquawkColor(page, '#e03131');
  await page.getByRole('button', { name: 'Stroke width 6' }).click();
  await drawAround(page, page.locator('#capture-target'));

  const committed = page.locator(
    '#squawk-root svg.overlay rect[data-phase="committed"]',
  );
  await expect(committed).toHaveCount(1);
  await expect(committed).toHaveAttribute('stroke', '#e03131');
  await expect(committed).toHaveAttribute('stroke-width', '6');

  const annotationBox = await requiredBox(committed);
  const toolbarBox = await requiredBox(
    page.getByRole('toolbar', { name: 'Squawk palette' }),
  );
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await camera.click();
  await expect(camera).toBeEnabled();

  const host = page.locator('#squawk-root');
  const status = host.getByRole('status');
  await expect(status).toHaveText('Copied');
  const toastBox = await requiredBox(status);

  const evaluatedEvidence = await page.evaluate(
    async ({ annotation, toolbar, toast }) => {
      const items = await navigator.clipboard.read();
      const item = items.at(0);
      if (item === undefined) {
        throw new Error('expected a clipboard item');
      }
      if (!item.types.includes('image/png')) {
        throw new Error('expected image/png clipboard data');
      }

      const blob = await item.getType('image/png');
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error('expected a 2D canvas context');
      }
      context.drawImage(bitmap, 0, 0);

      const devicePixelRatio = window.devicePixelRatio;
      const pixelAt = (x: number, y: number) => {
        const physicalX = Math.max(
          0,
          Math.min(bitmap.width - 1, Math.round(x * devicePixelRatio)),
        );
        const physicalY = Math.max(
          0,
          Math.min(bitmap.height - 1, Math.round(y * devicePixelRatio)),
        );
        return Array.from(
          context.getImageData(physicalX, physicalY, 1, 1).data,
        );
      };

      const annotationPixels: number[][] = [];
      for (let offset = -3; offset <= 3; offset += 1) {
        for (let step = 0; step <= 24; step += 1) {
          const horizontalX = annotation.x + (annotation.width * step) / 24;
          const verticalY = annotation.y + (annotation.height * step) / 24;
          annotationPixels.push(
            pixelAt(horizontalX, annotation.y + offset),
            pixelAt(horizontalX, annotation.y + annotation.height + offset),
            pixelAt(annotation.x + offset, verticalY),
            pixelAt(annotation.x + annotation.width + offset, verticalY),
          );
        }
      }

      const chromePixels = [
        pixelAt(toolbar.x + toolbar.width / 2, toolbar.y + toolbar.height / 2),
        pixelAt(toast.x + toast.width / 2, toast.y + toast.height / 2),
      ];
      bitmap.close();

      return {
        mimeTypes: item.types,
        width: canvas.width,
        height: canvas.height,
        devicePixelRatio,
        chromePixels,
        annotationPixels,
      };
    },
    { annotation: annotationBox, toolbar: toolbarBox, toast: toastBox },
  );
  const evidence: ClipboardPngEvidence =
    ClipboardPngEvidenceSchema.parse(evaluatedEvidence);

  expect(evidence.mimeTypes).toContain('image/png');
  expect(evidence.width).toBe(
    Math.round(viewport.width * evidence.devicePixelRatio),
  );
  expect(evidence.height).toBe(
    Math.round(viewport.height * evidence.devicePixelRatio),
  );
  expect(evidence.annotationPixels).toContainEqual([224, 49, 49, 255]);
  expect(evidence.chromePixels).toEqual([
    [192, 255, 238, 255],
    [192, 255, 238, 255],
  ]);
  await expect(committed).toHaveCount(1);
  await expect(host).toHaveCount(1);
});
