import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

import {
  annotationIds,
  documentBox,
  dragPointer,
  expectHostPageUnchanged,
  monitorPageDiagnostics,
  requiredBox,
  selectSquawkColor,
  snapshotHostPage,
  type BrowserBox,
  type DocumentBox,
} from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';
import { startInsecureFixtureServer } from './insecure-fixture-server';

const ClipboardEvidenceSchema = z
  .object({
    mimeTypes: z.array(z.string()).readonly(),
    blobType: z.literal('image/png'),
    blobSize: z.number().int().positive(),
  })
  .strict()
  .readonly();
const ClipboardSurfaceEvidenceSchema = z
  .object({
    isSecureContext: z.literal(false),
    hasClipboard: z.literal(false),
  })
  .strict()
  .readonly();
const CoordinateSnapshotSchema = z
  .object({
    arrow: z
      .object({
        x1: z.string(),
        y1: z.string(),
        x2: z.string(),
        y2: z.string(),
        head: z.string(),
      })
      .strict()
      .readonly(),
    penPoints: z.string(),
  })
  .strict()
  .readonly();
type CoordinateSnapshot = z.infer<typeof CoordinateSnapshotSchema>;

function expectBoxWithinOnePixel(
  actual: BrowserBox,
  expected: BrowserBox,
): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(1);
}

async function coordinateSnapshot(
  arrow: Locator,
  pen: Locator,
): Promise<CoordinateSnapshot> {
  const shaft = arrow.locator('.arrow-shaft');
  const head = arrow.locator('.arrow-head');
  return CoordinateSnapshotSchema.parse({
    arrow: {
      x1: await shaft.getAttribute('x1'),
      y1: await shaft.getAttribute('y1'),
      x2: await shaft.getAttribute('x2'),
      y2: await shaft.getAttribute('y2'),
      head: await head.getAttribute('points'),
    },
    penPoints: await pen.getAttribute('points'),
  });
}

function expectedArrowBox(
  callout: DocumentBox,
  paragraph: DocumentBox,
  scrollY: number,
): BrowserBox {
  const x1 = callout.x + callout.width / 2;
  const y1 = callout.y + callout.height / 2 - scrollY;
  const x2 = paragraph.x + paragraph.width / 2;
  const y2 = paragraph.y + paragraph.height / 2 - scrollY;
  return {
    x: Math.min(x1, x2) - 2,
    y: Math.min(y1, y2) - 2,
    width: Math.abs(x2 - x1) + 4,
    height: Math.abs(y2 - y1) + 4,
  };
}

async function scrollY(page: Page): Promise<number> {
  return z.number().parse(await page.evaluate(() => window.scrollY));
}

async function drawRectangleAround(page: Page, target: Locator): Promise<void> {
  const box = await requiredBox(target);
  await dragPointer(page, {
    constraint: 'free',
    start: { x: box.x - 8, y: box.y - 8 },
    end: { x: box.x + box.width + 8, y: box.y + box.height + 8 },
  });
}

test('keeps article annotations anchored through scrolling and capture', async ({
  context,
  extensionId,
  page,
}) => {
  const origin = 'http://127.0.0.1:4173';
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${origin}/article.html`);
  const diagnostics = monitorPageDiagnostics(page);
  const hostSnapshot = await snapshotHostPage(page);

  await triggerExtensionAction(context, page, extensionId);
  const host = page.locator('html > #squawk-root');
  const calloutTarget = page.locator('#article-callout');
  const paragraphTarget = page.locator('#article-paragraph');
  await paragraphTarget.scrollIntoViewIfNeeded();
  const calloutDocumentBox = await documentBox(page, calloutTarget);
  const paragraphDocumentBox = await documentBox(page, paragraphTarget);
  const calloutBox = await requiredBox(calloutTarget);
  const paragraphBox = await requiredBox(paragraphTarget);

  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await selectSquawkColor(page, '#f08c00');
  await page.getByRole('button', { name: 'Stroke width 4' }).click();
  await dragPointer(page, {
    constraint: 'free',
    start: {
      x: calloutBox.x + calloutBox.width / 2,
      y: calloutBox.y + calloutBox.height / 2,
    },
    end: {
      x: paragraphBox.x + paragraphBox.width / 2,
      y: paragraphBox.y + paragraphBox.height / 2,
    },
  });

  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  await page.getByRole('button', { name: 'Stroke width 2' }).click();
  const underlineY = paragraphBox.y + paragraphBox.height - 6;
  const underlineStart = { x: paragraphBox.x + 12, y: underlineY };
  const underlineEnd = {
    x: paragraphBox.x + paragraphBox.width - 12,
    y: underlineY,
  };
  await page.mouse.move(underlineStart.x, underlineStart.y);
  await page.mouse.down();
  await page.mouse.move(
    underlineStart.x + (underlineEnd.x - underlineStart.x) / 2,
    underlineY,
  );
  await page.mouse.move(underlineEnd.x, underlineEnd.y);
  await page.mouse.up();

  const arrow = host.locator(
    'svg.overlay g.annotation[data-phase="committed"][data-kind="arrow"]',
  );
  const pen = host.locator(
    'svg.overlay polyline.annotation[data-phase="committed"][data-kind="pen"]',
  );
  await expect(arrow).toHaveCount(1);
  await expect(arrow.locator('.arrow-shaft')).toHaveAttribute(
    'stroke',
    '#f08c00',
  );
  await expect(arrow.locator('.arrow-shaft')).toHaveAttribute(
    'stroke-width',
    '4',
  );
  await expect(pen).toHaveCount(1);
  await expect(pen).toHaveAttribute('stroke', '#f08c00');
  await expect(pen).toHaveAttribute('stroke-width', '2');

  const coordinates = await coordinateSnapshot(arrow, pen);
  const currentScrollY = await scrollY(page);
  expectBoxWithinOnePixel(
    await requiredBox(arrow.locator('.arrow-shaft')),
    expectedArrowBox(calloutDocumentBox, paragraphDocumentBox, currentScrollY),
  );
  expectBoxWithinOnePixel(await requiredBox(pen), {
    x: underlineStart.x - 1,
    y: underlineY - 1,
    width: underlineEnd.x - underlineStart.x + 2,
    height: 2,
  });

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  expect(await coordinateSnapshot(arrow, pen)).toEqual(coordinates);
  await paragraphTarget.scrollIntoViewIfNeeded();
  expect(await coordinateSnapshot(arrow, pen)).toEqual(coordinates);
  const returnedParagraphBox = await requiredBox(paragraphTarget);
  const returnedScrollY = await scrollY(page);
  expectBoxWithinOnePixel(
    await requiredBox(arrow.locator('.arrow-shaft')),
    expectedArrowBox(calloutDocumentBox, paragraphDocumentBox, returnedScrollY),
  );
  expectBoxWithinOnePixel(await requiredBox(pen), {
    x: underlineStart.x - 1,
    y: returnedParagraphBox.y + returnedParagraphBox.height - 7,
    width: underlineEnd.x - underlineStart.x + 2,
    height: 2,
  });

  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await camera.click();
  await expect(host.getByRole('status')).toHaveText('Copied');
  const clipboardEvidence = ClipboardEvidenceSchema.parse(
    await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const item = items.find((candidate) =>
        candidate.types.includes('image/png'),
      );
      if (item === undefined) {
        throw new Error('expected an image/png clipboard item');
      }
      const blob = await item.getType('image/png');
      return {
        mimeTypes: item.types,
        blobType: blob.type,
        blobSize: blob.size,
      };
    }),
  );
  expect(clipboardEvidence.mimeTypes).toContain('image/png');
  await expect(camera).toBeEnabled();
  await expect(arrow).toHaveCount(1);
  await expect(pen).toHaveCount(1);
  await expect(host).toHaveCount(1);
  await expectHostPageUnchanged(page, hostSnapshot);
  diagnostics.assertClean();
  await page.getByRole('button', { name: 'Close Squawk' }).click();
  await expect(host).toHaveCount(0);
});

test('erases, restores, and downloads on an insecure sticky page', async ({
  context,
  extensionId,
  page,
}) => {
  const server = await startInsecureFixtureServer(
    new URL('./fixture-site/sticky.html', import.meta.url),
  );

  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(server.url.toString());
    const diagnostics = monitorPageDiagnostics(page);
    const hostSnapshot = await snapshotHostPage(page);
    const clipboardSurface = ClipboardSurfaceEvidenceSchema.parse(
      await page.evaluate(() => ({
        isSecureContext: window.isSecureContext,
        hasClipboard: 'clipboard' in navigator,
      })),
    );
    expect(clipboardSurface).toEqual({
      isSecureContext: false,
      hasClipboard: false,
    });

    const target = page.locator('#sticky-target');
    await target.scrollIntoViewIfNeeded();
    await triggerExtensionAction(context, page, extensionId);
    const host = page.locator('html > #squawk-root');
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
    await selectSquawkColor(page, '#1971c2');
    await page.getByRole('button', { name: 'Stroke width 6' }).click();
    await drawRectangleAround(page, target);

    const rectangle = host.locator(
      'svg.overlay rect.annotation[data-phase="committed"][data-kind="rect"]',
    );
    const committed = host.locator(
      'svg.overlay .annotation[data-phase="committed"]',
    );
    await expect(rectangle).toHaveCount(1);
    await expect(rectangle).toHaveAttribute('stroke', '#1971c2');
    await expect(rectangle).toHaveAttribute('stroke-width', '6');
    const originalId = z
      .string()
      .parse(await rectangle.getAttribute('data-annotation-id'));
    const originalOrder = await annotationIds(committed);

    await page.getByRole('button', { name: 'Eraser', exact: true }).click();
    const rectangleBox = await requiredBox(rectangle);
    await page.mouse.move(
      rectangleBox.x + rectangleBox.width / 2,
      rectangleBox.y + 1,
    );
    await expect(rectangle).toHaveAttribute('opacity', '0.4');
    await page.mouse.down();
    await page.mouse.up();
    await expect(rectangle).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(rectangle).toHaveCount(1);
    await expect(rectangle).toHaveAttribute('data-annotation-id', originalId);
    expect(await annotationIds(committed)).toEqual(originalOrder);

    const camera = page.getByRole('button', { name: 'Camera', exact: true });
    const downloadPromise = page.waitForEvent('download');
    await camera.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('squawk-annotation.png');
    await expect(host.getByRole('status')).toHaveText('Downloaded');
    await expect(camera).toBeEnabled();
    await expect(rectangle).toHaveCount(1);
    await expect(host).toHaveCount(1);
    await expectHostPageUnchanged(page, hostSnapshot);
    diagnostics.assertClean();
    await page.getByRole('button', { name: 'Close Squawk' }).click();
    await expect(host).toHaveCount(0);
    expect(await snapshotHostPage(page)).toEqual(hostSnapshot);
  } finally {
    await server.close();
  }
});
