import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { z } from 'zod';

import {
  annotationIds,
  expectHostPageUnchanged,
  monitorPageDiagnostics,
  requiredBox,
  selectSquawkColor,
  snapshotHostPage,
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
type Rgba = z.infer<typeof RgbaSchema>;

const PointSchema = z
  .object({ x: z.number(), y: z.number() })
  .strict()
  .readonly();
type Point = z.infer<typeof PointSchema>;

const ClipboardPngSchema = z
  .object({
    mimeTypes: z.array(z.string()).readonly(),
    bytes: z.array(z.number().int().min(0).max(255)).min(1).readonly(),
  })
  .strict()
  .readonly();

const HitEvidenceSchema = z
  .object({
    annotationId: z.string().nullable(),
    selectionTargetId: z.string().nullable(),
    classes: z.array(z.string()).readonly(),
    tagName: z.string(),
  })
  .strict()
  .readonly();
type HitEvidence = z.infer<typeof HitEvidenceSchema>;

const IdentityEvidenceSchema = z
  .object({
    annotationId: z.string().min(1),
    selectionTargetId: z.string().min(1),
    kind: z.enum(['rect', 'ellipse', 'arrow', 'pen', 'text', 'label']),
  })
  .strict()
  .readonly();
type IdentityEvidence = z.infer<typeof IdentityEvidenceSchema>;

const RectangleEvidenceSchema = z
  .object({
    annotationId: z.string().min(1),
    selectionTargetId: z.string().min(1),
    index: z.number().int().nonnegative(),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    fill: z.string(),
    fillOpacity: z.string().nullable(),
    stroke: z.string(),
    strokeWidth: z.string(),
    strokeDasharray: z.string().nullable(),
  })
  .strict()
  .readonly();
type RectangleEvidence = z.infer<typeof RectangleEvidenceSchema>;

const EllipseEvidenceSchema = z
  .object({
    annotationId: z.string().min(1),
    selectionTargetId: z.string().min(1),
    index: z.number().int().nonnegative(),
    cx: z.number(),
    cy: z.number(),
    rx: z.number().positive(),
    ry: z.number().positive(),
    fill: z.string(),
    fillOpacity: z.string().nullable(),
    stroke: z.string(),
    strokeWidth: z.string(),
    strokeDasharray: z.string().nullable(),
  })
  .strict()
  .readonly();
type EllipseEvidence = z.infer<typeof EllipseEvidenceSchema>;

const ViewportEvidenceSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    devicePixelRatio: z.number().positive(),
  })
  .strict()
  .readonly();

function requiredAttribute(locator: Locator, name: string): Promise<string> {
  return locator.getAttribute(name).then((value) => z.string().parse(value));
}

function samplePixel(png: PNG, point: Point, scale: number): Rgba {
  const x = Math.round(point.x * scale);
  const y = Math.round(point.y * scale);
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) {
    throw new Error('expected sample inside PNG bounds');
  }
  const offset = (y * png.width + x) * 4;
  return RgbaSchema.parse([
    png.data[offset],
    png.data[offset + 1],
    png.data[offset + 2],
    png.data[offset + 3],
  ]);
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
        tagName: inner?.tagName.toLowerCase() ?? '',
      };
    }, point),
  );
}

function committedById(overlay: Locator, annotationId: string): Locator {
  return overlay.locator(
    `.annotation[data-phase="committed"][data-annotation-id="${annotationId}"]`,
  );
}

function hitById(overlay: Locator, annotationId: string): Locator {
  return overlay.locator(
    `.annotation-hit-target[data-annotation-id="${annotationId}"]`,
  );
}

function selectionAffordances(overlay: Locator): Locator {
  return overlay.locator(':scope > .selection-affordance');
}

async function identityEvidence(
  overlay: Locator,
): Promise<readonly IdentityEvidence[]> {
  return z
    .array(IdentityEvidenceSchema)
    .readonly()
    .parse(
      await overlay
        .locator('.annotation[data-phase="committed"]')
        .evaluateAll((elements) =>
          elements.map((element) => ({
            annotationId: element.getAttribute('data-annotation-id'),
            selectionTargetId: element.getAttribute('data-selection-target-id'),
            kind: element.getAttribute('data-kind'),
          })),
        ),
    );
}

async function rectangleEvidence(
  overlay: Locator,
  annotationId: string,
): Promise<RectangleEvidence> {
  return RectangleEvidenceSchema.parse(
    await committedById(overlay, annotationId).evaluate((element) => {
      const numberAttribute = (name: string): number => {
        const value = element.getAttribute(name);
        if (value === null) {
          throw new Error(`expected ${name}`);
        }
        return Number(value);
      };
      const root = element.closest('svg.overlay');
      if (root === null) {
        throw new Error('expected Overlay root');
      }
      const committed = Array.from(
        root.querySelectorAll('.annotation[data-phase="committed"]'),
      );
      return {
        annotationId: element.getAttribute('data-annotation-id'),
        selectionTargetId: element.getAttribute('data-selection-target-id'),
        index: committed.indexOf(element),
        x: numberAttribute('x'),
        y: numberAttribute('y'),
        width: numberAttribute('width'),
        height: numberAttribute('height'),
        fill: element.getAttribute('fill'),
        fillOpacity: element.getAttribute('fill-opacity'),
        stroke: element.getAttribute('stroke'),
        strokeWidth: element.getAttribute('stroke-width'),
        strokeDasharray: element.getAttribute('stroke-dasharray'),
      };
    }),
  );
}

async function ellipseEvidence(
  overlay: Locator,
  annotationId: string,
): Promise<EllipseEvidence> {
  return EllipseEvidenceSchema.parse(
    await committedById(overlay, annotationId).evaluate((element) => {
      const numberAttribute = (name: string): number => {
        const value = element.getAttribute(name);
        if (value === null) {
          throw new Error(`expected ${name}`);
        }
        return Number(value);
      };
      const root = element.closest('svg.overlay');
      if (root === null) {
        throw new Error('expected Overlay root');
      }
      const committed = Array.from(
        root.querySelectorAll('.annotation[data-phase="committed"]'),
      );
      return {
        annotationId: element.getAttribute('data-annotation-id'),
        selectionTargetId: element.getAttribute('data-selection-target-id'),
        index: committed.indexOf(element),
        cx: numberAttribute('cx'),
        cy: numberAttribute('cy'),
        rx: numberAttribute('rx'),
        ry: numberAttribute('ry'),
        fill: element.getAttribute('fill'),
        fillOpacity: element.getAttribute('fill-opacity'),
        stroke: element.getAttribute('stroke'),
        strokeWidth: element.getAttribute('stroke-width'),
        strokeDasharray: element.getAttribute('stroke-dasharray'),
      };
    }),
  );
}

async function drawGesture(
  page: Page,
  tool: string,
  start: Point,
  end: Point,
  equalAxes = false,
): Promise<void> {
  await page.getByRole('button', { name: tool, exact: true }).click();
  await page.mouse.move(start.x, start.y);
  if (equalAxes) {
    await page.keyboard.down('Shift');
  }
  await page.mouse.down();
  if (tool === 'Pen') {
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2);
  }
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  if (equalAxes) {
    await page.keyboard.up('Shift');
  }
}

function centerOfRectangle(evidence: RectangleEvidence): Point {
  return PointSchema.parse({
    x: evidence.x + evidence.width / 2,
    y: evidence.y + evidence.height / 2,
  });
}

function captureClip(
  start: Point,
  end: Point,
): Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const size = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  return {
    x: Math.min(start.x, start.x + Math.sign(end.x - start.x) * size) - 12,
    y: Math.min(start.y, start.y + Math.sign(end.y - start.y) * size) - 12,
    width: size + 24,
    height: size + 24,
  };
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test('projects opaque Fill exactly from Palette through preview and commit', async ({
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
  const color = page.getByRole('combobox', { name: 'Color', exact: true });
  const fill = page.getByRole('button', { name: 'Fill shapes', exact: true });
  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await expectHostPageUnchanged(page, hostSnapshot);

  await expect(page.getByRole('combobox')).toHaveCount(1);
  await expect(color).toHaveValue('#e03131');
  expect(await color.locator('option').allTextContents()).toEqual([
    '⚫ Black',
    '🔴 Red',
    '🟢 Green',
    '🔵 Blue',
    '🟠 Orange',
    '⚪ White',
  ]);
  expect(
    await color
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => option.getAttribute('value')),
      ),
  ).toEqual(['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#ffffff']);

  await expect(fill).toHaveText('■');
  await expect(fill).toHaveAttribute('title', 'Fill shapes');
  await expect(fill).toHaveAttribute('aria-pressed', 'false');
  const fillAvailability: readonly Readonly<{
    tool: string;
    disabled: boolean;
  }>[] = [
    { tool: 'Interact', disabled: false },
    { tool: 'Rectangle', disabled: false },
    { tool: 'Ellipse', disabled: false },
    { tool: 'Select', disabled: true },
    { tool: 'Arrow', disabled: true },
    { tool: 'Pen', disabled: true },
    { tool: 'Text', disabled: true },
    { tool: 'Element picker', disabled: true },
    { tool: 'Eraser', disabled: true },
  ];
  for (const { tool, disabled } of fillAvailability) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    if (disabled) {
      await expect(fill).toBeDisabled();
    } else {
      await expect(fill).toBeEnabled();
    }
    await expect(fill).toHaveAttribute('aria-pressed', 'false');
  }

  await page.setViewportSize({ width: 719, height: 600 });
  await page.setViewportSize({ width: 720, height: 600 });
  const compactViewport = ViewportEvidenceSchema.parse(
    await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    })),
  );
  const compactShell = await requiredBox(shell);
  expect(compactShell.x).toBeGreaterThanOrEqual(8);
  expect(compactShell.y).toBeGreaterThanOrEqual(8);
  expect(compactShell.x + compactShell.width).toBeLessThanOrEqual(
    compactViewport.width - 8,
  );
  expect(compactShell.y + compactShell.height).toBeLessThanOrEqual(
    compactViewport.height - 8,
  );
  const paletteButtons = await toolbar.getByRole('button').all();
  for (const button of paletteButtons) {
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
  }
  await color.scrollIntoViewIfNeeded();
  await expect(color).toBeVisible();
  await fill.scrollIntoViewIfNeeded();
  await expect(fill).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });

  const unfilledStart = PointSchema.parse({ x: 70, y: 210 });
  const unfilledEnd = PointSchema.parse({ x: 230, y: 330 });
  await drawGesture(page, 'Rectangle', unfilledStart, unfilledEnd);
  const unfilledIdentity = (await identityEvidence(overlay)).at(-1);
  if (unfilledIdentity === undefined) {
    throw new Error('expected unfilled Rectangle identity');
  }
  const unfilled = committedById(overlay, unfilledIdentity.annotationId);
  await expect(unfilled).toHaveAttribute('fill', 'none');
  expect(await unfilled.getAttribute('fill-opacity')).toBeNull();
  await expect(
    overlay.locator(
      `.selection-hit-stroke[data-annotation-id="${unfilledIdentity.annotationId}"]`,
    ),
  ).toHaveCount(1);
  await expect(
    overlay.locator(
      `.selection-hit-fill[data-annotation-id="${unfilledIdentity.annotationId}"]`,
    ),
  ).toHaveCount(0);

  await fill.click();
  await expect(fill).toHaveAttribute('aria-pressed', 'true');
  await selectSquawkColor(page, '#ffffff');
  const squareStart = PointSchema.parse({ x: 280, y: 200 });
  const squareEnd = PointSchema.parse({ x: 400, y: 300 });
  await drawGesture(page, 'Rectangle', squareStart, squareEnd, true);
  const squareIdentity = (await identityEvidence(overlay)).at(-1);
  if (squareIdentity === undefined) {
    throw new Error('expected white square identity');
  }
  const square = committedById(overlay, squareIdentity.annotationId);
  const squareEvidence = await rectangleEvidence(
    overlay,
    squareIdentity.annotationId,
  );
  expect(squareEvidence.width).toBe(squareEvidence.height);
  expect(squareEvidence.width).toBe(
    Math.max(
      Math.abs(squareEnd.x - squareStart.x),
      Math.abs(squareEnd.y - squareStart.y),
    ),
  );
  expect(squareEvidence).toMatchObject({
    fill: '#ffffff',
    fillOpacity: '1',
    stroke: '#ffffff',
  });
  await expect(
    overlay.locator(
      `.selection-hit-stroke[data-annotation-id="${squareIdentity.annotationId}"]`,
    ),
  ).toHaveCount(1);
  await expect(
    overlay.locator(
      `.selection-hit-fill[data-annotation-id="${squareIdentity.annotationId}"]`,
    ),
  ).toHaveCount(1);

  await selectSquawkColor(page, '#2f9e44');
  await page
    .getByRole('button', { name: 'Stroke width 4', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Stroke style dotted', exact: true })
    .click();
  await page.getByRole('button', { name: 'Ellipse', exact: true }).click();
  const circleStart = PointSchema.parse({ x: 500, y: 200 });
  const circleEnd = PointSchema.parse({ x: 640, y: 320 });
  await page.mouse.move(circleStart.x, circleStart.y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(circleEnd.x, circleEnd.y);
  const preview = overlay.locator(
    '.annotation[data-phase="preview"][data-kind="ellipse-preview"]',
  );
  await expect(preview).toHaveCount(1);
  const previewAttributes = {
    id: await requiredAttribute(preview, 'data-annotation-id'),
    fill: await requiredAttribute(preview, 'fill'),
    fillOpacity: await requiredAttribute(preview, 'fill-opacity'),
    stroke: await requiredAttribute(preview, 'stroke'),
    strokeWidth: await requiredAttribute(preview, 'stroke-width'),
    strokeDasharray: await requiredAttribute(preview, 'stroke-dasharray'),
    cx: await requiredAttribute(preview, 'cx'),
    cy: await requiredAttribute(preview, 'cy'),
    rx: await requiredAttribute(preview, 'rx'),
    ry: await requiredAttribute(preview, 'ry'),
  };
  const clip = captureClip(circleStart, circleEnd);
  const previewClip = await page.screenshot({ scale: 'css', clip });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const circle = committedById(overlay, previewAttributes.id);
  await expect(circle).toHaveCount(1);
  const committedAttributes = {
    id: await requiredAttribute(circle, 'data-annotation-id'),
    fill: await requiredAttribute(circle, 'fill'),
    fillOpacity: await requiredAttribute(circle, 'fill-opacity'),
    stroke: await requiredAttribute(circle, 'stroke'),
    strokeWidth: await requiredAttribute(circle, 'stroke-width'),
    strokeDasharray: await requiredAttribute(circle, 'stroke-dasharray'),
    cx: await requiredAttribute(circle, 'cx'),
    cy: await requiredAttribute(circle, 'cy'),
    rx: await requiredAttribute(circle, 'rx'),
    ry: await requiredAttribute(circle, 'ry'),
  };
  expect(committedAttributes).toEqual(previewAttributes);
  expect(Number(committedAttributes.rx)).toBe(Number(committedAttributes.ry));
  const committedClip = await page.screenshot({ scale: 'css', clip });
  expect(committedClip.equals(previewClip)).toBe(true);
  expect(await rectangleEvidence(overlay, squareIdentity.annotationId)).toEqual(
    squareEvidence,
  );

  const circleIdentity = (await identityEvidence(overlay)).find(
    ({ annotationId }) => annotationId === previewAttributes.id,
  );
  if (circleIdentity === undefined) {
    throw new Error('expected circle identity');
  }
  const circleEvidence = await ellipseEvidence(
    overlay,
    circleIdentity.annotationId,
  );

  const textStart = PointSchema.parse({
    x: squareEvidence.x + 8,
    y: squareEvidence.y + 8,
  });
  const textEnd = PointSchema.parse({
    x: squareEvidence.x + 48,
    y: squareEvidence.y + 48,
  });
  await drawGesture(page, 'Text', textStart, textEnd);
  const editor = page.getByRole('textbox', { name: 'Squawk text editor' });
  await editor.fill('Fill');
  await editor.press('Escape');
  const textIdentity = (await identityEvidence(overlay)).at(-1);
  if (textIdentity === undefined || textIdentity.kind !== 'text') {
    throw new Error('expected Text identity');
  }
  const textHit = hitById(overlay, textIdentity.annotationId);
  const textHitBox = await requiredBox(textHit);
  const textSurface = PointSchema.parse({
    x: textHitBox.x + textHitBox.width / 2,
    y: textHitBox.y + textHitBox.height / 2,
  });
  const penStart = PointSchema.parse({
    x: circleEvidence.cx - circleEvidence.rx / 2,
    y: circleEvidence.cy - circleEvidence.ry / 3,
  });
  const penEnd = PointSchema.parse({
    x: circleEvidence.cx + circleEvidence.rx / 2,
    y: circleEvidence.cy - circleEvidence.ry / 3,
  });
  await drawGesture(page, 'Pen', penStart, penEnd);
  const penIdentity = (await identityEvidence(overlay)).at(-1);
  if (penIdentity === undefined || penIdentity.kind !== 'pen') {
    throw new Error('expected Pen identity');
  }
  const penSurface = PointSchema.parse({
    x: (penStart.x + penEnd.x) / 2,
    y: (penStart.y + penEnd.y) / 2,
  });
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const textHitEvidence = await shadowHitEvidence(page, textSurface);
  expect(textHitEvidence.annotationId).toBe(textIdentity.annotationId);
  expect(textHitEvidence.selectionTargetId).toBe(
    textIdentity.selectionTargetId,
  );
  const penHitEvidence = await shadowHitEvidence(page, penSurface);
  expect(penHitEvidence.annotationId).toBe(penIdentity.annotationId);
  expect(penHitEvidence.selectionTargetId).toBe(penIdentity.selectionTargetId);

  const unfilledBefore = await rectangleEvidence(
    overlay,
    unfilledIdentity.annotationId,
  );
  await page.mouse.click(
    unfilledBefore.x + unfilledBefore.width / 2,
    unfilledBefore.y + unfilledBefore.height / 2,
  );
  await expect(selectionAffordances(overlay)).toHaveCount(0);
  expect(
    await rectangleEvidence(overlay, unfilledIdentity.annotationId),
  ).toEqual(unfilledBefore);

  const squareBeforeMove = await rectangleEvidence(
    overlay,
    squareIdentity.annotationId,
  );
  const squareCenter = centerOfRectangle(squareBeforeMove);
  const squareHitEvidence = await shadowHitEvidence(page, squareCenter);
  expect(squareHitEvidence.annotationId).toBe(squareIdentity.annotationId);
  expect(squareHitEvidence.selectionTargetId).toBe(
    squareIdentity.selectionTargetId,
  );
  expect(squareHitEvidence.classes).toContain('selection-hit-fill');
  await page.mouse.click(squareCenter.x, squareCenter.y);
  await expect(selectionAffordances(overlay)).toHaveCount(1);
  const squareFillHit = overlay.locator(
    `.selection-hit-fill[data-annotation-id="${squareIdentity.annotationId}"]`,
  );
  await page.mouse.move(squareCenter.x, squareCenter.y);
  await expect(squareFillHit).toHaveCSS('cursor', 'move');
  const moveDelta = PointSchema.parse({ x: 17.5, y: -3.25 });
  const siblingOrderBeforeMove = await annotationIds(
    overlay.locator('.annotation[data-phase="committed"]'),
  );
  await page.mouse.down();
  await page.mouse.move(
    squareCenter.x + moveDelta.x,
    squareCenter.y + moveDelta.y,
  );
  await page.mouse.up();
  const squareAfterMove = await rectangleEvidence(
    overlay,
    squareIdentity.annotationId,
  );
  expect(squareAfterMove).toEqual({
    ...squareBeforeMove,
    x: squareBeforeMove.x + moveDelta.x,
    y: squareBeforeMove.y + moveDelta.y,
  });
  expect(
    await annotationIds(overlay.locator('.annotation[data-phase="committed"]')),
  ).toEqual(siblingOrderBeforeMove);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await rectangleEvidence(overlay, squareIdentity.annotationId)).toEqual(
    squareBeforeMove,
  );
  expect(
    await annotationIds(overlay.locator('.annotation[data-phase="committed"]')),
  ).toEqual(siblingOrderBeforeMove);

  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  const circleBeforeErase = await ellipseEvidence(
    overlay,
    circleIdentity.annotationId,
  );
  const orderBeforeErase = await annotationIds(
    overlay.locator('.annotation[data-phase="committed"]'),
  );
  const erasePoint = PointSchema.parse({
    x: circleBeforeErase.cx,
    y: circleBeforeErase.cy + circleBeforeErase.ry / 2,
  });
  await page.mouse.click(erasePoint.x, erasePoint.y);
  await expect(committedById(overlay, circleIdentity.annotationId)).toHaveCount(
    0,
  );
  await expect(hitById(overlay, circleIdentity.annotationId)).toHaveCount(0);
  expect(
    await annotationIds(overlay.locator('.annotation[data-phase="committed"]')),
  ).toEqual(
    orderBeforeErase.filter(
      (annotationId) => annotationId !== circleIdentity.annotationId,
    ),
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await ellipseEvidence(overlay, circleIdentity.annotationId)).toEqual(
    circleBeforeErase,
  );
  expect(
    await annotationIds(overlay.locator('.annotation[data-phase="committed"]')),
  ).toEqual(orderBeforeErase);

  await expect(fill).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Element picker', exact: true })
    .click();
  await expect(fill).toBeDisabled();
  await expect(fill).toHaveAttribute('aria-pressed', 'true');
  const navLink = page.getByRole('link', {
    name: 'Jump to destination',
    exact: true,
  });
  const navBox = await requiredBox(navLink);
  await page.mouse.click(
    navBox.x + navBox.width / 2,
    navBox.y + navBox.height / 2,
  );
  const identitiesAfterPicker = await identityEvidence(overlay);
  const pickerLabel = identitiesAfterPicker.at(-1);
  const pickerRectangle = identitiesAfterPicker.at(-2);
  if (
    pickerLabel === undefined ||
    pickerLabel.kind !== 'label' ||
    pickerRectangle === undefined ||
    pickerRectangle.kind !== 'rect'
  ) {
    throw new Error('expected Picker rectangle and Label');
  }
  expect(pickerRectangle.selectionTargetId).toBe(pickerLabel.selectionTargetId);
  const pickerVisible = committedById(overlay, pickerRectangle.annotationId);
  await expect(pickerVisible).toHaveAttribute('fill', 'none');
  expect(await pickerVisible.getAttribute('fill-opacity')).toBeNull();
  await expect(
    overlay.locator(
      `.selection-hit-fill[data-annotation-id="${pickerRectangle.annotationId}"]`,
    ),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await expect(fill).toBeEnabled();
  await expect(fill).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const squareBeforeCapture = await rectangleEvidence(
    overlay,
    squareIdentity.annotationId,
  );
  const captureSquareCenter = centerOfRectangle(squareBeforeCapture);
  await page.mouse.click(captureSquareCenter.x, captureSquareCenter.y);
  await expect(selectionAffordances(overlay)).toHaveCount(1);
  const squareSample = PointSchema.parse({
    x: squareBeforeCapture.x + squareBeforeCapture.width * 0.72,
    y: squareBeforeCapture.y + squareBeforeCapture.height * 0.72,
  });
  const circleSample = PointSchema.parse({
    x: circleBeforeErase.cx,
    y: circleBeforeErase.cy + circleBeforeErase.ry * 0.45,
  });
  const haloPoint = PointSchema.parse({
    x: squareBeforeCapture.x - 3,
    y: squareBeforeCapture.y + squareBeforeCapture.height / 2,
  });
  const shellBox = await requiredBox(shell);
  const paletteCenter = PointSchema.parse({
    x: shellBox.x + shellBox.width / 2,
    y: shellBox.y + shellBox.height / 2,
  });
  expect(samplePixel(preMountPng, squareSample, 1)).not.toEqual([
    255, 255, 255, 255,
  ]);
  const liveSelectedPng = PNG.sync.read(
    await page.screenshot({ scale: 'css' }),
  );
  expect(samplePixel(liveSelectedPng, haloPoint, 1)).not.toEqual(
    samplePixel(preMountPng, haloPoint, 1),
  );

  await camera.click();
  await expect(host.getByRole('status')).toHaveText('Copied');
  const captured = await clipboardPng(page);
  const viewport = ViewportEvidenceSchema.parse(
    await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    })),
  );
  expect(captured.width).toBe(
    Math.round(viewport.width * viewport.devicePixelRatio),
  );
  expect(captured.height).toBe(
    Math.round(viewport.height * viewport.devicePixelRatio),
  );
  expect(
    samplePixel(captured, squareSample, viewport.devicePixelRatio),
  ).toEqual([255, 255, 255, 255]);
  expect(
    samplePixel(captured, circleSample, viewport.devicePixelRatio),
  ).toEqual([47, 158, 68, 255]);
  expect(
    samplePixel(captured, paletteCenter, viewport.devicePixelRatio),
  ).toEqual(samplePixel(preMountPng, paletteCenter, 1));
  expect(samplePixel(captured, haloPoint, viewport.devicePixelRatio)).toEqual(
    samplePixel(preMountPng, haloPoint, 1),
  );
  await expect(selectionAffordances(overlay)).toHaveCount(1);
  await expect(square).toHaveAttribute('fill', '#ffffff');
  await expect(circle).toHaveAttribute('fill', '#2f9e44');
  await expectHostPageUnchanged(page, hostSnapshot);
  diagnostics.assertClean();

  await page.getByRole('button', { name: 'Close Squawk', exact: true }).click();
  await expect(host).toHaveCount(0);
});
