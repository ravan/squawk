import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { z } from 'zod';

import {
  expectHostPageUnchanged,
  monitorPageDiagnostics,
  requiredBox,
  selectSquawkColor,
  selectStrokeStyle,
  selectStrokeWidth,
  selectTextSize,
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

const IdentityEvidenceSchema = z
  .object({
    annotationId: z.string().min(1),
    selectionTargetId: z.string().min(1),
    kind: z.enum(['rect', 'ellipse', 'arrow', 'pen', 'text', 'label']),
  })
  .strict()
  .readonly();
type IdentityEvidence = z.infer<typeof IdentityEvidenceSchema>;

const InvariantsSchema = z
  .object({
    tagName: z.string(),
    color: z.string().nullable(),
    strokeWidth: z.string().nullable(),
    strokeDasharray: z.string().nullable(),
    strokeLinecap: z.string().nullable(),
    strokeLinejoin: z.string().nullable(),
    fill: z.string().nullable(),
    fontSize: z.string().nullable(),
    fontFamily: z.string().nullable(),
    fontWeight: z.string().nullable(),
    textLines: z.array(z.string()).readonly(),
  })
  .strict()
  .readonly();

const RectPositionSchema = z
  .object({
    kind: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .strict()
  .readonly();
const EllipsePositionSchema = z
  .object({
    kind: z.literal('ellipse'),
    cx: z.number(),
    cy: z.number(),
    rx: z.number(),
    ry: z.number(),
  })
  .strict()
  .readonly();
const ArrowPositionSchema = z
  .object({
    kind: z.literal('arrow'),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
  })
  .strict()
  .readonly();
const PenPositionSchema = z
  .object({
    kind: z.literal('pen'),
    points: z.array(PointSchema).min(2).readonly(),
  })
  .strict()
  .readonly();
const TextPositionSchema = z
  .object({
    kind: z.literal('text'),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    minimumHeight: z.number().positive(),
  })
  .strict()
  .readonly();
const LabelPositionSchema = z
  .object({ kind: z.literal('label'), x: z.number(), y: z.number() })
  .strict()
  .readonly();
const PositionEvidenceSchema = z.discriminatedUnion('kind', [
  RectPositionSchema,
  EllipsePositionSchema,
  ArrowPositionSchema,
  PenPositionSchema,
  TextPositionSchema,
  LabelPositionSchema,
]);
const AnnotationEvidenceSchema = z
  .object({
    annotationId: z.string().min(1),
    selectionTargetId: z.string().min(1),
    index: z.number().int().nonnegative(),
    position: PositionEvidenceSchema,
    invariants: InvariantsSchema,
  })
  .strict()
  .readonly();
type AnnotationEvidence = z.infer<typeof AnnotationEvidenceSchema>;

const ClipboardPngSchema = z
  .object({
    mimeTypes: z.array(z.string()).readonly(),
    bytes: z.array(z.number().int().min(0).max(255)).min(1).readonly(),
  })
  .strict()
  .readonly();

const ViewportSchema = z
  .object({
    devicePixelRatio: z.number().positive(),
  })
  .strict()
  .readonly();

function requiredAttribute(locator: Locator, name: string): Promise<string> {
  return locator
    .getAttribute(name)
    .then((value) => z.string().min(1).parse(value));
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

async function annotationEvidence(
  overlay: Locator,
  annotationId: string,
): Promise<AnnotationEvidence> {
  return AnnotationEvidenceSchema.parse(
    await committedById(overlay, annotationId).evaluate((element) => {
      const numberAttribute = (target: Element, name: string): number => {
        const value = target.getAttribute(name);
        if (value === null) {
          throw new Error(`expected ${name}`);
        }
        return Number(value);
      };
      const parsePoints = (
        value: string,
      ): readonly Readonly<{ x: number; y: number }>[] =>
        value.split(' ').map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          if (x === undefined || y === undefined) {
            throw new Error('expected Pen point coordinates');
          }
          return { x, y };
        });
      const kind = element.getAttribute('data-kind');
      const overlay = element.closest('svg.overlay');
      if (overlay === null) {
        throw new Error('expected the SVG Overlay');
      }
      const all = Array.from(
        overlay.querySelectorAll('.annotation[data-phase="committed"]'),
      );
      let position: Readonly<
        Record<string, string | number | readonly Point[]>
      >;
      let styleTarget: Element = element;
      switch (kind) {
        case 'rect':
          position = {
            kind,
            x: numberAttribute(element, 'x'),
            y: numberAttribute(element, 'y'),
            width: numberAttribute(element, 'width'),
            height: numberAttribute(element, 'height'),
          };
          break;
        case 'ellipse':
          position = {
            kind,
            cx: numberAttribute(element, 'cx'),
            cy: numberAttribute(element, 'cy'),
            rx: numberAttribute(element, 'rx'),
            ry: numberAttribute(element, 'ry'),
          };
          break;
        case 'arrow': {
          const shaft = element.querySelector('.arrow-shaft');
          if (shaft === null) {
            throw new Error('expected an Arrow shaft');
          }
          styleTarget = shaft;
          position = {
            kind,
            x1: numberAttribute(shaft, 'x1'),
            y1: numberAttribute(shaft, 'y1'),
            x2: numberAttribute(shaft, 'x2'),
            y2: numberAttribute(shaft, 'y2'),
          };
          break;
        }
        case 'pen': {
          const points = element.getAttribute('points');
          if (points === null) {
            throw new Error('expected Pen points');
          }
          position = { kind, points: parsePoints(points) };
          break;
        }
        case 'text': {
          const annotationId = element.getAttribute('data-annotation-id');
          const selectionTarget = Array.from(
            overlay.querySelectorAll('.text-selection-hit-target'),
          ).find(
            (target) =>
              target.getAttribute('data-annotation-id') === annotationId,
          );
          if (selectionTarget === undefined) {
            throw new Error('expected Text Selection target');
          }
          position = {
            kind,
            x: numberAttribute(element, 'x'),
            y: numberAttribute(element, 'y'),
            width: numberAttribute(selectionTarget, 'width'),
            minimumHeight: numberAttribute(selectionTarget, 'height'),
          };
          break;
        }
        case 'label':
          position = {
            kind,
            x: numberAttribute(element, 'x'),
            y: numberAttribute(element, 'y'),
          };
          break;
        default:
          throw new Error('expected a committed Annotation kind');
      }
      return {
        annotationId: element.getAttribute('data-annotation-id'),
        selectionTargetId: element.getAttribute('data-selection-target-id'),
        index: all.indexOf(element),
        position,
        invariants: {
          tagName: element.tagName.toLowerCase(),
          color: styleTarget.getAttribute('stroke'),
          strokeWidth: styleTarget.getAttribute('stroke-width'),
          strokeDasharray: styleTarget.getAttribute('stroke-dasharray'),
          strokeLinecap: styleTarget.getAttribute('stroke-linecap'),
          strokeLinejoin: styleTarget.getAttribute('stroke-linejoin'),
          fill: styleTarget.getAttribute('fill'),
          fontSize: element.getAttribute('font-size'),
          fontFamily: element.getAttribute('font-family'),
          fontWeight: element.getAttribute('font-weight'),
          textLines:
            kind === 'text'
              ? Array.from(
                  element.querySelectorAll('tspan'),
                  (line) => line.textContent,
                )
              : [element.textContent],
        },
      };
    }),
  );
}

async function annotationEvidenceEntry(
  overlay: Locator,
  annotationId: string,
): Promise<readonly [string, AnnotationEvidence]> {
  return [annotationId, await annotationEvidence(overlay, annotationId)];
}

async function evidenceById(
  overlay: Locator,
): Promise<ReadonlyMap<string, AnnotationEvidence>> {
  const identities = await identityEvidence(overlay);
  return new Map(
    await Promise.all(
      identities.map(({ annotationId }) =>
        annotationEvidenceEntry(overlay, annotationId),
      ),
    ),
  );
}

function expectTranslated(
  before: AnnotationEvidence,
  after: AnnotationEvidence,
  delta: Point,
): void {
  expect(after.annotationId).toBe(before.annotationId);
  expect(after.selectionTargetId).toBe(before.selectionTargetId);
  expect(after.index).toBe(before.index);
  expect(after.invariants).toEqual(before.invariants);
  const previous = before.position;
  const current = after.position;
  expect(current.kind).toBe(previous.kind);
  switch (previous.kind) {
    case 'rect':
      if (current.kind !== 'rect') {
        throw new Error('expected rectangle evidence');
      }
      expect(current).toEqual({
        ...previous,
        x: previous.x + delta.x,
        y: previous.y + delta.y,
      });
      return;
    case 'ellipse':
      if (current.kind !== 'ellipse') {
        throw new Error('expected ellipse evidence');
      }
      expect(current).toEqual({
        ...previous,
        cx: previous.cx + delta.x,
        cy: previous.cy + delta.y,
      });
      return;
    case 'arrow':
      if (current.kind !== 'arrow') {
        throw new Error('expected Arrow evidence');
      }
      expect(current).toEqual({
        ...previous,
        x1: previous.x1 + delta.x,
        y1: previous.y1 + delta.y,
        x2: previous.x2 + delta.x,
        y2: previous.y2 + delta.y,
      });
      return;
    case 'pen':
      if (current.kind !== 'pen') {
        throw new Error('expected Pen evidence');
      }
      expect(current.points).toEqual(
        previous.points.map((point) => ({
          x: point.x + delta.x,
          y: point.y + delta.y,
        })),
      );
      return;
    case 'text':
    case 'label':
      if (current.kind !== previous.kind) {
        throw new Error('expected text evidence');
      }
      expect(current).toEqual({
        ...previous,
        x: previous.x + delta.x,
        y: previous.y + delta.y,
      });
  }
}

function pointOnAnnotation(evidence: AnnotationEvidence): Point {
  switch (evidence.position.kind) {
    case 'rect':
      return PointSchema.parse({
        x: evidence.position.x + evidence.position.width / 2,
        y: evidence.position.y,
      });
    case 'ellipse':
      return PointSchema.parse({
        x: evidence.position.cx + evidence.position.rx,
        y: evidence.position.cy,
      });
    case 'arrow':
      return PointSchema.parse({
        x: (evidence.position.x1 + evidence.position.x2) / 2,
        y: (evidence.position.y1 + evidence.position.y2) / 2,
      });
    case 'pen': {
      const first = evidence.position.points.at(0);
      const second = evidence.position.points.at(1);
      if (first === undefined || second === undefined) {
        throw new Error('expected two Pen points');
      }
      return PointSchema.parse({
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      });
    }
    case 'text':
    case 'label':
      return PointSchema.parse({
        x: evidence.position.x,
        y: evidence.position.y,
      });
  }
}

async function dragSelection(
  page: Page,
  overlay: Locator,
  camera: Locator,
  annotationId: string,
  start: Point,
  delta: Point,
  intermediateMoves = false,
): Promise<void> {
  const hit = hitById(overlay, annotationId).first();
  await page.mouse.move(start.x, start.y);
  await expect(hit).toHaveCSS('cursor', 'move');
  await page.mouse.down();
  if (intermediateMoves) {
    await page.mouse.move(start.x + delta.x / 3, start.y + delta.y / 3);
    await page.mouse.move(
      start.x + (delta.x * 2) / 3,
      start.y + (delta.y * 2) / 3,
    );
  }
  await page.mouse.move(start.x + delta.x, start.y + delta.y);
  await expect(overlay).toHaveCSS('cursor', 'grabbing');
  await expect(camera).toBeDisabled();
  await page.mouse.up();
  await expect(camera).toBeEnabled();
}

async function moveOrdinaryTarget(
  page: Page,
  overlay: Locator,
  camera: Locator,
  annotationId: string,
  start: Point,
  delta: Point,
  intermediateMoves = false,
): Promise<
  Readonly<{ before: AnnotationEvidence; after: AnnotationEvidence }>
> {
  const beforeAll = await evidenceById(overlay);
  const before = beforeAll.get(annotationId);
  if (before === undefined) {
    throw new Error('expected target evidence before move');
  }
  await dragSelection(
    page,
    overlay,
    camera,
    annotationId,
    start,
    delta,
    intermediateMoves,
  );
  const afterAll = await evidenceById(overlay);
  const after = afterAll.get(annotationId);
  if (after === undefined) {
    throw new Error('expected target evidence after move');
  }
  expectTranslated(before, after, delta);
  for (const [id, evidence] of beforeAll) {
    if (id !== annotationId) {
      expect(afterAll.get(id)).toEqual(evidence);
    }
  }
  await expect(selectionAffordances(overlay)).toHaveCount(1);
  return { before, after };
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

async function drawGesture(
  page: Page,
  tool: string,
  start: Point,
  end: Point,
): Promise<void> {
  await page.getByRole('button', { name: tool, exact: true }).click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  if (tool === 'Pen') {
    await page.mouse.move((start.x + end.x) / 2, start.y);
  }
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

async function selectTargetWithoutMoving(
  page: Page,
  evidence: AnnotationEvidence,
): Promise<void> {
  const point = pointOnAnnotation(evidence);
  await page.mouse.click(point.x, point.y);
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

test('selects, moves, undoes, cancels, and captures every Selection target honestly', async ({
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
  let hostSnapshot = await snapshotHostPage(page);
  const baselinePng = PNG.sync.read(await page.screenshot({ scale: 'css' }));

  await triggerExtensionAction(context, page, extensionId);
  const host = page.locator('html > #squawk-root');
  const overlay = host.locator('svg.overlay');
  const toolbar = page.getByRole('toolbar', { name: 'Squawk palette' });
  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await expectHostPageUnchanged(page, hostSnapshot);
  await expect(overlay).toHaveCount(1);

  const toolButtons = toolbar.getByRole('button');
  expect(
    await toolButtons.evaluateAll((buttons) =>
      buttons.slice(0, 11).map((button) => button.getAttribute('aria-label')),
    ),
  ).toEqual([
    'Drag Squawk palette',
    'Interact',
    'Select',
    'Rectangle',
    'Ellipse',
    'Arrow',
    'Pen',
    'Text',
    'Element picker',
    'Eyedropper',
    'Eraser',
  ]);
  const interact = page.getByRole('button', { name: 'Interact', exact: true });
  const select = page.getByRole('button', { name: 'Select', exact: true });
  await expect(interact).toHaveText('☝');
  await expect(select).toHaveText('↖');
  await expect(select).toHaveAttribute('title', 'Select');

  await selectSquawkColor(page, '#e03131');
  await selectStrokeWidth(page, 2);
  await selectStrokeStyle(page, 'solid');
  await drawGesture(
    page,
    'Rectangle',
    PointSchema.parse({ x: 80, y: 260 }),
    PointSchema.parse({ x: 280, y: 380 }),
  );
  const solidRectangle = (await identityEvidence(overlay)).at(-1);
  if (solidRectangle === undefined) {
    throw new Error('expected the solid rectangle');
  }

  await selectSquawkColor(page, '#f08c00');
  await selectStrokeWidth(page, 4);
  await selectStrokeStyle(page, 'dashed');
  await drawGesture(
    page,
    'Rectangle',
    PointSchema.parse({ x: 200, y: 260 }),
    PointSchema.parse({ x: 400, y: 380 }),
  );
  const patternedRectangle = (await identityEvidence(overlay)).at(-1);
  if (patternedRectangle === undefined) {
    throw new Error('expected the patterned rectangle');
  }

  await selectSquawkColor(page, '#2f9e44');
  await selectStrokeWidth(page, 2);
  await selectStrokeStyle(page, 'solid');
  await drawGesture(
    page,
    'Ellipse',
    PointSchema.parse({ x: 470, y: 260 }),
    PointSchema.parse({ x: 620, y: 380 }),
  );
  const ellipse = (await identityEvidence(overlay)).at(-1);
  if (ellipse === undefined) {
    throw new Error('expected the ellipse');
  }

  await selectSquawkColor(page, '#1971c2');
  await drawGesture(
    page,
    'Arrow',
    PointSchema.parse({ x: 80, y: 450 }),
    PointSchema.parse({ x: 260, y: 530 }),
  );
  const arrow = (await identityEvidence(overlay)).at(-1);
  if (arrow === undefined) {
    throw new Error('expected the Arrow');
  }

  await selectSquawkColor(page, '#f08c00');
  await drawGesture(
    page,
    'Pen',
    PointSchema.parse({ x: 350, y: 450 }),
    PointSchema.parse({ x: 520, y: 530 }),
  );
  const pen = (await identityEvidence(overlay)).at(-1);
  if (pen === undefined) {
    throw new Error('expected the Pen mark');
  }

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await selectSquawkColor(page, '#e03131');
  await selectTextSize(page, 'M');
  await drawGesture(
    page,
    'Text',
    PointSchema.parse({ x: 700, y: 280 }),
    PointSchema.parse({ x: 900, y: 360 }),
  );
  const editor = page.getByRole('textbox', { name: 'Squawk text editor' });
  await editor.fill(' \n ');
  await editor.press('Escape');
  const text = (await identityEvidence(overlay)).at(-1);
  if (text === undefined) {
    throw new Error('expected whitespace Text');
  }

  await page
    .getByRole('button', { name: 'Element picker', exact: true })
    .click();
  const navLink = page.getByRole('link', {
    name: 'Jump to destination',
    exact: true,
  });
  const navBox = await requiredBox(navLink);
  await page.mouse.click(
    navBox.x + navBox.width / 2,
    navBox.y + navBox.height / 2,
  );

  const identities = await identityEvidence(overlay);
  expect(identities).toHaveLength(8);
  const pickerLabel = identities.find(({ kind }) => kind === 'label');
  if (pickerLabel === undefined) {
    throw new Error('expected Picker Label identity');
  }
  const pickerRectangle = identities.find(
    ({ kind, selectionTargetId }) =>
      kind === 'rect' && selectionTargetId === pickerLabel.selectionTargetId,
  );
  if (pickerRectangle === undefined) {
    throw new Error('expected Picker rectangle identity');
  }
  expect(pickerRectangle.annotationId).not.toBe(pickerLabel.annotationId);
  expect(pickerRectangle.selectionTargetId).toBe(pickerLabel.selectionTargetId);
  const pickerIds = new Set([
    pickerRectangle.annotationId,
    pickerLabel.annotationId,
  ]);
  const ordinary = identities.filter(
    ({ annotationId }) => !pickerIds.has(annotationId),
  );
  expect(
    new Set(ordinary.map(({ selectionTargetId }) => selectionTargetId)).size,
  ).toBe(ordinary.length);
  expect(
    identities.every(
      ({ annotationId, selectionTargetId }) =>
        annotationId.length > 0 && selectionTargetId.length > 0,
    ),
  ).toBe(true);

  const color = page.getByRole('button', { name: /^Color / });
  const widthTrigger = page.getByRole('button', {
    name: /^Stroke width [246]$/,
  });
  const styleTrigger = page.getByRole('button', {
    name: /^Stroke style (solid|dashed|dotted)$/,
  });
  const colorBeforeSelect = await color.getAttribute('data-color');
  const widthBeforeSelect = await widthTrigger.getAttribute('aria-label');
  const styleBeforeSelect = await styleTrigger.getAttribute('aria-label');
  await select.click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await expect(interact).toHaveAttribute('aria-pressed', 'false');
  await expect(color).toBeDisabled();
  await expect(widthTrigger).toBeDisabled();
  await expect(styleTrigger).toBeDisabled();
  expect(await color.getAttribute('data-color')).toBe(colorBeforeSelect);
  expect(await widthTrigger.getAttribute('aria-label')).toBe(widthBeforeSelect);
  expect(await styleTrigger.getAttribute('aria-label')).toBe(styleBeforeSelect);

  await interact.click();
  const increment = page.getByRole('button', {
    name: 'Increment',
    exact: true,
  });
  const output = page.locator('output[role="status"]');
  const beforeIncrement = z
    .number()
    .int()
    .parse(Number(await output.textContent()));
  await increment.click();
  await expect(output).toHaveText(String(beforeIncrement + 1));
  hostSnapshot = await snapshotHostPage(page);
  await select.click();
  await expect(overlay).toHaveCSS('cursor', 'default');

  const solidBeforeInterior = await annotationEvidence(
    overlay,
    solidRectangle.annotationId,
  );
  if (solidBeforeInterior.position.kind !== 'rect') {
    throw new Error('expected rectangle position');
  }
  await page.mouse.click(
    solidBeforeInterior.position.x + solidBeforeInterior.position.width / 2,
    solidBeforeInterior.position.y + solidBeforeInterior.position.height / 2,
  );
  await expect(selectionAffordances(overlay)).toHaveCount(0);
  expect(
    await annotationEvidence(overlay, solidRectangle.annotationId),
  ).toEqual(solidBeforeInterior);

  const solidBeforeOverlap = await annotationEvidence(
    overlay,
    solidRectangle.annotationId,
  );
  const patternedBeforeOverlap = await annotationEvidence(
    overlay,
    patternedRectangle.annotationId,
  );
  await dragSelection(
    page,
    overlay,
    camera,
    patternedRectangle.annotationId,
    PointSchema.parse({ x: 230, y: 260 }),
    PointSchema.parse({ x: 11, y: 7 }),
  );
  expect(
    await annotationEvidence(overlay, solidRectangle.annotationId),
  ).toEqual(solidBeforeOverlap);
  expectTranslated(
    patternedBeforeOverlap,
    await annotationEvidence(overlay, patternedRectangle.annotationId),
    PointSchema.parse({ x: 11, y: 7 }),
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(
    await annotationEvidence(overlay, patternedRectangle.annotationId),
  ).toEqual(patternedBeforeOverlap);
  await page.mouse.click(1000, 500);
  await expect(selectionAffordances(overlay)).toHaveCount(0);

  const patternedVisible = committedById(
    overlay,
    patternedRectangle.annotationId,
  );
  const dashArray = (
    await requiredAttribute(patternedVisible, 'stroke-dasharray')
  )
    .split(' ')
    .map(Number);
  const dash = z.number().positive().parse(dashArray[0]);
  const gap = z.number().positive().parse(dashArray[1]);
  const patternedPosition = await annotationEvidence(
    overlay,
    patternedRectangle.annotationId,
  );
  const solidPosition = await annotationEvidence(
    overlay,
    solidRectangle.annotationId,
  );
  if (
    patternedPosition.position.kind !== 'rect' ||
    solidPosition.position.kind !== 'rect'
  ) {
    throw new Error('expected rectangle positions for patterned evidence');
  }
  const period = dash + gap;
  const firstUncoveredX =
    solidPosition.position.x + solidPosition.position.width + 12;
  const cycle = Math.ceil(
    (firstUncoveredX - patternedPosition.position.x - dash) / period,
  );
  const gapPoint = PointSchema.parse({
    x: patternedPosition.position.x + cycle * period + dash + gap / 2,
    y: patternedPosition.position.y,
  });
  const paintedPoint = PointSchema.parse({
    x: patternedPosition.position.x + cycle * period + dash / 2,
    y: patternedPosition.position.y,
  });
  expect(gapPoint.x).toBeLessThan(
    patternedPosition.position.x + patternedPosition.position.width,
  );
  const paintedPng = PNG.sync.read(await page.screenshot({ scale: 'css' }));
  expect(samplePixel(paintedPng, gapPoint, 1)).toEqual(
    samplePixel(baselinePng, gapPoint, 1),
  );
  expect(samplePixel(paintedPng, paintedPoint, 1)).not.toEqual(
    samplePixel(baselinePng, paintedPoint, 1),
  );

  await moveOrdinaryTarget(
    page,
    overlay,
    camera,
    patternedRectangle.annotationId,
    gapPoint,
    PointSchema.parse({ x: 12, y: 8 }),
  );
  const solidMove = await moveOrdinaryTarget(
    page,
    overlay,
    camera,
    solidRectangle.annotationId,
    pointOnAnnotation(
      await annotationEvidence(overlay, solidRectangle.annotationId),
    ),
    PointSchema.parse({ x: 15, y: 10 }),
  );
  await moveOrdinaryTarget(
    page,
    overlay,
    camera,
    ellipse.annotationId,
    pointOnAnnotation(await annotationEvidence(overlay, ellipse.annotationId)),
    PointSchema.parse({ x: -14, y: 9 }),
  );
  await moveOrdinaryTarget(
    page,
    overlay,
    camera,
    arrow.annotationId,
    pointOnAnnotation(await annotationEvidence(overlay, arrow.annotationId)),
    PointSchema.parse({ x: 13, y: -11 }),
  );
  const penMove = await moveOrdinaryTarget(
    page,
    overlay,
    camera,
    pen.annotationId,
    pointOnAnnotation(await annotationEvidence(overlay, pen.annotationId)),
    PointSchema.parse({ x: -12, y: -9 }),
  );

  const textHit = hitById(overlay, text.annotationId);
  const textHitBox = await requiredBox(textHit);
  const textEvidence = await annotationEvidence(overlay, text.annotationId);
  if (textEvidence.position.kind !== 'text') {
    throw new Error('expected Text evidence');
  }
  const textSize = z
    .number()
    .positive()
    .parse(Number(textEvidence.invariants.fontSize));
  const renderedLineHeight = textSize * 1.2;
  expect(textEvidence.position.width).toBe(200);
  expect(textEvidence.position.minimumHeight).toBe(80);
  expect(textHitBox.width).toBeCloseTo(textEvidence.position.width);
  expect(textHitBox.height).toBeCloseTo(
    Math.max(textEvidence.position.minimumHeight, renderedLineHeight * 2),
  );

  const pickerBeforeRectangle = await annotationEvidence(
    overlay,
    pickerRectangle.annotationId,
  );
  const pickerBeforeLabel = await annotationEvidence(
    overlay,
    pickerLabel.annotationId,
  );
  const labelHitBox = await requiredBox(
    hitById(overlay, pickerLabel.annotationId),
  );
  await dragSelection(
    page,
    overlay,
    camera,
    pickerLabel.annotationId,
    PointSchema.parse({
      x: labelHitBox.x + labelHitBox.width / 2,
      y: labelHitBox.y + labelHitBox.height / 2,
    }),
    PointSchema.parse({ x: 20, y: 30 }),
  );
  expectTranslated(
    pickerBeforeRectangle,
    await annotationEvidence(overlay, pickerRectangle.annotationId),
    PointSchema.parse({ x: 20, y: 30 }),
  );
  expectTranslated(
    pickerBeforeLabel,
    await annotationEvidence(overlay, pickerLabel.annotationId),
    PointSchema.parse({ x: 20, y: 30 }),
  );
  await expect(selectionAffordances(overlay)).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  expect(
    await annotationEvidence(overlay, pickerRectangle.annotationId),
  ).toEqual(pickerBeforeRectangle);
  expect(await annotationEvidence(overlay, pickerLabel.annotationId)).toEqual(
    pickerBeforeLabel,
  );

  const textBeforeMove = await annotationEvidence(overlay, text.annotationId);
  const textMove = await moveOrdinaryTarget(
    page,
    overlay,
    camera,
    text.annotationId,
    PointSchema.parse({
      x: textHitBox.x + textHitBox.width / 2,
      y: textHitBox.y + textHitBox.height / 2,
    }),
    PointSchema.parse({ x: 16, y: 12 }),
    true,
  );
  await page.keyboard.press('ControlOrMeta+z');
  expect(await annotationEvidence(overlay, text.annotationId)).toEqual(
    textBeforeMove,
  );
  expect(textMove.before).toEqual(textBeforeMove);

  await drawGesture(
    page,
    'Rectangle',
    PointSchema.parse({ x: 900, y: 400 }),
    PointSchema.parse({ x: 1050, y: 480 }),
  );
  const transientRectangle = (await identityEvidence(overlay)).at(-1);
  if (transientRectangle === undefined) {
    throw new Error('expected transient rectangle identity');
  }
  await select.click();
  await moveOrdinaryTarget(
    page,
    overlay,
    camera,
    transientRectangle.annotationId,
    pointOnAnnotation(
      await annotationEvidence(overlay, transientRectangle.annotationId),
    ),
    PointSchema.parse({ x: 17, y: 13 }),
    true,
  );
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    committedById(overlay, transientRectangle.annotationId),
  ).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(
    committedById(overlay, transientRectangle.annotationId),
  ).toHaveCount(0);

  const cancelBefore = await annotationEvidence(
    overlay,
    solidRectangle.annotationId,
  );
  const cancelPoint = pointOnAnnotation(cancelBefore);
  await page.mouse.move(cancelPoint.x, cancelPoint.y);
  await page.mouse.down();
  await page.mouse.move(cancelPoint.x + 23, cancelPoint.y - 17);
  await expect(
    overlay.locator(
      `.annotation[data-annotation-id="${solidRectangle.annotationId}"]`,
    ),
  ).toHaveAttribute('data-phase', 'move-preview');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(
    await annotationEvidence(overlay, solidRectangle.annotationId),
  ).toEqual(cancelBefore);
  await expect(selectionAffordances(overlay)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(selectionAffordances(overlay)).toHaveCount(0);
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(interact).toHaveAttribute('aria-pressed', 'true');
  await expect(host).toHaveCount(1);

  await select.click();
  await selectTargetWithoutMoving(
    page,
    await annotationEvidence(overlay, solidRectangle.annotationId),
  );
  await expect(selectionAffordances(overlay)).toHaveCount(1);
  await page.mouse.click(1000, 500);
  await expect(selectionAffordances(overlay)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await annotationEvidence(overlay, pen.annotationId)).toEqual(
    penMove.before,
  );

  const selectedSolid = await annotationEvidence(
    overlay,
    solidRectangle.annotationId,
  );
  await selectTargetWithoutMoving(page, selectedSolid);
  await expect(selectionAffordances(overlay)).toHaveCount(1);
  if (selectedSolid.position.kind !== 'rect') {
    throw new Error('expected selected rectangle evidence');
  }
  const haloPoint = PointSchema.parse({
    x: selectedSolid.position.x - 3,
    y: selectedSolid.position.y + selectedSolid.position.height / 2,
  });
  const inkPoint = PointSchema.parse({
    x: selectedSolid.position.x,
    y: selectedSolid.position.y + selectedSolid.position.height / 2,
  });
  const transparentHitPoint = PointSchema.parse({
    x: selectedSolid.position.x + selectedSolid.position.width / 2,
    y: selectedSolid.position.y + selectedSolid.position.height / 2,
  });
  const liveSelectedPng = PNG.sync.read(
    await page.screenshot({ scale: 'css' }),
  );
  expect(samplePixel(liveSelectedPng, haloPoint, 1)).not.toEqual(
    samplePixel(baselinePng, haloPoint, 1),
  );
  expect(samplePixel(liveSelectedPng, inkPoint, 1)).not.toEqual(
    samplePixel(baselinePng, inkPoint, 1),
  );
  expect(samplePixel(liveSelectedPng, transparentHitPoint, 1)).toEqual(
    samplePixel(baselinePng, transparentHitPoint, 1),
  );

  await camera.click();
  await expect(host.getByRole('status')).toHaveText('Copied');
  const captured = await clipboardPng(page);
  const viewport = ViewportSchema.parse(
    await page.evaluate(() => ({ devicePixelRatio: window.devicePixelRatio })),
  );
  expect(samplePixel(captured, haloPoint, viewport.devicePixelRatio)).toEqual(
    samplePixel(baselinePng, haloPoint, 1),
  );
  expect(
    samplePixel(captured, inkPoint, viewport.devicePixelRatio),
  ).not.toEqual(samplePixel(baselinePng, inkPoint, 1));
  expect(
    samplePixel(captured, transparentHitPoint, viewport.devicePixelRatio),
  ).toEqual(samplePixel(baselinePng, transparentHitPoint, 1));
  await expect(selectionAffordances(overlay)).toHaveCount(1);
  expect(
    await annotationEvidence(overlay, solidRectangle.annotationId),
  ).toEqual(selectedSolid);
  expect(solidMove.after.annotationId).toBe(solidRectangle.annotationId);

  await expectHostPageUnchanged(page, hostSnapshot);
  await expect(host).toHaveCount(1);
  await expect(overlay).toHaveCount(1);
  await expect(toolbar).toBeVisible();
  diagnostics.assertClean();
});
