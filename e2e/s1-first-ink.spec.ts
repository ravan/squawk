import type { Locator, Page } from '@playwright/test';

import {
  dragPointer,
  numericAttribute,
  requiredBox,
  selectSquawkColor,
  selectStrokeWidth,
  type PointerDrag,
} from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

async function drawInside(
  page: Page,
  target: Locator,
  constraint: PointerDrag['constraint'],
): Promise<PointerDrag> {
  const box = await requiredBox(target);
  const drag = {
    constraint,
    start: { x: box.x + 12, y: box.y + 14 },
    end: { x: box.x + box.width - 24, y: box.y + box.height - 34 },
  };

  await dragPointer(page, drag);
  return drag;
}

test('draws document-anchored first ink through the extension action', async ({
  context,
  extensionId,
  page,
}) => {
  await page.goto('http://127.0.0.1:4173');
  await triggerExtensionAction(context, page, extensionId);

  const buttonNames = [
    'Drag Squawk palette',
    'Interact',
    'Rectangle',
    'Stroke width 2',
    'Stroke style solid',
    'Undo',
    'Clear all',
    'Close Squawk',
  ];
  for (const name of buttonNames) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }

  const color = page.getByRole('button', { name: /^Color / });
  await expect(color).toBeVisible();
  await expect(color).toHaveAttribute('data-color', '#e03131');
  await color.click();
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
  await color.click();

  const interact = page.getByRole('button', { name: 'Interact', exact: true });
  const rectangle = page.getByRole('button', {
    name: 'Rectangle',
    exact: true,
  });
  await expect(interact).toHaveAttribute('aria-pressed', 'true');
  await expect(rectangle).toHaveAttribute('aria-pressed', 'false');

  const committed = page.locator(
    '#squawk-root svg.overlay rect[data-phase="committed"]',
  );
  await rectangle.click();
  await selectSquawkColor(page, '#e03131');
  await selectStrokeWidth(page, 2);
  await drawInside(page, page.locator('#target-red'), 'free');

  await selectSquawkColor(page, '#2f9e44');
  await selectStrokeWidth(page, 4);
  const squareDrag = await drawInside(
    page,
    page.locator('#target-green'),
    'equal-axes',
  );

  await selectSquawkColor(page, '#1971c2');
  await selectStrokeWidth(page, 6);
  await drawInside(page, page.locator('#target-blue'), 'free');

  await expect(committed).toHaveCount(3);
  await expect(committed.nth(0)).toHaveAttribute('stroke', '#e03131');
  await expect(committed.nth(0)).toHaveAttribute('stroke-width', '2');
  await expect(committed.nth(1)).toHaveAttribute('stroke', '#2f9e44');
  await expect(committed.nth(1)).toHaveAttribute('stroke-width', '4');
  await expect(committed.nth(2)).toHaveAttribute('stroke', '#1971c2');
  await expect(committed.nth(2)).toHaveAttribute('stroke-width', '6');

  const squareWidth = await numericAttribute(committed.nth(1), 'width');
  const squareHeight = await numericAttribute(committed.nth(1), 'height');
  const largerDelta = Math.max(
    Math.abs(squareDrag.end.x - squareDrag.start.x),
    Math.abs(squareDrag.end.y - squareDrag.start.y),
  );
  expect(squareWidth).toBe(squareHeight);
  expect(squareWidth).toBe(largerDelta);

  const redTargetBefore = await requiredBox(page.locator('#target-red'));
  const scrollBefore = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  const redXBefore = await numericAttribute(committed.nth(0), 'x');
  const redYBefore = await numericAttribute(committed.nth(0), 'y');
  const offsetBefore = {
    x: redXBefore - (redTargetBefore.x + scrollBefore.x),
    y: redYBefore - (redTargetBefore.y + scrollBefore.y),
  };

  await page.evaluate(() => {
    window.scrollBy(0, Math.round(window.innerHeight * 0.6));
  });
  const redTargetAfter = await requiredBox(page.locator('#target-red'));
  const scrollAfter = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
  expect(scrollAfter.y).toBeGreaterThan(scrollBefore.y);
  const offsetAfter = {
    x:
      (await numericAttribute(committed.nth(0), 'x')) -
      (redTargetAfter.x + scrollAfter.x),
    y:
      (await numericAttribute(committed.nth(0), 'y')) -
      (redTargetAfter.y + scrollAfter.y),
  };
  expect(Math.abs(offsetAfter.x - offsetBefore.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(offsetAfter.y - offsetBefore.y)).toBeLessThanOrEqual(1);

  await page.keyboard.press('Control+z');
  await expect(committed).toHaveCount(2);
  await expect(committed.nth(0)).toHaveAttribute('stroke', '#e03131');
  await expect(committed.nth(1)).toHaveAttribute('stroke', '#2f9e44');

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(committed).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(committed).toHaveCount(2);
  await expect(committed.nth(0)).toHaveAttribute('stroke', '#e03131');
  await expect(committed.nth(1)).toHaveAttribute('stroke', '#2f9e44');

  await interact.click();
  await page.getByRole('link', { name: 'Jump to destination' }).click();
  await expect(page).toHaveURL(/#destination$/);
});
