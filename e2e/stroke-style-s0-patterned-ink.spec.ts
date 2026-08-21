import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { z } from 'zod';

import {
  annotationIds,
  expectHostPageUnchanged,
  monitorPageDiagnostics,
  requiredBox,
  selectSquawkColor,
  selectStrokeStyle,
  selectStrokeWidth,
  snapshotHostPage,
  type BrowserBox,
} from './browser-helpers';
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

const PatternedCaptureEvidenceSchema = z
  .object({
    mimeTypes: z.array(z.string()).readonly(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sampledPixels: z.array(RgbaSchema).min(1).readonly(),
  })
  .strict()
  .readonly();
type PatternedCaptureEvidence = z.infer<typeof PatternedCaptureEvidenceSchema>;

const ViewportEvidenceSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    devicePixelRatio: z.number().positive(),
  })
  .strict()
  .readonly();
const DocumentPointSchema = z
  .object({ x: z.number(), y: z.number() })
  .strict()
  .readonly();
const PenPointsSchema = z
  .tuple([DocumentPointSchema, DocumentPointSchema])
  .rest(DocumentPointSchema)
  .readonly();
const HitEvidenceSchema = z
  .object({
    annotationId: z.string().nullable(),
    classes: z.array(z.string()).readonly(),
    tagName: z.string(),
  })
  .strict()
  .readonly();
const SiblingEvidenceSchema = z
  .object({
    annotationId: z.string(),
    className: z.string(),
    dashArray: z.string().nullable(),
  })
  .strict()
  .readonly();

function requiredAttribute(locator: Locator, name: string): Promise<string> {
  return locator.getAttribute(name).then((value) => z.string().parse(value));
}

async function clickCenter(page: Page, locator: Locator): Promise<void> {
  const box = await requiredBox(locator);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function sampleScreenshotPixel(
  png: PNG,
  point: Readonly<{ x: number; y: number }>,
): z.infer<typeof RgbaSchema> {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) {
    throw new Error('expected screenshot sample inside the viewport');
  }
  const offset = (y * png.width + x) * 4;
  return RgbaSchema.parse([
    png.data[offset],
    png.data[offset + 1],
    png.data[offset + 2],
    png.data[offset + 3],
  ]);
}

function penPoints(value: string): z.infer<typeof PenPointsSchema> {
  return PenPointsSchema.parse(
    value.split(' ').map((pair) => {
      const coordinates = pair.split(',').map(Number);
      return { x: coordinates[0], y: coordinates[1] };
    }),
  );
}

async function expectContinuousHitTarget(
  visible: Locator,
  annotationId: string,
): Promise<void> {
  const evidence = SiblingEvidenceSchema.parse(
    await visible.evaluate((element) => {
      const sibling = element.nextElementSibling;
      if (sibling === null) {
        throw new Error('expected an adjacent hit target');
      }
      return {
        annotationId: sibling.getAttribute('data-annotation-id'),
        className: sibling.getAttribute('class'),
        dashArray: sibling.getAttribute('stroke-dasharray'),
      };
    }),
  );
  expect(evidence).toEqual({
    annotationId,
    className: 'annotation-hit-target selection-hit-stroke',
    dashArray: null,
  });
}

async function captureEvidence(
  page: Page,
  boxes: readonly BrowserBox[],
  paletteCenter: Readonly<{ x: number; y: number }>,
): Promise<PatternedCaptureEvidence> {
  return PatternedCaptureEvidenceSchema.parse(
    await page.evaluate(
      async ({ sampleBoxes, chromePoint }) => {
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

        const sampledPixels: number[][] = [];
        for (const box of sampleBoxes) {
          for (let offset = -3; offset <= 3; offset += 1) {
            for (let step = 0; step <= 48; step += 1) {
              const horizontalX = box.x + (box.width * step) / 48;
              const verticalY = box.y + (box.height * step) / 48;
              sampledPixels.push(
                pixelAt(horizontalX, box.y + offset),
                pixelAt(horizontalX, box.y + box.height + offset),
                pixelAt(box.x + offset, verticalY),
                pixelAt(box.x + box.width + offset, verticalY),
              );
            }
          }
        }
        sampledPixels.push(pixelAt(chromePoint.x, chromePoint.y));
        bitmap.close();

        return {
          mimeTypes: item.types,
          width: canvas.width,
          height: canvas.height,
          sampledPixels,
        };
      },
      { sampleBoxes: boxes, chromePoint: paletteCenter },
    ),
  );
}

test.describe.configure({ mode: 'serial' });

test('projects patterned ink honestly through drawing, erasing, undo, and capture', async ({
  context,
  extensionId,
  page,
}) => {
  const origin = 'http://127.0.0.1:4173';
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(origin);
  await page.waitForLoadState('networkidle');
  const diagnostics = monitorPageDiagnostics(page);
  const hostSnapshot = await snapshotHostPage(page);
  const preMountPng = PNG.sync.read(await page.screenshot({ scale: 'css' }));

  await triggerExtensionAction(context, page, extensionId);
  const host = page.locator('html > #squawk-root');
  const overlay = host.locator('svg.overlay');
  const shell = host.locator('.palette-shell');
  const toolbar = page.getByRole('toolbar', { name: 'Squawk palette' });
  await expectHostPageUnchanged(page, hostSnapshot);

  const colorDropdown = page.getByRole('button', { name: /^Color / });
  await expect(colorDropdown).toBeVisible();
  await expect(colorDropdown).toHaveAttribute('data-color', '#e03131');
  const colorSwatch = colorDropdown.locator('.color-swatch');
  await expect(colorSwatch).toBeVisible();
  await expect(colorSwatch).toHaveCSS('background-color', 'rgb(224, 49, 49)');
  await colorDropdown.click();
  const colorOptions = page.getByRole('option');
  await expect(colorOptions).toHaveCount(6);
  expect(await colorOptions.allTextContents()).toEqual([
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  expect(
    await colorOptions.evaluateAll((options) =>
      options.map((option) => option.getAttribute('data-color')),
    ),
  ).toEqual(['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#ffffff']);
  for (const option of await colorOptions.all()) {
    await expect(option.locator('.color-swatch')).toBeVisible();
  }
  await colorDropdown.click();

  const widthTrigger = page.getByRole('button', {
    name: 'Stroke width 2',
    exact: true,
  });
  const styleTrigger = page.getByRole('button', {
    name: 'Stroke style solid',
    exact: true,
  });
  const textSizeTrigger = page.getByRole('button', {
    name: 'Text size S',
    exact: true,
  });
  const buttonLabels = await toolbar
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label')),
    );
  const widthIndex = buttonLabels.indexOf('Stroke width 2');
  const styleIndex = buttonLabels.indexOf('Stroke style solid');
  const textSizeIndex = buttonLabels.indexOf('Text size S');
  const undoIndex = buttonLabels.indexOf('Undo');
  expect(widthIndex).toBeGreaterThanOrEqual(0);
  expect(styleIndex).toBeGreaterThan(widthIndex);
  expect(textSizeIndex).toBeGreaterThan(styleIndex);
  expect(textSizeIndex).toBeLessThan(undoIndex);

  const eraserBox = await requiredBox(
    page.getByRole('button', { name: 'Eraser', exact: true }),
  );
  const colorBox = await requiredBox(colorDropdown);
  const widthBox = await requiredBox(widthTrigger);
  const styleBox = await requiredBox(styleTrigger);
  const textSizeBox = await requiredBox(textSizeTrigger);
  const undoBox = await requiredBox(
    page.getByRole('button', { name: 'Undo', exact: true }),
  );
  expect(eraserBox.x + eraserBox.width).toBeLessThanOrEqual(colorBox.x);
  expect(colorBox.x + colorBox.width).toBeLessThanOrEqual(widthBox.x);
  expect(widthBox.x + widthBox.width).toBeLessThan(styleBox.x);
  expect(styleBox.x + styleBox.width).toBeLessThan(textSizeBox.x);
  expect(textSizeBox.x + textSizeBox.width).toBeLessThan(undoBox.x);

  await page.setViewportSize({ width: 720, height: 600 });
  const narrowShellBox = await requiredBox(shell);
  expect(narrowShellBox.x).toBeGreaterThanOrEqual(8);
  expect(narrowShellBox.y).toBeGreaterThanOrEqual(8);
  expect(narrowShellBox.x + narrowShellBox.width).toBeLessThanOrEqual(712);
  expect(narrowShellBox.y + narrowShellBox.height).toBeLessThanOrEqual(592);
  const narrowColorBox = await requiredBox(colorDropdown);
  expect(narrowColorBox.width).toBe(36);
  expect(narrowColorBox.height).toBe(32);
  await colorDropdown.focus();
  await expect(colorDropdown).toBeFocused();
  const narrowControls = toolbar.getByRole('button');
  const narrowControlCount = await narrowControls.count();
  for (let index = 0; index < narrowControlCount; index += 1) {
    await narrowControls.nth(index).scrollIntoViewIfNeeded();
    await expect(narrowControls.nth(index)).toBeVisible();
  }
  await colorDropdown.scrollIntoViewIfNeeded();
  await expect(colorDropdown).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });

  await styleTrigger.click();
  const styleOptions: readonly [Locator, Locator, Locator] = [
    page.getByRole('option', {
      name: 'Stroke style solid',
      exact: true,
      includeHidden: true,
    }),
    page.getByRole('option', {
      name: 'Stroke style dashed',
      exact: true,
      includeHidden: true,
    }),
    page.getByRole('option', {
      name: 'Stroke style dotted',
      exact: true,
      includeHidden: true,
    }),
  ];
  await expect(styleTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(styleOptions[0]).toHaveAttribute('aria-selected', 'true');
  await expect(styleOptions[1]).toHaveAttribute('aria-selected', 'false');
  await expect(styleOptions[2]).toHaveAttribute('aria-selected', 'false');
  const sampleLines: readonly [Locator, Locator, Locator] = [
    styleOptions[0].locator('svg line'),
    styleOptions[1].locator('svg line'),
    styleOptions[2].locator('svg line'),
  ];
  for (const line of sampleLines) {
    await expect(line).toHaveAttribute('stroke-width', '2');
    await expect(line).toHaveAttribute('stroke-linecap', 'round');
  }
  await expect(sampleLines[0]).not.toHaveAttribute('stroke-dasharray');
  await expect(sampleLines[1]).toHaveAttribute('stroke-dasharray', '6 4');
  await expect(sampleLines[2]).toHaveAttribute('stroke-dasharray', '0 4');
  await styleOptions[1].click();
  await expect(
    page.getByRole('button', { name: 'Stroke style dashed', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');

  await expect(widthTrigger.locator('svg line')).not.toHaveAttribute(
    'stroke-dasharray',
  );
  await expect(widthTrigger.locator('.stroke-text-size')).toBeHidden();
  await widthTrigger.click();
  const widthOptions: readonly [Locator, Locator, Locator] = [
    page.getByRole('option', { name: 'Stroke width 2', exact: true }),
    page.getByRole('option', { name: 'Stroke width 4', exact: true }),
    page.getByRole('option', { name: 'Stroke width 6', exact: true }),
  ];
  expect(
    await page
      .locator('.stroke-width-select [role="option"]')
      .allTextContents(),
  ).toEqual(['', '', '']);
  await expect(widthOptions[0].locator('svg line')).toHaveAttribute(
    'stroke-width',
    '2',
  );
  await expect(widthOptions[1].locator('svg line')).toHaveAttribute(
    'stroke-width',
    '4',
  );
  await expect(widthOptions[2].locator('svg line')).toHaveAttribute(
    'stroke-width',
    '6',
  );
  for (const option of widthOptions) {
    await expect(option.locator('svg line')).not.toHaveAttribute(
      'stroke-dasharray',
    );
    await expect(option.locator('.stroke-text-size')).toBeHidden();
    await expect(option.locator('.stroke-menu-label')).toBeHidden();
  }
  await widthOptions[1].click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await selectSquawkColor(page, '#e03131');
  await page.mouse.move(80, 150);
  await page.mouse.down();
  await page.mouse.move(260, 250);
  const rectanglePreview = overlay.locator(
    'rect.annotation[data-phase="preview"][data-kind="rect-preview"]',
  );
  await expect(rectanglePreview).toHaveCount(1);
  await expect(rectanglePreview).toHaveAttribute('stroke-width', '4');
  await expect(rectanglePreview).toHaveAttribute('stroke-dasharray', '12 8');
  await expect(rectanglePreview).toHaveAttribute('stroke-linecap', 'round');
  const rectangleId = await requiredAttribute(
    rectanglePreview,
    'data-annotation-id',
  );
  await page.mouse.up();
  const rectangle = overlay.locator(
    'rect.annotation[data-phase="committed"][data-kind="rect"]',
  );
  await expect(rectangle).toHaveCount(1);
  await expect(rectangle).toHaveAttribute('data-annotation-id', rectangleId);
  await expect(rectangle).toHaveAttribute('stroke', '#e03131');
  await expect(rectangle).toHaveAttribute('stroke-width', '4');
  await expect(rectangle).toHaveAttribute('stroke-dasharray', '12 8');
  await expect(rectangle).toHaveAttribute('stroke-linecap', 'round');
  await expect(rectangle).toHaveAttribute('stroke-linejoin', 'round');
  await expectContinuousHitTarget(rectangle, rectangleId);

  await selectStrokeStyle(page, 'dotted');
  await selectStrokeWidth(page, 2);
  await page.getByRole('button', { name: 'Ellipse', exact: true }).click();
  await selectSquawkColor(page, '#2f9e44');
  await expect(rectangle).toHaveAttribute('stroke', '#e03131');
  await page.mouse.move(340, 150);
  await page.mouse.down();
  await page.mouse.move(500, 250);
  await page.mouse.up();
  const ellipse = overlay.locator(
    'ellipse.annotation[data-phase="committed"][data-kind="ellipse"]',
  );
  const ellipseId = await requiredAttribute(ellipse, 'data-annotation-id');
  await expect(ellipse).toHaveAttribute('stroke', '#2f9e44');
  await expect(ellipse).toHaveAttribute('stroke-width', '2');
  await expect(ellipse).toHaveAttribute('stroke-dasharray', '0 4');
  await expect(ellipse).toHaveAttribute('stroke-linecap', 'round');
  await expectContinuousHitTarget(ellipse, ellipseId);

  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await selectSquawkColor(page, '#1971c2');
  await expect(rectangle).toHaveAttribute('stroke', '#e03131');
  await expect(ellipse).toHaveAttribute('stroke', '#2f9e44');
  await page.mouse.move(80, 330);
  await page.mouse.down();
  await page.mouse.move(260, 420);
  await page.mouse.up();
  const arrow = overlay.locator(
    'g.annotation[data-phase="committed"][data-kind="arrow"]',
  );
  const arrowId = await requiredAttribute(arrow, 'data-annotation-id');
  const arrowShaft = arrow.locator('.arrow-shaft');
  const arrowHead = arrow.locator('.arrow-head');
  await expect(arrowShaft).toHaveAttribute('stroke', '#1971c2');
  await expect(arrowShaft).toHaveAttribute('stroke-width', '2');
  await expect(arrowShaft).toHaveAttribute('stroke-dasharray', '0 4');
  await expect(arrowShaft).toHaveAttribute('stroke-linecap', 'round');
  await expect(arrowHead).toHaveAttribute('fill', '#1971c2');
  await expect(arrowHead).not.toHaveAttribute('stroke');
  await expect(arrowHead).not.toHaveAttribute('stroke-dasharray');
  await expectContinuousHitTarget(arrow, arrowId);

  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  await selectSquawkColor(page, '#f08c00');
  await expect(rectangle).toHaveAttribute('stroke', '#e03131');
  await expect(ellipse).toHaveAttribute('stroke', '#2f9e44');
  await expect(arrowShaft).toHaveAttribute('stroke', '#1971c2');
  await page.mouse.move(360, 340);
  await page.mouse.down();
  await page.mouse.move(372, 340);
  await page.mouse.move(500, 340);
  await page.mouse.move(560, 410);
  await page.mouse.up();
  const pen = overlay.locator(
    'polyline.annotation[data-phase="committed"][data-kind="pen"]',
  );
  const penId = await requiredAttribute(pen, 'data-annotation-id');
  await expect(pen).toHaveAttribute('stroke', '#f08c00');
  await expect(pen).toHaveAttribute('stroke-width', '2');
  await expect(pen).toHaveAttribute('stroke-dasharray', '0 4');
  await expect(pen).toHaveAttribute('stroke-linecap', 'round');
  await expect(pen).toHaveAttribute('stroke-linejoin', 'round');
  await expectContinuousHitTarget(pen, penId);

  const committed = overlay.locator('.annotation[data-phase="committed"]');
  const originalOrder = await annotationIds(committed);
  expect(originalOrder).toEqual([rectangleId, ellipseId, arrowId, penId]);
  await expect(overlay.locator('.annotation-hit-target')).toHaveCount(5);
  await expect(
    overlay.locator('.annotation[data-phase="preview"]'),
  ).toHaveCount(0);

  await selectStrokeWidth(page, 6);
  await selectStrokeStyle(page, 'dashed');
  await page
    .getByRole('button', { name: 'Element picker', exact: true })
    .click();
  const navLink = page.locator('a.nav-link');
  const navBox = await requiredBox(navLink);
  await page.mouse.move(
    navBox.x + navBox.width / 2,
    navBox.y + navBox.height / 2,
  );
  const pickerHighlight = overlay.locator(
    'rect.picker-highlight[data-phase="picker-highlight"][data-kind="picker-highlight"]',
  );
  await expect(pickerHighlight).toHaveCount(1);
  await expect(pickerHighlight).toHaveAttribute('stroke-width', '6');
  await expect(pickerHighlight).toHaveAttribute('stroke-dasharray', '18 12');
  await expect(pickerHighlight).toHaveAttribute('stroke-linecap', 'round');
  await expect(
    overlay.locator('.picker-highlight + .annotation-hit-target'),
  ).toHaveCount(0);
  await clickCenter(page, navLink);
  await expect(pickerHighlight).toHaveCount(0);
  const rectangles = overlay.locator(
    'rect.annotation[data-phase="committed"][data-kind="rect"]',
  );
  const pickerRectangle = rectangles.nth(1);
  const pickerLabel = overlay.locator(
    'text.annotation[data-phase="committed"][data-kind="label"]',
  );
  await expect(rectangles).toHaveCount(2);
  await expect(pickerRectangle).toHaveAttribute('stroke-width', '6');
  await expect(pickerRectangle).toHaveAttribute('stroke-dasharray', '18 12');
  await expect(pickerRectangle).toHaveAttribute('stroke-linecap', 'round');
  await expect(pickerLabel).toHaveText('a.nav-link');
  await expect(pickerLabel).not.toHaveAttribute('stroke');
  await expect(pickerLabel).not.toHaveAttribute('stroke-dasharray');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rectangles).toHaveCount(1);
  await expect(pickerLabel).toHaveCount(0);
  expect(await annotationIds(committed)).toEqual(originalOrder);

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  const disabledStyleTrigger = page.getByRole('button', {
    name: 'Stroke style dashed',
    exact: true,
  });
  await expect(disabledStyleTrigger).toBeDisabled();
  await expect(styleOptions[0]).toHaveAttribute('aria-selected', 'false');
  await expect(styleOptions[1]).toHaveAttribute('aria-selected', 'true');
  await expect(styleOptions[2]).toHaveAttribute('aria-selected', 'false');
  await page.getByRole('button', { name: 'Interact', exact: true }).click();
  await expect(disabledStyleTrigger).toBeEnabled();
  await expect(styleOptions[1]).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  const points = penPoints(await requiredAttribute(pen, 'points'));
  const first = points[0];
  const second = points[1];
  const segmentLength = Math.hypot(second.x - first.x, second.y - first.y);
  expect(segmentLength).toBeGreaterThan(4);
  const gapPoint = DocumentPointSchema.parse({
    x: first.x + ((second.x - first.x) * 2) / segmentLength,
    y: first.y + ((second.y - first.y) * 2) / segmentLength,
  });
  const hitEvidence = HitEvidenceSchema.parse(
    await page.evaluate(({ x, y }) => {
      const outerElement = document.elementFromPoint(x, y);
      if (outerElement === null) {
        throw new Error('expected an element at the pen gap');
      }
      const element =
        outerElement.shadowRoot?.elementFromPoint(x, y) ?? outerElement;
      return {
        annotationId: element.getAttribute('data-annotation-id'),
        classes: Array.from(element.classList),
        tagName: element.tagName.toLowerCase(),
      };
    }, gapPoint),
  );
  expect(hitEvidence).toEqual({
    annotationId: penId,
    classes: ['annotation-hit-target', 'selection-hit-stroke'],
    tagName: 'polyline',
  });
  await page.mouse.move(gapPoint.x, gapPoint.y);
  await expect(pen).toHaveAttribute('opacity', '0.4');
  await expect(rectangle).toHaveAttribute('opacity', '1');
  await expect(ellipse).toHaveAttribute('opacity', '1');
  await expect(arrow).toHaveAttribute('opacity', '1');
  await page.mouse.down();
  await page.mouse.up();
  await expect(pen).toHaveCount(0);
  await expect(
    overlay.locator(`.annotation-hit-target[data-annotation-id="${penId}"]`),
  ).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(pen).toHaveCount(1);
  await expect(pen).toHaveAttribute('data-annotation-id', penId);
  await expect(pen).toHaveAttribute('stroke-dasharray', '0 4');
  expect(await annotationIds(committed)).toEqual(originalOrder);

  const toolbarBox = await requiredBox(toolbar);
  const paletteCenter = DocumentPointSchema.parse({
    x: toolbarBox.x + toolbarBox.width / 2,
    y: toolbarBox.y + toolbarBox.height / 2,
  });
  const preMountPalettePixel = sampleScreenshotPixel(
    preMountPng,
    paletteCenter,
  );
  const viewport = ViewportEvidenceSchema.parse(
    await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    })),
  );
  const sampleBoxes = [
    await requiredBox(rectangle),
    await requiredBox(ellipse),
    await requiredBox(arrowShaft),
    await requiredBox(pen),
  ];
  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await camera.click();
  await expect(host.getByRole('status')).toHaveText('Copied');
  const evidence = await captureEvidence(page, sampleBoxes, paletteCenter);
  expect(evidence.mimeTypes).toContain('image/png');
  expect(evidence.width).toBe(
    Math.round(viewport.width * viewport.devicePixelRatio),
  );
  expect(evidence.height).toBe(
    Math.round(viewport.height * viewport.devicePixelRatio),
  );
  expect(evidence.sampledPixels).toContainEqual([224, 49, 49, 255]);
  expect(evidence.sampledPixels).toContainEqual([47, 158, 68, 255]);
  expect(evidence.sampledPixels).toContainEqual([25, 113, 194, 255]);
  expect(evidence.sampledPixels).toContainEqual([240, 140, 0, 255]);
  expect(evidence.sampledPixels[evidence.sampledPixels.length - 1]).toEqual(
    preMountPalettePixel,
  );
  await expect(rectangle).toHaveAttribute('stroke-dasharray', '12 8');
  await expect(ellipse).toHaveAttribute('stroke-dasharray', '0 4');
  await expect(arrowShaft).toHaveAttribute('stroke-dasharray', '0 4');
  await expect(pen).toHaveAttribute('stroke-dasharray', '0 4');
  await expect(committed).toHaveCount(4);
  await expect(overlay.locator('.annotation-hit-target')).toHaveCount(5);
  await expectHostPageUnchanged(page, hostSnapshot);
  diagnostics.assertClean();

  await page.getByRole('button', { name: 'Close Squawk' }).click();
  await expect(host).toHaveCount(0);
  expect(await snapshotHostPage(page)).toEqual(hostSnapshot);
});
