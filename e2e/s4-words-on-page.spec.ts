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

const ClipboardTextEvidenceSchema = z
  .object({
    mimeTypes: z.array(z.string()).readonly(),
    annotationPixels: z.array(RgbaSchema).min(1).readonly(),
  })
  .strict()
  .readonly();
type ClipboardTextEvidence = z.infer<typeof ClipboardTextEvidenceSchema>;

test.describe.configure({ mode: 'serial' });

test('writes exact multiline text through the built extension', async ({
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

  const toolbar = page.getByRole('toolbar', { name: 'Squawk palette' });
  const labels = await toolbar
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.slice(0, 10).map((button) => button.getAttribute('aria-label')),
    );
  expect(labels).toEqual([
    'Drag Squawk palette',
    'Interact',
    'Select',
    'Rectangle',
    'Ellipse',
    'Arrow',
    'Pen',
    'Text',
    'Element picker',
    'Eraser',
  ]);

  for (const width of [2, 4, 6]) {
    await expect(
      page.getByRole('button', { name: `Stroke width ${String(width)}` }),
    ).toBeVisible();
  }
  const textTool = page.getByRole('button', { name: 'Text', exact: true });
  await textTool.click();
  await expect(textTool).toHaveAttribute('aria-pressed', 'true');
  for (const size of ['S', 'M', 'L']) {
    await expect(
      page.getByRole('button', { name: `Text size ${size}` }),
    ).toHaveText(size);
  }

  await selectSquawkColor(page, '#e03131');
  await page.getByRole('button', { name: 'Text size L' }).click();
  const redCard = await requiredBox(page.locator('#target-red'));
  const firstPoint = {
    x: Math.round(redCard.x + redCard.width + 16),
    y: Math.round(redCard.y + 12),
  };
  const firstBox = {
    start: firstPoint,
    end: { x: firstPoint.x + 160, y: firstPoint.y + 60 },
  };
  await dragPointer(page, { constraint: 'free', ...firstBox });

  const editor = page.getByRole('textbox', { name: 'Squawk text editor' });
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  const editorBox = await requiredBox(editor);
  expect(editorBox.x).toBe(firstBox.start.x);
  expect(editorBox.y).toBe(firstBox.start.y);
  expect(editorBox.width).toBe(firstBox.end.x - firstBox.start.x);
  expect(editorBox.height).toBe(firstBox.end.y - firstBox.start.y);
  expect(
    await editor.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        caretColor: style.caretColor,
      };
    }),
  ).toEqual({
    fontFamily: '"SUSE Mono", monospace',
    fontSize: '24px',
    lineHeight: '28.8px',
    caretColor: 'rgb(224, 49, 49)',
  });

  await editor.pressSequentially('first');
  await editor.press('Enter');
  await editor.pressSequentially('second');
  await expect(editor).toHaveValue('first\nsecond');
  const preview = page.locator(
    '#squawk-root svg.overlay text.annotation[data-phase="preview"][data-kind="text-preview"]',
  );
  await expect(preview).toHaveCount(1);
  await expect(preview).toHaveAttribute('font-family', 'SUSE Mono, monospace');
  await expect(preview.locator('tspan')).toHaveCount(2);
  expect(await preview.locator('tspan').allTextContents()).toEqual([
    'first',
    'second',
  ]);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.fonts].some(
          (font) => font.family === '"SUSE Mono"' && font.status === 'loaded',
        ),
      ),
    )
    .toBe(true);

  await editor.press('Escape');
  await expect(editor).toBeHidden();
  const committed = page.locator(
    '#squawk-root svg.overlay text.annotation[data-phase="committed"][data-kind="text"]',
  );
  await expect(committed).toHaveCount(1);
  await expect(committed).toHaveAttribute(
    'font-family',
    'SUSE Mono, monospace',
  );
  await page.keyboard.press('Control+z');
  await expect(committed).toHaveCount(0);

  await dragPointer(page, { constraint: 'free', ...firstBox });
  await expect(editor).toBeFocused();
  await editor.press('Escape');
  await expect(committed).toHaveCount(0);
  await expect(textTool).toHaveAttribute('aria-pressed', 'true');

  const acceptanceBox = {
    start: {
      x: Math.round(redCard.x + redCard.width + 16),
      y: Math.round(redCard.y + redCard.height - 32),
    },
    end: {
      x: Math.round(redCard.x + redCard.width + 256),
      y: Math.round(redCard.y + redCard.height + 28),
    },
  };
  await dragPointer(page, { constraint: 'free', ...acceptanceBox });
  await editor.pressSequentially('this padding is wrong');
  await expect(preview).toHaveCount(1);
  const glyphScreenshotStyle = `
    .text-box-guide { visibility: hidden !important; }
    .text-editor { caret-color: transparent !important; }
  `;
  const previewPng = await preview.screenshot({ style: glyphScreenshotStyle });

  const blueCard = await requiredBox(page.locator('#target-blue'));
  await page.mouse.click(
    Math.round(blueCard.x + blueCard.width / 2),
    Math.round(blueCard.y + blueCard.height / 2),
  );
  await expect(editor).toBeHidden();
  await expect(preview).toHaveCount(0);
  await expect(committed).toHaveCount(1);
  const committedPng = await committed.screenshot({
    style: glyphScreenshotStyle,
  });
  expect(committedPng.equals(previewPng)).toBe(true);

  const annotationBox = await requiredBox(committed);
  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await camera.click();
  await expect(page.locator('#squawk-root').getByRole('status')).toHaveText(
    'Copied',
  );

  const evaluatedEvidence = await page.evaluate(async (annotation) => {
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

    const ratio = window.devicePixelRatio;
    const left = Math.max(0, Math.floor(annotation.x * ratio));
    const top = Math.max(0, Math.floor(annotation.y * ratio));
    const right = Math.min(
      bitmap.width,
      Math.ceil((annotation.x + annotation.width) * ratio),
    );
    const bottom = Math.min(
      bitmap.height,
      Math.ceil((annotation.y + annotation.height) * ratio),
    );
    const pixels = context.getImageData(
      left,
      top,
      right - left,
      bottom - top,
    ).data;
    const annotationPixels: number[][] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      annotationPixels.push([
        pixels[index] ?? 0,
        pixels[index + 1] ?? 0,
        pixels[index + 2] ?? 0,
        pixels[index + 3] ?? 0,
      ]);
    }
    bitmap.close();
    return { mimeTypes: item.types, annotationPixels };
  }, annotationBox);
  const evidence: ClipboardTextEvidence =
    ClipboardTextEvidenceSchema.parse(evaluatedEvidence);

  expect(evidence.mimeTypes).toContain('image/png');
  expect(evidence.annotationPixels).toContainEqual([224, 49, 49, 255]);
  await expect(page.locator('#squawk-root')).toHaveCount(1);
  await expect(committed).toHaveCount(1);
});
