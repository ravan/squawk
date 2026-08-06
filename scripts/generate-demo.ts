import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { createServer } from 'vite';
import { z } from 'zod';

import {
  dragPointer,
  requiredBox,
  selectSquawkColor,
} from '../e2e/browser-helpers';
import {
  extensionIdFromWorker,
  triggerExtensionAction,
} from '../e2e/extension-driver';

export const DemoFrameSchema = z
  .object({
    width: z.literal(960),
    height: z.literal(600),
    rgba: z.instanceof(Uint8Array),
    delayMilliseconds: z.union([
      z.literal(700),
      z.literal(900),
      z.literal(1200),
      z.literal(1600),
    ]),
  })
  .strict()
  .readonly();
export type DemoFrame = z.infer<typeof DemoFrameSchema>;

const GifPaletteSchema = z
  .array(z.array(z.number().int().min(0).max(255)).min(3).max(4).readonly())
  .max(96)
  .readonly();
const GifFrameOptionsSchema = z
  .object({
    palette: GifPaletteSchema,
    delay: z.union([
      z.literal(700),
      z.literal(900),
      z.literal(1200),
      z.literal(1600),
    ]),
    repeat: z.literal(0),
  })
  .strict()
  .readonly();
const GifEncoderSchema = z.object({
  writeFrame: z.function({
    input: [
      z.instanceof(Uint8Array),
      z.literal(960),
      z.literal(600),
      GifFrameOptionsSchema,
    ],
    output: z.void(),
  }),
  finish: z.function({ input: [], output: z.void() }),
  bytes: z.function({
    input: [],
    output: z.instanceof(Uint8Array),
  }),
});
const GifencModuleSchema = z.object({
  GIFEncoder: z.function({ input: [], output: GifEncoderSchema }),
  quantize: z.function({
    input: [z.instanceof(Uint8Array), z.literal(96)],
    output: GifPaletteSchema,
  }),
  applyPalette: z.function({
    input: [z.instanceof(Uint8Array), GifPaletteSchema],
    output: z.instanceof(Uint8Array),
  }),
});
const gifencModuleInput: unknown = createRequire(import.meta.url)('gifenc');
const gifenc = GifencModuleSchema.parse(gifencModuleInput);

export async function captureDemoFrame(
  page: Page,
  delayMilliseconds: DemoFrame['delayMilliseconds'],
): Promise<DemoFrame> {
  const png = PNG.sync.read(
    await page.screenshot({
      type: 'png',
      animations: 'disabled',
    }),
  );
  return DemoFrameSchema.parse({
    width: png.width,
    height: png.height,
    rgba: png.data,
    delayMilliseconds,
  });
}

export function encodeDemoGif(frames: readonly DemoFrame[]): Uint8Array {
  const gif = gifenc.GIFEncoder();
  for (const frameInput of frames) {
    const frame = DemoFrameSchema.parse(frameInput);
    const palette = gifenc.quantize(frame.rgba, 96);
    const index = gifenc.applyPalette(frame.rgba, palette);
    gif.writeFrame(index, frame.width, frame.height, {
      palette,
      delay: frame.delayMilliseconds,
      repeat: 0,
    });
  }
  gif.finish();
  return gif.bytes();
}

export async function generateDemoGif(): Promise<void> {
  const extensionPath = resolve('.output/chrome-mv3');
  const fixtureRoot = resolve('e2e/fixture-site');
  const outputPath = resolve('docs/assets/squawk-demo.gif');
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'squawk-demo-'));
  const server = await createServer({
    root: fixtureRoot,
    server: {
      host: '127.0.0.1',
      port: 4174,
      strictPort: true,
    },
  });

  try {
    await server.listen();
    const origin = 'http://127.0.0.1:4174';
    const context = await chromium.launchPersistentContext(userDataDirectory, {
      channel: 'chromium',
      viewport: { width: 960, height: 600 },
      deviceScaleFactor: 1,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--enable-unsafe-extension-debugging',
      ],
    });

    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin,
      });
      const worker =
        context.serviceWorkers().at(0) ??
        (await context.waitForEvent('serviceworker'));
      await worker.evaluate(() => true);
      const extensionId = extensionIdFromWorker(worker);
      const pages = context.pages();
      const page = pages.at(0) ?? (await context.newPage());
      await page.goto(`${origin}/github.html`);

      const frames: DemoFrame[] = [];
      frames.push(await captureDemoFrame(page, 700));

      await triggerExtensionAction(context, page, extensionId);
      const host = page.locator('html > #squawk-root');
      await expect(host).toHaveCount(1);
      frames.push(await captureDemoFrame(page, 700));

      await page
        .getByRole('button', { name: 'Rectangle', exact: true })
        .click();
      await selectSquawkColor(page, '#e03131');
      await page.getByRole('button', { name: 'Stroke width 6' }).click();
      const issue = await requiredBox(page.locator('#issue-42'));
      await dragPointer(page, {
        constraint: 'free',
        start: { x: issue.x - 8, y: issue.y - 8 },
        end: { x: issue.x + issue.width + 8, y: issue.y + issue.height + 8 },
      });
      const rectangles = host.locator(
        'svg.overlay rect.annotation[data-phase="committed"][data-kind="rect"]',
      );
      await expect(rectangles).toHaveCount(1);
      frames.push(await captureDemoFrame(page, 700));

      const fill = page.getByRole('button', {
        name: 'Fill shapes',
        exact: true,
      });
      await fill.click();
      await expect(fill).toHaveAttribute('aria-pressed', 'true');
      await selectSquawkColor(page, '#f08c00');
      await page.getByRole('button', { name: 'Stroke width 4' }).click();
      const squareStart = {
        x: issue.x + issue.width - 92,
        y: issue.y + 18,
      };
      await dragPointer(page, {
        constraint: 'free',
        start: squareStart,
        end: { x: squareStart.x + 54, y: squareStart.y + 54 },
      });
      await expect(rectangles).toHaveCount(2);
      const square = rectangles.last();
      await expect(square).toHaveAttribute('fill', '#f08c00');
      await expect(square).toHaveAttribute('fill-opacity', '1');
      const squareBox = await requiredBox(square);
      expect(squareBox.width).toBeCloseTo(squareBox.height, 0);

      await page.getByRole('button', { name: 'Ellipse', exact: true }).click();
      await selectSquawkColor(page, '#2f9e44');
      const mergeButton = page.locator('#merge-button');
      const merge = await requiredBox(mergeButton);
      const circleStart = {
        x: merge.x + merge.width - 80,
        y: merge.y - 74,
      };
      await dragPointer(page, {
        constraint: 'free',
        start: circleStart,
        end: { x: circleStart.x + 52, y: circleStart.y + 52 },
      });
      const circle = host.locator(
        'svg.overlay ellipse.annotation[data-phase="committed"][data-kind="ellipse"]',
      );
      await expect(circle).toHaveCount(1);
      await expect(circle).toHaveAttribute('fill', '#2f9e44');
      await expect(circle).toHaveAttribute('fill-opacity', '1');
      const circleBox = await requiredBox(circle);
      expect(circleBox.width).toBeCloseTo(circleBox.height, 0);
      frames.push(await captureDemoFrame(page, 900));

      await page.getByRole('button', { name: 'Select', exact: true }).click();
      const circleCenter = {
        x: circleBox.x + circleBox.width / 2,
        y: circleBox.y + circleBox.height / 2,
      };
      await page.mouse.click(circleCenter.x, circleCenter.y);
      const selection = host.locator('svg.overlay > .selection-affordance');
      await expect(selection).toHaveCount(1);
      frames.push(await captureDemoFrame(page, 700));

      const moveDelta = { x: -90, y: 82 };
      await dragPointer(page, {
        constraint: 'free',
        start: circleCenter,
        end: {
          x: circleCenter.x + moveDelta.x,
          y: circleCenter.y + moveDelta.y,
        },
      });
      const movedCircleBox = await requiredBox(circle);
      expect(movedCircleBox.x).toBeCloseTo(circleBox.x + moveDelta.x, 0);
      expect(movedCircleBox.y).toBeCloseTo(circleBox.y + moveDelta.y, 0);
      await expect(selection).toHaveCount(1);
      frames.push(await captureDemoFrame(page, 900));

      await page.getByRole('button', { name: 'Arrow', exact: true }).click();
      await selectSquawkColor(page, '#1971c2');
      await dragPointer(page, {
        constraint: 'free',
        start: {
          x: issue.x + issue.width * 0.72,
          y: issue.y + issue.height * 0.52,
        },
        end: {
          x: merge.x + merge.width / 2,
          y: merge.y + merge.height / 2,
        },
      });
      await expect(
        host.locator(
          'svg.overlay g.annotation[data-phase="committed"][data-kind="arrow"]',
        ),
      ).toHaveCount(1);
      frames.push(await captureDemoFrame(page, 700));

      await page.getByRole('button', { name: 'Text', exact: true }).click();
      await selectSquawkColor(page, '#e03131');
      await page.getByRole('button', { name: 'Text size L' }).click();
      await dragPointer(page, {
        constraint: 'free',
        start: { x: issue.x + 18, y: issue.y + issue.height + 26 },
        end: { x: issue.x + 258, y: issue.y + issue.height + 86 },
      });
      const editor = page.getByRole('textbox', { name: 'Squawk text editor' });
      await editor.pressSequentially('this padding is wrong');
      await editor.press('Escape');
      await expect(
        host.locator(
          'svg.overlay text.annotation[data-phase="committed"][data-kind="text"]',
        ),
      ).toHaveText('this padding is wrong');
      frames.push(await captureDemoFrame(page, 900));

      await page
        .getByRole('button', { name: 'Element picker', exact: true })
        .click();
      await selectSquawkColor(page, '#1971c2');
      await page.mouse.click(
        merge.x + merge.width / 2,
        merge.y + merge.height / 2,
      );
      const label = host.locator(
        'svg.overlay text.annotation[data-phase="committed"][data-kind="label"]',
      );
      await expect(label).toHaveText('button#merge-button');
      frames.push(await captureDemoFrame(page, 1200));

      await page.getByRole('button', { name: 'Camera', exact: true }).click();
      await expect(host.getByRole('status')).toHaveText('Copied');
      frames.push(await captureDemoFrame(page, 1600));

      const encoded = encodeDemoGif(frames);
      if (Buffer.from(encoded.subarray(0, 6)).toString() !== 'GIF89a') {
        throw new Error('expected a GIF89a demo');
      }
      await mkdir(resolve('docs/assets'), { recursive: true });
      await writeFile(outputPath, encoded);
    } finally {
      await context.close();
    }
  } finally {
    await server.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
}

await generateDemoGif();
