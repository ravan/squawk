import type { Locator, Page } from '@playwright/test';

import {
  documentBox,
  numericAttribute,
  requiredBox,
  selectSquawkColor,
  selectStrokeWidth,
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

async function moveToCenter(page: Page, locator: Locator): Promise<void> {
  const box = await requiredBox(locator);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function clickCenter(page: Page, locator: Locator): Promise<void> {
  const box = await requiredBox(locator);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function annotationId(locator: Locator): Promise<string> {
  const value = await locator.getAttribute('data-annotation-id');
  expect(value).not.toBeNull();
  if (value === null) {
    throw new Error('expected an annotation id');
  }
  return value;
}

test('points at DOM elements through the built extension', async ({
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
      buttons.slice(0, 13).map((button) => button.getAttribute('aria-label')),
    );
  expect(labels).toEqual([
    'Drag Squawk palette',
    'Interact',
    'Select',
    'Rectangle',
    'Ruler',
    'Ellipse',
    'Arrow',
    'Pen',
    'Text',
    'Element picker',
    'Font inspector',
    'Eyedropper',
    'Eraser',
  ]);

  const picker = page.getByRole('button', {
    name: 'Element picker',
    exact: true,
  });
  await picker.click();
  await expect(picker).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('button', { name: 'Eraser', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');

  const highlight = page.locator(
    '#squawk-root svg.overlay rect.picker-highlight[data-phase="picker-highlight"][data-kind="picker-highlight"]',
  );
  const increment = page.getByRole('button', {
    name: 'Increment',
    exact: true,
  });
  const navLink = page.getByRole('link', {
    name: 'Jump to destination',
    exact: true,
  });
  const targetCard = page.locator('#target-red');
  const pickerFrame = page.locator('#picker-frame');

  for (const target of [increment, navLink, targetCard, pickerFrame]) {
    const expected = await documentBox(page, target);
    await moveToCenter(page, target);
    await expect(highlight).toHaveCount(1);
    await expectRectMatches(highlight, expected);
    await expect(highlight).not.toHaveAttribute('data-annotation-id');
  }

  await selectSquawkColor(page, '#1971c2');
  await selectStrokeWidth(page, 4);
  const navBox = await documentBox(page, navLink);
  const urlBeforePick = page.url();
  await clickCenter(page, navLink);
  await expect(page).toHaveURL(urlBeforePick);
  await expect(highlight).toHaveCount(0);

  const committedRect = page.locator(
    '#squawk-root svg.overlay rect.annotation[data-phase="committed"][data-kind="rect"]',
  );
  const committedLabel = page.locator(
    '#squawk-root svg.overlay text.annotation[data-phase="committed"][data-kind="label"]',
  );
  const committedLabelBackground = page.locator(
    '#squawk-root svg.overlay rect.label-background[data-phase="committed"][data-label-line="selector"]',
  );
  await expect(committedRect).toHaveCount(1);
  await expect(committedLabel).toHaveCount(1);
  await expectRectMatches(committedRect, navBox);
  await expect(committedRect).toHaveAttribute('stroke', '#1971c2');
  await expect(committedRect).toHaveAttribute('stroke-width', '4');
  await expect(committedLabel).toHaveAttribute('x', String(navBox.x));
  await expect(committedLabel).toHaveAttribute('y', String(navBox.y));
  await expect(committedLabel).toHaveAttribute('fill', '#ffffff');
  await expect(committedLabel).toHaveText('a.nav-link');
  await expect(committedLabelBackground).toHaveAttribute('fill', '#000000');
  expect(await annotationId(committedRect)).not.toBe(
    await annotationId(committedLabel),
  );

  await page.keyboard.press('Control+z');
  await expect(committedRect).toHaveCount(0);
  await expect(committedLabel).toHaveCount(0);
  await expect(committedLabelBackground).toHaveCount(0);

  await clickCenter(page, pickerFrame);
  await expect(highlight).toHaveCount(0);
  await expect(committedRect).toHaveCount(1);
  await expect(committedLabel).toHaveCount(1);
  await expect(committedLabel).toHaveText('iframe#picker-frame');
  await page.keyboard.press('Control+z');
  await expect(committedRect).toHaveCount(0);
  await expect(committedLabel).toHaveCount(0);

  await moveToCenter(page, targetCard);
  await expect(highlight).toHaveCount(1);
  const camera = page.getByRole('button', { name: 'Camera', exact: true });
  await camera.focus();
  await camera.press('Enter');
  await expect(highlight).toHaveCount(0);
  await expect(page.locator('#squawk-root').getByRole('status')).toHaveText(
    'Copied',
  );
  await expect(page.locator('#squawk-root')).toHaveCount(1);
  await expect(picker).toHaveAttribute('aria-pressed', 'true');
});
