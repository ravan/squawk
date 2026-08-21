import type { Locator, Page } from '@playwright/test';

import {
  annotationIds,
  dragPointer,
  expectHostPageUnchanged,
  monitorPageDiagnostics,
  requiredBox,
  selectSquawkColor,
  selectStrokeWidth,
  selectTextSize,
  snapshotHostPage,
  type BrowserBox,
} from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

function expectWithinViewport(
  box: BrowserBox,
  width: number,
  height: number,
): void {
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
  expect(box.y + box.height).toBeLessThanOrEqual(height - 8);
}

async function clickCenter(page: Page, locator: Locator): Promise<void> {
  const box = await requiredBox(locator);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('runs every tool and Palette action on a GitHub-like page', async ({
  context,
  extensionId,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:4173/github.html');
  const diagnostics = monitorPageDiagnostics(page);
  let hostSnapshot = await snapshotHostPage(page);

  await triggerExtensionAction(context, page, extensionId);
  const host = page.locator('html > #squawk-root');
  const shell = host.locator('.palette-shell');
  const toolbar = page.getByRole('toolbar', { name: 'Squawk palette' });
  const grip = page.getByRole('button', { name: 'Drag Squawk palette' });
  expectWithinViewport(await requiredBox(shell), 1280, 720);
  await expectHostPageUnchanged(page, hostSnapshot);

  const topLeftGrip = await requiredBox(grip);
  await page.mouse.move(
    topLeftGrip.x + topLeftGrip.width / 2,
    topLeftGrip.y + topLeftGrip.height / 2,
  );
  await expect(grip).toHaveCSS('cursor', 'grab');
  await page.mouse.down();
  await expect(grip).toHaveCSS('cursor', 'grabbing');
  await page.mouse.move(-500, -500);
  await page.mouse.up();
  await expect(grip).toHaveCSS('cursor', 'grab');
  const topLeft = await requiredBox(shell);
  expect(topLeft.x).toBeGreaterThanOrEqual(8);
  expect(topLeft.x).toBeLessThanOrEqual(9);
  expect(topLeft.y).toBeGreaterThanOrEqual(8);
  expect(topLeft.y).toBeLessThanOrEqual(9);

  const bottomRightGrip = await requiredBox(grip);
  await dragPointer(page, {
    constraint: 'free',
    start: {
      x: bottomRightGrip.x + bottomRightGrip.width / 2,
      y: bottomRightGrip.y + bottomRightGrip.height / 2,
    },
    end: { x: 2000, y: 1600 },
  });
  const bottomRight = await requiredBox(shell);
  expect(1280 - (bottomRight.x + bottomRight.width)).toBeGreaterThanOrEqual(8);
  expect(1280 - (bottomRight.x + bottomRight.width)).toBeLessThanOrEqual(9);
  expect(720 - (bottomRight.y + bottomRight.height)).toBeGreaterThanOrEqual(8);
  expect(720 - (bottomRight.y + bottomRight.height)).toBeLessThanOrEqual(9);

  await page.setViewportSize({ width: 720, height: 600 });
  await expect
    .poll(async () => {
      const box = await requiredBox(shell);
      return box.x + box.width;
    })
    .toBeLessThanOrEqual(712);
  expectWithinViewport(await requiredBox(shell), 720, 600);
  const overflow = await toolbar.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  const controls = toolbar.getByRole('button');
  const controlCount = await controls.count();
  for (let index = 0; index < controlCount; index += 1) {
    const control = controls.nth(index);
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    await expect(control).toHaveAttribute('title', /.+/);
  }
  const colorDropdown = toolbar.getByRole('button', { name: /^Color / });
  await colorDropdown.scrollIntoViewIfNeeded();
  await expect(colorDropdown).toBeVisible();
  await expect(colorDropdown).toHaveAttribute('title', /.+/);
  await colorDropdown.focus();
  await expect(colorDropdown).toBeFocused();

  const interact = page.getByRole('button', {
    name: 'Interact',
    exact: true,
  });
  await expect(interact).toHaveAttribute('title', 'Interact with page');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Text size S', exact: true }),
  ).toHaveAttribute('title', 'Text size S');

  const overlay = host.locator('svg.overlay');
  const cursorCases: readonly (readonly [string, string])[] = [
    ['Interact', 'auto'],
    ['Select', 'default'],
    ['Rectangle', 'crosshair'],
    ['Ruler', 'crosshair'],
    ['Ellipse', 'crosshair'],
    ['Arrow', 'crosshair'],
    ['Pen', 'crosshair'],
    ['Text', 'crosshair'],
    ['Eyedropper', 'crosshair'],
    ['Element picker', 'cell'],
    ['Font inspector', 'cell'],
    ['Eraser', 'not-allowed'],
  ];
  for (const [tool, cursor] of cursorCases) {
    await page.getByRole('button', { name: tool, exact: true }).click();
    await expect(overlay).toHaveCSS('cursor', cursor);
  }

  await page.getByRole('button', { name: 'Interact', exact: true }).click();
  const repositoryLink = page.getByRole('link', {
    name: 'squawk repository',
    exact: true,
  });
  await repositoryLink.hover();
  await expect(repositoryLink).toHaveCSS('cursor', 'pointer');
  const starCount = page.locator('#star-count');
  await expect(starCount).toHaveText('0');
  await page.getByRole('button', { name: 'Star repository' }).click();
  await expect(starCount).toHaveText('1');
  hostSnapshot = await snapshotHostPage(page);

  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await selectSquawkColor(page, '#e03131');
  await selectStrokeWidth(page, 6);
  const issue = await requiredBox(page.locator('#issue-42'));
  await dragPointer(page, {
    constraint: 'free',
    start: { x: issue.x - 8, y: issue.y - 8 },
    end: { x: issue.x + issue.width + 8, y: issue.y + issue.height + 8 },
  });
  const committedRectangles = host.locator(
    'svg.overlay rect.annotation[data-phase="committed"][data-kind="rect"]',
  );
  await expect(committedRectangles).toHaveCount(1);
  await expect(committedRectangles).toHaveAttribute('stroke', '#e03131');
  await expect(committedRectangles).toHaveAttribute('stroke-width', '6');

  await page
    .getByRole('button', { name: 'Element picker', exact: true })
    .click();
  await clickCenter(page, page.locator('#merge-button'));
  const committedLabels = host.locator(
    'svg.overlay text.annotation[data-phase="committed"][data-kind="label"]',
  );
  await expect(committedRectangles).toHaveCount(2);
  await expect(committedLabels).toHaveCount(1);
  await expect(committedLabels).toHaveText('button#merge-button');
  await page.keyboard.press('Control+z');
  await expect(committedRectangles).toHaveCount(1);
  await expect(committedLabels).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(committedRectangles).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(committedRectangles).toHaveCount(1);
  await expect(committedRectangles).toHaveAttribute('stroke', '#e03131');
  await expectHostPageUnchanged(page, hostSnapshot);
  diagnostics.assertClean();
  await page.getByRole('button', { name: 'Close Squawk' }).click();
  await expect(host).toHaveCount(0);
});

test('runs ellipse and text workflows on a Tailwind-style SPA', async ({
  context,
  extensionId,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:4173/tailwind.html');
  const diagnostics = monitorPageDiagnostics(page);
  let hostSnapshot = await snapshotHostPage(page);

  await triggerExtensionAction(context, page, extensionId);
  const host = page.locator('html > #squawk-root');
  await expectHostPageUnchanged(page, hostSnapshot);
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.locator('#tab-status')).toHaveText('Analytics');
  hostSnapshot = await snapshotHostPage(page);
  await expectHostPageUnchanged(page, hostSnapshot);

  await page.getByRole('button', { name: 'Ellipse', exact: true }).click();
  await selectSquawkColor(page, '#2f9e44');
  await selectStrokeWidth(page, 4);
  const conversion = await requiredBox(page.locator('#conversion-card'));
  await dragPointer(page, {
    constraint: 'free',
    start: { x: conversion.x - 8, y: conversion.y - 8 },
    end: {
      x: conversion.x + conversion.width + 8,
      y: conversion.y + conversion.height + 8,
    },
  });
  const ellipse = host.locator(
    'svg.overlay ellipse.annotation[data-phase="committed"][data-kind="ellipse"]',
  );
  await expect(ellipse).toHaveCount(1);
  await expect(ellipse).toHaveAttribute('stroke', '#2f9e44');
  await expect(ellipse).toHaveAttribute('stroke-width', '4');

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await selectSquawkColor(page, '#e03131');
  await selectTextSize(page, 'L');
  const spacingTarget = await requiredBox(page.locator('#spacing-target'));
  const textStart = {
    x: spacingTarget.x + spacingTarget.width + 16,
    y: spacingTarget.y + 12,
  };
  await dragPointer(page, {
    constraint: 'free',
    start: textStart,
    end: { x: textStart.x + 200, y: textStart.y + 60 },
  });
  const editor = page.getByRole('textbox', { name: 'Squawk text editor' });
  await editor.pressSequentially('tighten spacing');
  await editor.press('Escape');
  const committedText = host.locator(
    'svg.overlay text.annotation[data-phase="committed"][data-kind="text"]',
  );
  await expect(committedText).toHaveCount(1);
  await expect(committedText).toHaveText('tighten spacing');
  await expect(committedText).toHaveAttribute('fill', '#e03131');

  const committed = host.locator(
    'svg.overlay .annotation[data-phase="committed"]',
  );
  const order = await annotationIds(committed);
  expect(order).toHaveLength(2);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(committed).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(committed).toHaveCount(2);
  expect(await annotationIds(committed)).toEqual(order);
  await expectHostPageUnchanged(page, hostSnapshot);
  diagnostics.assertClean();
  await page.getByRole('button', { name: 'Close Squawk' }).click();
  await expect(host).toHaveCount(0);
});
