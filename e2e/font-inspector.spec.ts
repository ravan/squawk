import type { Locator, Page } from '@playwright/test';

import {
  documentBox,
  numericAttribute,
  requiredBox,
  type DocumentBox,
} from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

async function expectRectMatches(
  rectangle: Locator,
  expected: DocumentBox,
): Promise<void> {
  const actual = {
    x: await numericAttribute(rectangle, 'x'),
    y: await numericAttribute(rectangle, 'y'),
    width: await numericAttribute(rectangle, 'width'),
    height: await numericAttribute(rectangle, 'height'),
  };
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(1);
}

async function clickCenter(page: Page, locator: Locator): Promise<void> {
  const box = await requiredBox(locator);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function moveToCenter(page: Page, locator: Locator): Promise<void> {
  const box = await requiredBox(locator);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test('labels an element with its computed font size and family', async ({
  context,
  extensionId,
  page,
}) => {
  await page.goto('http://127.0.0.1:4173');
  await page.evaluate(() => {
    const target = document.createElement('p');
    target.id = 'font-target';
    target.textContent = 'Inspect this type';
    target.style.cssText = [
      'position: absolute',
      'left: 120px',
      'top: 160px',
      'margin: 0',
      'font-size: 22px',
      'font-family: Georgia, serif',
    ].join(';');
    document.body.append(target);
  });
  await triggerExtensionAction(context, page, extensionId);

  const target = page.locator('#font-target');
  const expected = await documentBox(page, target);
  const fontInspector = page.getByRole('button', {
    name: 'Font inspector',
    exact: true,
  });
  await fontInspector.click();
  await expect(fontInspector).toHaveAttribute('aria-pressed', 'true');
  await moveToCenter(page, target);

  const host = page.locator('#squawk-root');
  const highlight = host.locator(
    'rect.font-highlight[data-phase="font-highlight"]',
  );
  await expect(highlight).toHaveCount(1);
  await expectRectMatches(highlight, expected);
  await expect(highlight).toHaveAttribute('fill', '#000000');

  await clickCenter(page, target);
  await expect(highlight).toHaveCount(0);
  const annotation = host.locator(
    'g.annotation[data-phase="committed"][data-kind="font"]',
  );
  await expect(annotation).toHaveCount(1);
  await expect(annotation).toHaveAttribute('data-font-size', '22px');
  await expect(annotation).toHaveAttribute(
    'data-font-family',
    'Georgia, serif',
  );
  await expectRectMatches(
    annotation.locator('rect.font-annotation-outline'),
    expected,
  );
  await expect(
    annotation.locator('rect.font-label-background'),
  ).toHaveAttribute('fill', '#000000');
  await expect(annotation.locator('text.font-label-text')).toHaveAttribute(
    'fill',
    '#ffffff',
  );
  await expect(annotation.locator('text.font-label-text')).toHaveText(
    '22px · Georgia, serif',
  );

  await page.keyboard.press('Control+z');
  await expect(annotation).toHaveCount(0);
});
