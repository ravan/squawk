import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

import type { SquawkColor } from '../src/core/model';

export const BrowserPointSchema = z
  .object({ x: z.number(), y: z.number() })
  .strict()
  .readonly();
export type BrowserPoint = z.infer<typeof BrowserPointSchema>;
export const BrowserBoxSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict()
  .readonly();
export type BrowserBox = z.infer<typeof BrowserBoxSchema>;
export const DocumentBoxSchema = BrowserBoxSchema.brand<'DocumentBox'>();
export type DocumentBox = z.infer<typeof DocumentBoxSchema>;

export const HostPageSnapshotSchema = z
  .object({
    htmlAttributes: z
      .array(z.tuple([z.string(), z.string()]).readonly())
      .readonly(),
    headOuterHtml: z.string(),
    bodyOuterHtml: z.string(),
    nonSquawkRootChildrenOuterHtml: z.array(z.string()).readonly(),
  })
  .strict()
  .readonly();
export type HostPageSnapshot = z.infer<typeof HostPageSnapshotSchema>;
export const PointerDragSchema = z
  .object({
    constraint: z.enum(['free', 'equal-axes']),
    start: BrowserPointSchema,
    end: BrowserPointSchema,
  })
  .strict()
  .readonly();
export type PointerDrag = z.infer<typeof PointerDragSchema>;

export type PageDiagnostics = Readonly<{ assertClean: () => void }>;

export async function requiredBox(locator: Locator): Promise<BrowserBox> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error('expected a bounding box');
  }
  return BrowserBoxSchema.parse(box);
}

export async function selectSquawkColor(
  page: Page,
  color: SquawkColor,
): Promise<void> {
  const select = page.getByRole('combobox', { name: 'Color', exact: true });
  await select.selectOption(color);
  await expect(select).toHaveValue(color);
}

export async function documentBox(
  page: Page,
  locator: Locator,
): Promise<DocumentBox> {
  const box = await requiredBox(locator);
  const scroll = BrowserPointSchema.parse(
    await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    })),
  );
  return DocumentBoxSchema.parse({
    x: box.x + scroll.x,
    y: box.y + scroll.y,
    width: box.width,
    height: box.height,
  });
}

export async function numericAttribute(
  locator: Locator,
  name: string,
): Promise<number> {
  const value = await locator.getAttribute(name);
  expect(value).not.toBeNull();
  if (value === null) {
    throw new Error(`expected ${name}`);
  }
  return z.number().parse(Number(value));
}

export async function annotationIds(
  locator: Locator,
): Promise<readonly string[]> {
  return z
    .array(z.string())
    .readonly()
    .parse(
      await locator.evaluateAll((elements) =>
        elements.map((element) => {
          const id = element.getAttribute('data-annotation-id');
          if (id === null) {
            throw new Error('expected an annotation id');
          }
          return id;
        }),
      ),
    );
}

export async function dragPointer(
  page: Page,
  input: PointerDrag,
): Promise<void> {
  const drag = PointerDragSchema.parse(input);
  await page.mouse.move(drag.start.x, drag.start.y);
  if (drag.constraint === 'equal-axes') {
    await page.keyboard.down('Shift');
  }
  await page.mouse.down();
  await page.mouse.move(drag.end.x, drag.end.y);
  await page.mouse.up();
  if (drag.constraint === 'equal-axes') {
    await page.keyboard.up('Shift');
  }
}

export async function snapshotHostPage(page: Page): Promise<HostPageSnapshot> {
  return HostPageSnapshotSchema.parse(
    await page.evaluate(() => ({
      htmlAttributes: Array.from(
        document.documentElement.attributes,
        (attribute) => [attribute.name, attribute.value],
      ),
      headOuterHtml: document.head.outerHTML,
      bodyOuterHtml: document.body.outerHTML,
      nonSquawkRootChildrenOuterHtml: Array.from(
        document.documentElement.children,
      )
        .filter((element) => element.id !== 'squawk-root')
        .map((element) => element.outerHTML),
    })),
  );
}

export async function expectHostPageUnchanged(
  page: Page,
  snapshot: HostPageSnapshot,
): Promise<void> {
  const current = await snapshotHostPage(page);
  expect(current).toEqual(snapshot);
  await expect(page.locator('html > #squawk-root')).toHaveCount(1);
}

export function monitorPageDiagnostics(page: Page): PageDiagnostics {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  return {
    assertClean: () => {
      expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual(
        [],
      );
      expect(
        consoleErrors,
        `console errors: ${JSON.stringify(consoleErrors)}`,
      ).toEqual([]);
    },
  };
}
