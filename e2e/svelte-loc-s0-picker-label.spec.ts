import type { Locator, Page } from '@playwright/test';

import { requiredBox } from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

async function moveToCenter(page: Page, locator: Locator): Promise<void> {
  const box = await requiredBox(locator);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function clickCenter(page: Page, locator: Locator): Promise<void> {
  const box = await requiredBox(locator);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function expectLabelBadge(
  text: Locator,
  background: Locator,
): Promise<void> {
  await expect(text).toHaveAttribute('fill', '#ffffff');
  await expect(background).toHaveAttribute('fill', '#000000');
  const textBox = await requiredBox(text);
  const backgroundBox = await requiredBox(background);
  expect(backgroundBox.x).toBeLessThanOrEqual(textBox.x);
  expect(backgroundBox.y).toBeLessThanOrEqual(textBox.y);
  expect(backgroundBox.x + backgroundBox.width).toBeGreaterThanOrEqual(
    textBox.x + textBox.width,
  );
  expect(backgroundBox.y + backgroundBox.height).toBeGreaterThanOrEqual(
    textBox.y + textBox.height,
  );
}

test('surfaces svelte dev locs on picker highlights and labels', async ({
  context,
  extensionId,
  page,
}) => {
  const origin = 'http://127.0.0.1:4173';
  await page.goto(origin);
  await triggerExtensionAction(context, page, extensionId);

  await page
    .getByRole('button', { name: 'Element picker', exact: true })
    .click();

  const highlight = page.locator(
    '#squawk-root svg.overlay rect.picker-highlight',
  );
  const highlightLoc = page.locator(
    '#squawk-root svg.overlay text.picker-highlight-loc',
  );
  const highlightLocBackground = page.locator(
    '#squawk-root svg.overlay rect.label-background[data-phase="picker-highlight"][data-label-line="svelte-loc"]',
  );
  const committedLabel = page.locator(
    '#squawk-root svg.overlay text.annotation[data-phase="committed"][data-kind="label"]',
  );
  const committedSelectorBackground = page.locator(
    '#squawk-root svg.overlay rect.label-background[data-phase="committed"][data-label-line="selector"]',
  );
  const committedLocBackground = page.locator(
    '#squawk-root svg.overlay rect.label-background[data-phase="committed"][data-label-line="svelte-loc"]',
  );

  // A svelte-stamped element shows its loc while hovering and after commit.
  const svelteTarget = page.locator('#svelte-target');
  await moveToCenter(page, svelteTarget);
  await expect(highlight).toHaveCount(1);
  await expect(highlightLoc).toHaveText('SvelteTarget.svelte:12');
  await expectLabelBadge(highlightLoc, highlightLocBackground);

  await clickCenter(page, svelteTarget);
  await expect(highlightLoc).toHaveCount(0);
  await expect(committedLabel).toHaveCount(1);
  const committedSelector = committedLabel.locator('tspan').nth(0);
  await expect(committedSelector).toHaveText('p#svelte-target');
  await expectLabelBadge(committedSelector, committedSelectorBackground);
  const committedLoc = committedLabel.locator('tspan').nth(1);
  await expect(committedLoc).toHaveText('SvelteTarget.svelte:12');
  await expectLabelBadge(committedLoc, committedLocBackground);

  await page.keyboard.press('Control+z');
  await expect(committedLabel).toHaveCount(0);
  await expect(page.locator('.label-background')).toHaveCount(0);

  // A plain element keeps the single-line selector label.
  const increment = page.getByRole('button', {
    name: 'Increment',
    exact: true,
  });
  await moveToCenter(page, increment);
  await expect(highlight).toHaveCount(1);
  await expect(highlightLoc).toHaveCount(0);

  await clickCenter(page, increment);
  await expect(committedLabel).toHaveCount(1);
  await expect(committedLabel).toHaveText('button');
  await expect(committedLabel.locator('tspan')).toHaveCount(0);
  await expectLabelBadge(committedLabel, committedSelectorBackground);
  await expect(page.locator('.label-background')).toHaveCount(1);
});
