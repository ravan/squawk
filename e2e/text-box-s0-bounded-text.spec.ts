import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { z } from 'zod';

import {
  dragPointer,
  expectHostPageUnchanged,
  monitorPageDiagnostics,
  requiredBox,
  selectSquawkColor,
  snapshotHostPage,
} from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

const PointSchema = z
  .object({ x: z.number(), y: z.number() })
  .strict()
  .readonly();
type Point = z.infer<typeof PointSchema>;

const BrowserBoxSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict()
  .readonly();
type BrowserBox = z.infer<typeof BrowserBoxSchema>;

const PointerCaptureEvidenceSchema = z
  .object({
    pointerId: z.number().int().positive(),
    captured: z.literal('true'),
    prevented: z.literal('true'),
  })
  .strict()
  .readonly();
type PointerCaptureEvidence = z.infer<typeof PointerCaptureEvidenceSchema>;

const GuideEvidenceSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    fill: z.literal('none'),
    stroke: z.literal('#e03131'),
    strokeWidth: z.literal('1'),
    strokeDasharray: z.literal('4 3'),
    opacity: z.literal('0.65'),
  })
  .strict()
  .readonly();
type GuideEvidence = z.infer<typeof GuideEvidenceSchema>;

const TextLineEvidenceSchema = z
  .object({ text: z.string(), x: z.number(), y: z.number() })
  .strict()
  .readonly();
const CommittedTextEvidenceSchema = z
  .object({
    annotationId: z.string().min(1),
    selectionTargetId: z.string().min(1),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    minimumHeight: z.number().positive(),
    color: z.literal('#e03131'),
    size: z.literal(24),
    lines: z.array(TextLineEvidenceSchema).min(1).readonly(),
  })
  .strict()
  .readonly();
type CommittedTextEvidence = z.infer<typeof CommittedTextEvidenceSchema>;

const EditorOverflowEvidenceSchema = z
  .object({
    clientWidth: z.number().int().nonnegative(),
    scrollWidth: z.number().int().nonnegative(),
    clientHeight: z.number().int().nonnegative(),
    scrollHeight: z.number().int().nonnegative(),
    fontSize: z.literal('24px'),
    lineHeight: z.literal('28.8px'),
  })
  .strict()
  .readonly();

const HitEvidenceSchema = z
  .object({
    annotationId: z.string().nullable(),
    selectionTargetId: z.string().nullable(),
    classes: z.array(z.string()).readonly(),
  })
  .strict()
  .readonly();
type HitEvidence = z.infer<typeof HitEvidenceSchema>;

const ClipboardPngSchema = z
  .object({
    mimeTypes: z.array(z.string()).readonly(),
    bytes: z.array(z.number().int().min(0).max(255)).min(1).readonly(),
  })
  .strict()
  .readonly();

const ViewportEvidenceSchema = z
  .object({ devicePixelRatio: z.number().positive() })
  .strict()
  .readonly();

const AUTHORED_TEXT = 'alpha  beta\n\nbutton#submit-with-a-very-long-token';
const TEXT_COLOR = [224, 49, 49, 255] as const;

function requiredAttribute(locator: Locator, name: string): Promise<string> {
  return locator
    .getAttribute(name)
    .then((value) => z.string().min(1).parse(value));
}

async function guideEvidence(guide: Locator): Promise<GuideEvidence> {
  return GuideEvidenceSchema.parse({
    x: Number(await requiredAttribute(guide, 'x')),
    y: Number(await requiredAttribute(guide, 'y')),
    width: Number(await requiredAttribute(guide, 'width')),
    height: Number(await requiredAttribute(guide, 'height')),
    fill: await requiredAttribute(guide, 'fill'),
    stroke: await requiredAttribute(guide, 'stroke'),
    strokeWidth: await requiredAttribute(guide, 'stroke-width'),
    strokeDasharray: await requiredAttribute(guide, 'stroke-dasharray'),
    opacity: await requiredAttribute(guide, 'opacity'),
  });
}

async function beginCapturedPointer(
  page: Page,
  overlay: Locator,
  point: Point,
): Promise<PointerCaptureEvidence> {
  await overlay.evaluate((element) => {
    delete element.dataset.testPointerId;
    delete element.dataset.testPointerCaptured;
    delete element.dataset.testPointerPrevented;
    element.addEventListener(
      'pointerdown',
      (event) => {
        if (!(event instanceof PointerEvent)) {
          return;
        }
        element.dataset.testPointerId = String(event.pointerId);
        element.dataset.testPointerCaptured = String(
          element.hasPointerCapture(event.pointerId),
        );
        element.dataset.testPointerPrevented = String(event.defaultPrevented);
      },
      { once: true },
    );
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect
    .poll(() => overlay.getAttribute('data-test-pointer-id'))
    .not.toBeNull();
  return PointerCaptureEvidenceSchema.parse({
    pointerId: Number(await overlay.getAttribute('data-test-pointer-id')),
    captured: await overlay.getAttribute('data-test-pointer-captured'),
    prevented: await overlay.getAttribute('data-test-pointer-prevented'),
  });
}

async function shadowHitEvidence(
  page: Page,
  point: Point,
): Promise<HitEvidence> {
  return HitEvidenceSchema.parse(
    await page.evaluate(({ x, y }) => {
      const outer = document.elementFromPoint(x, y);
      const inner = outer?.shadowRoot?.elementFromPoint(x, y) ?? outer;
      return {
        annotationId: inner?.getAttribute('data-annotation-id') ?? null,
        selectionTargetId:
          inner?.getAttribute('data-selection-target-id') ?? null,
        classes: inner === null ? [] : Array.from(inner.classList),
      };
    }, point),
  );
}

async function committedTextEvidence(
  text: Locator,
): Promise<CommittedTextEvidence> {
  return CommittedTextEvidenceSchema.parse(
    await text.evaluate((element) => {
      const numberAttribute = (target: Element, name: string): number => {
        const value = target.getAttribute(name);
        if (value === null) {
          throw new Error(`expected ${name}`);
        }
        return Number(value);
      };
      const root = element.closest('svg.overlay');
      const annotationId = element.getAttribute('data-annotation-id');
      if (root === null || annotationId === null) {
        throw new Error('expected committed Text identity');
      }
      const selectionTarget = Array.from(
        root.querySelectorAll('.text-selection-hit-target'),
      ).find(
        (target) => target.getAttribute('data-annotation-id') === annotationId,
      );
      if (selectionTarget === undefined) {
        throw new Error('expected Text Selection target');
      }
      return {
        annotationId,
        selectionTargetId: element.getAttribute('data-selection-target-id'),
        x: numberAttribute(element, 'x'),
        y: numberAttribute(element, 'y'),
        width: numberAttribute(selectionTarget, 'width'),
        minimumHeight: numberAttribute(selectionTarget, 'height'),
        color: element.getAttribute('fill'),
        size: numberAttribute(element, 'font-size'),
        lines: Array.from(element.querySelectorAll('tspan'), (line) => ({
          text: line.textContent,
          x: numberAttribute(line, 'x'),
          y: numberAttribute(line, 'y'),
        })),
      };
    }),
  );
}

function expectTranslatedText(
  before: CommittedTextEvidence,
  after: CommittedTextEvidence,
  delta: Point,
): void {
  expect(after).toEqual({
    ...before,
    x: before.x + delta.x,
    y: before.y + delta.y,
    lines: before.lines.map((line) => ({
      ...line,
      x: line.x + delta.x,
      y: line.y + delta.y,
    })),
  });
}

async function clipboardPng(page: Page): Promise<PNG> {
  const evidence = ClipboardPngSchema.parse(
    await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const item = items.at(0);
      if (item === undefined || !item.types.includes('image/png')) {
        throw new Error('expected image/png clipboard data');
      }
      const blob = await item.getType('image/png');
      return {
        mimeTypes: item.types,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      };
    }),
  );
  expect(evidence.mimeTypes).toContain('image/png');
  return PNG.sync.read(Buffer.from(evidence.bytes));
}

function samplePixel(
  png: PNG,
  point: Point,
  scale: number,
): readonly [number, number, number, number] {
  const x = Math.round(point.x * scale);
  const y = Math.round(point.y * scale);
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) {
    throw new Error('expected sample inside PNG bounds');
  }
  const offset = (y * png.width + x) * 4;
  return [
    png.data[offset] ?? 0,
    png.data[offset + 1] ?? 0,
    png.data[offset + 2] ?? 0,
    png.data[offset + 3] ?? 0,
  ];
}

function containsPixel(
  png: PNG,
  box: BrowserBox,
  scale: number,
  expected: readonly [number, number, number, number],
): boolean {
  const left = Math.max(0, Math.floor(box.x * scale));
  const top = Math.max(0, Math.floor(box.y * scale));
  const right = Math.min(png.width, Math.ceil((box.x + box.width) * scale));
  const bottom = Math.min(png.height, Math.ceil((box.y + box.height) * scale));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * png.width + x) * 4;
      if (
        png.data[offset] === expected[0] &&
        png.data[offset + 1] === expected[1] &&
        png.data[offset + 2] === expected[2] &&
        png.data[offset + 3] === expected[3]
      ) {
        return true;
      }
    }
  }
  return false;
}

async function assertNoTextArtifact(
  editor: Locator,
  guide: Locator,
  committed: Locator,
): Promise<void> {
  await expect(editor).toBeHidden();
  await expect(guide).toHaveCount(0);
  await expect(committed).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test('draws, wraps, moves, erases, restores, and captures bounded Text', async ({
  context,
  extensionId,
  page,
}) => {
  const origin = 'http://127.0.0.1:4173';
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin,
  });
  let releaseFonts = (): void => {};
  const fontGate = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await context.route('**/*.woff2', async (route) => {
    await fontGate;
    await route.continue();
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
  const editor = page.getByRole('textbox', { name: 'Squawk text editor' });
  const guide = overlay.locator('rect.text-box-guide');
  const preview = overlay.locator(
    'text.annotation[data-phase="preview"][data-kind="text-preview"]',
  );
  const committed = overlay.locator(
    'text.annotation[data-phase="committed"][data-kind="text"]',
  );
  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await expectHostPageUnchanged(page, hostSnapshot);

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await selectSquawkColor(page, '#e03131');
  await page.getByRole('button', { name: 'Text size L', exact: true }).click();

  await page.mouse.click(940, 100);
  await assertNoTextArtifact(editor, guide, committed);
  await dragPointer(page, {
    constraint: 'free',
    start: { x: 940, y: 100 },
    end: { x: 963, y: 160 },
  });
  await assertNoTextArtifact(editor, guide, committed);
  await dragPointer(page, {
    constraint: 'free',
    start: { x: 940, y: 100 },
    end: { x: 1030, y: 100 },
  });
  await assertNoTextArtifact(editor, guide, committed);

  const cancelledPointer = await beginCapturedPointer(
    page,
    overlay,
    PointSchema.parse({ x: 940, y: 100 }),
  );
  await page.mouse.move(1030, 160);
  await overlay.dispatchEvent('pointercancel', {
    pointerId: cancelledPointer.pointerId,
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: 1030,
    clientY: 160,
  });
  await page.mouse.up();
  await assertNoTextArtifact(editor, guide, committed);

  const lostPointer = await beginCapturedPointer(
    page,
    overlay,
    PointSchema.parse({ x: 940, y: 100 }),
  );
  await page.mouse.move(1030, 160);
  await overlay.dispatchEvent('lostpointercapture', {
    pointerId: lostPointer.pointerId,
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: 1030,
    clientY: 160,
  });
  await page.mouse.up();
  await assertNoTextArtifact(editor, guide, committed);

  await dragPointer(page, {
    constraint: 'free',
    start: { x: 940, y: 100 },
    end: { x: 1030, y: 160 },
  });
  await expect(editor).toBeFocused();
  await page.mouse.click(1150, 100);
  await assertNoTextArtifact(editor, guide, committed);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(committed).toHaveCount(0);

  const boxLeft = 700;
  const boxTop = 140;
  const boxRight = 790;
  const boxBottom = 200;
  const owner = await beginCapturedPointer(
    page,
    overlay,
    PointSchema.parse({ x: boxRight, y: boxBottom }),
  );
  await expect(camera).toBeDisabled();
  await overlay.dispatchEvent('pointermove', {
    pointerId: owner.pointerId + 1,
    isPrimary: true,
    button: -1,
    buttons: 1,
    clientX: boxLeft,
    clientY: boxTop,
  });
  await overlay.dispatchEvent('pointerup', {
    pointerId: owner.pointerId + 1,
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: boxLeft,
    clientY: boxTop,
  });
  await expect(editor).toBeHidden();

  await page.keyboard.down('Shift');
  await page.mouse.move(boxLeft + 10, boxTop + 10);
  await page.keyboard.up('Shift');
  const intermediateGuide = await guideEvidence(guide);
  expect(intermediateGuide).toMatchObject({
    x: boxLeft + 10,
    y: boxTop + 10,
    width: boxRight - boxLeft - 10,
    height: boxBottom - boxTop - 10,
  });
  await overlay.dispatchEvent('pointermove', {
    pointerId: owner.pointerId + 1,
    isPrimary: true,
    button: -1,
    buttons: 1,
    clientX: boxLeft + 30,
    clientY: boxTop + 30,
  });
  expect(await guideEvidence(guide)).toEqual(intermediateGuide);
  await overlay.dispatchEvent('pointerup', {
    pointerId: owner.pointerId,
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: boxLeft,
    clientY: boxTop,
  });
  await page.mouse.up();

  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(camera).toBeEnabled();
  const editorAtEntry = await requiredBox(editor);
  expect(editorAtEntry).toEqual({
    x: boxLeft,
    y: boxTop,
    width: boxRight - boxLeft,
    height: boxBottom - boxTop,
  });
  const overflowAtEntry = EditorOverflowEvidenceSchema.parse(
    await editor.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    }),
  );
  expect(overflowAtEntry.scrollWidth).toBeLessThanOrEqual(
    overflowAtEntry.clientWidth,
  );
  expect(overflowAtEntry.scrollHeight).toBeLessThanOrEqual(
    overflowAtEntry.clientHeight,
  );

  await editor.fill(AUTHORED_TEXT);
  await expect(editor).toHaveValue(AUTHORED_TEXT);
  await expect(preview).toHaveCount(1);
  const authoredLines = await preview.locator('tspan').allTextContents();
  const emptyHardLine = authoredLines.indexOf('');
  expect(emptyHardLine).toBeGreaterThan(0);
  expect(authoredLines.slice(0, emptyHardLine).join('')).toBe('alpha  beta');
  expect(authoredLines.at(0)?.endsWith(' ')).toBe(true);
  const tokenLines = authoredLines.slice(emptyHardLine + 1);
  expect(tokenLines.length).toBeGreaterThan(1);
  expect(tokenLines.join('')).toBe('button#submit-with-a-very-long-token');
  expect(
    `${authoredLines.slice(0, emptyHardLine).join('')}\n\n${tokenLines.join('')}`,
  ).toBe(AUTHORED_TEXT);

  const tspanY = z
    .array(z.number())
    .parse(
      await preview
        .locator('tspan')
        .evaluateAll((lines) =>
          lines.map((line) => Number(line.getAttribute('y'))),
        ),
    );
  for (let index = 1; index < tspanY.length; index += 1) {
    expect((tspanY[index] ?? 0) - (tspanY[index - 1] ?? 0)).toBeCloseTo(28.8);
  }

  const editorBox = await requiredBox(editor);
  const editorDeclaredHeight = z
    .number()
    .parse(
      await editor.evaluate((element) =>
        Number.parseFloat(element.style.height),
      ),
    );
  const editingGuide = await guideEvidence(guide);
  expect(editingGuide).toEqual({
    x: boxLeft,
    y: boxTop,
    width: boxRight - boxLeft,
    height: editorDeclaredHeight,
    fill: 'none',
    stroke: '#e03131',
    strokeWidth: '1',
    strokeDasharray: '4 3',
    opacity: '0.65',
  });
  expect(editorBox.height).toBeGreaterThan(boxBottom - boxTop);
  expect(editorBox.width).toBe(boxRight - boxLeft);
  const overflow = EditorOverflowEvidenceSchema.parse(
    await editor.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    }),
  );
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);

  await overlay.evaluate((element) => {
    element.dataset.testFontRerender = '0';
    const observer = new MutationObserver((records) => {
      const rendered = records.some((record) =>
        Array.from(record.addedNodes).some(
          (node) =>
            node instanceof SVGTextElement &&
            node.dataset.kind === 'text-preview',
        ),
      );
      if (rendered) {
        element.dataset.testFontRerender = '1';
        observer.disconnect();
      }
    });
    observer.observe(element, { childList: true });
  });
  releaseFonts();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.fonts].some(
          (font) => font.family === '"SUSE Mono"' && font.status === 'loaded',
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() => overlay.getAttribute('data-test-font-rerender'))
    .toBe('1');
  const loadedLineWidths = z
    .array(z.number())
    .parse(
      await preview
        .locator('tspan')
        .evaluateAll((lines) =>
          lines.map((line) =>
            line instanceof SVGTextContentElement
              ? line.getComputedTextLength()
              : Number.POSITIVE_INFINITY,
          ),
        ),
    );
  expect(loadedLineWidths.every((width) => width <= editorBox.width)).toBe(
    true,
  );

  const glyphScreenshotStyle = `
    .text-box-guide { visibility: hidden !important; }
    .text-editor { caret-color: transparent !important; }
  `;
  const previewPng = await preview.screenshot({ style: glyphScreenshotStyle });
  await editor.press('Escape');
  await expect(editor).toBeHidden();
  await expect(guide).toHaveCount(0);
  await expect(committed).toHaveCount(1);
  const committedPng = await committed.screenshot({
    style: glyphScreenshotStyle,
  });
  expect(committedPng.equals(previewPng)).toBe(true);
  const firstCommit = await committedTextEvidence(committed);
  expect(firstCommit.annotationId).not.toBe(firstCommit.selectionTargetId);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(committed).toHaveCount(0);

  const retainedStart = PointSchema.parse({ x: 650, y: 300 });
  const retainedEnd = PointSchema.parse({ x: 1150, y: 500 });
  await dragPointer(page, {
    constraint: 'free',
    start: retainedStart,
    end: retainedEnd,
  });
  await editor.fill(AUTHORED_TEXT);
  await expect(editor).toBeFocused();
  await camera.click();
  await expect(host.getByRole('status')).toHaveText('Copied');
  await expect(editor).toBeHidden();
  await expect(committed).toHaveCount(1);
  const retained = await committedTextEvidence(committed);
  expect(retained).toMatchObject({
    x: retainedStart.x,
    y: retainedStart.y,
    width: retainedEnd.x - retainedStart.x,
    minimumHeight: retainedEnd.y - retainedStart.y,
    color: '#e03131',
    size: 24,
  });

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const blankPoint = PointSchema.parse({
    x: retained.x + retained.width / 2,
    y: retained.y + retained.minimumHeight - 16,
  });
  const blankSelectHit = await shadowHitEvidence(page, blankPoint);
  expect(blankSelectHit.annotationId).toBe(retained.annotationId);
  expect(blankSelectHit.selectionTargetId).toBe(retained.selectionTargetId);
  const delta = PointSchema.parse({ x: 24, y: 18 });
  await page.mouse.move(blankPoint.x, blankPoint.y);
  await page.mouse.down();
  await page.mouse.move(blankPoint.x + delta.x, blankPoint.y + delta.y);
  await page.mouse.up();
  const moved = await committedTextEvidence(committed);
  expectTranslatedText(retained, moved, delta);
  await expect(overlay.locator(':scope > .selection-affordance')).toHaveCount(
    1,
  );

  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  const movedBlankPoint = PointSchema.parse({
    x: blankPoint.x + delta.x,
    y: blankPoint.y + delta.y,
  });
  const blankEraseHit = await shadowHitEvidence(page, movedBlankPoint);
  expect(blankEraseHit.annotationId).not.toBe(moved.annotationId);
  const firstLineTarget = overlay
    .locator(
      `.text-eraser-hit-target[data-annotation-id="${moved.annotationId}"]`,
    )
    .first();
  const firstLineBox = await requiredBox(firstLineTarget);
  const paintedPoint = PointSchema.parse({
    x: firstLineBox.x + firstLineBox.width / 2,
    y: firstLineBox.y + firstLineBox.height / 2,
  });
  const paintedHit = await shadowHitEvidence(page, paintedPoint);
  expect(paintedHit.annotationId).toBe(moved.annotationId);
  expect(paintedHit.selectionTargetId).toBeNull();
  expect(paintedHit.classes).toContain('text-eraser-hit-target');
  await page.mouse.click(paintedPoint.x, paintedPoint.y);
  await expect(committed).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(committed).toHaveCount(1);
  expect(await committedTextEvidence(committed)).toEqual(moved);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.mouse.click(movedBlankPoint.x, movedBlankPoint.y);
  const selectionAffordance = overlay.locator(':scope > .selection-affordance');
  await expect(selectionAffordance).toHaveCount(1);
  const selectionBox = await requiredBox(selectionAffordance);
  const haloPoint = PointSchema.parse({
    x: selectionBox.x + 2,
    y: selectionBox.y,
  });
  const liveSelectedPng = PNG.sync.read(
    await page.screenshot({ scale: 'css' }),
  );
  expect(samplePixel(liveSelectedPng, haloPoint, 1)).not.toEqual(
    samplePixel(preMountPng, haloPoint, 1),
  );
  const shellBox = await requiredBox(host.locator('.palette-shell'));
  const paletteCenter = PointSchema.parse({
    x: shellBox.x + shellBox.width / 2,
    y: shellBox.y + shellBox.height / 2,
  });

  await camera.click();
  await expect(host.getByRole('status')).toHaveText('Copied');
  const captured = await clipboardPng(page);
  const viewport = ViewportEvidenceSchema.parse(
    await page.evaluate(() => ({ devicePixelRatio: window.devicePixelRatio })),
  );
  const movedBox = BrowserBoxSchema.parse({
    x: moved.x,
    y: moved.y,
    width: moved.width,
    height: moved.minimumHeight,
  });
  expect(
    containsPixel(captured, movedBox, viewport.devicePixelRatio, TEXT_COLOR),
  ).toBe(true);
  expect(
    samplePixel(captured, movedBlankPoint, viewport.devicePixelRatio),
  ).toEqual(samplePixel(preMountPng, movedBlankPoint, 1));
  expect(samplePixel(captured, haloPoint, viewport.devicePixelRatio)).toEqual(
    samplePixel(preMountPng, haloPoint, 1),
  );
  expect(
    samplePixel(captured, paletteCenter, viewport.devicePixelRatio),
  ).toEqual(samplePixel(preMountPng, paletteCenter, 1));
  await expect(editor).toBeHidden();
  await expect(guide).toHaveCount(0);
  await expect(committed).toHaveCount(1);
  expect(await committedTextEvidence(committed)).toEqual(moved);
  await expectHostPageUnchanged(page, hostSnapshot);
  diagnostics.assertClean();
});
