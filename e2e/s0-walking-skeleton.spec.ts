import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

test.describe.configure({ mode: 'serial' });

test('toggles the walking skeleton without disrupting the page', async ({
  context,
  extensionId,
  page,
}) => {
  await page.goto('http://127.0.0.1:4173');

  const head = page.locator('head');
  const body = page.locator('body');
  const headBefore = await head.evaluate((element) => element.outerHTML);
  const bodyBefore = await body.evaluate((element) => element.outerHTML);
  const bodyChildCountBefore = await page.locator('body > *').count();
  const host = page.locator('html > #squawk-root');
  await expect(host).toHaveCount(0);

  await test.step('mount from the real extension action', async () => {
    await page.setViewportSize({ width: 640, height: 600 });
    await triggerExtensionAction(context, page, extensionId);

    await expect(host).toHaveCount(1);
    await expect(
      page.getByRole('toolbar', { name: 'Squawk palette' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Drag Squawk palette' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Close Squawk' }),
    ).toBeVisible();
    const paletteShell = host.locator('.palette-shell');
    const paletteBounds = await paletteShell.boundingBox();
    expect(paletteBounds).not.toBeNull();
    if (paletteBounds === null) {
      return;
    }
    expect(paletteBounds.x).toBeGreaterThanOrEqual(8);
    expect(paletteBounds.y).toBeGreaterThanOrEqual(8);
    expect(paletteBounds.x + paletteBounds.width).toBeLessThanOrEqual(632);
    expect(paletteBounds.y + paletteBounds.height).toBeLessThanOrEqual(592);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(
      page.locator('html > :not(head):not(body):not(#squawk-root)'),
    ).toHaveCount(0);
    await expect(page.locator('body > *')).toHaveCount(bodyChildCountBefore);
    expect(await head.evaluate((element) => element.outerHTML)).toBe(
      headBefore,
    );
    expect(await body.evaluate((element) => element.outerHTML)).toBe(
      bodyBefore,
    );
  });

  await test.step('drag by the requested offset', async () => {
    const palette = page.getByRole('toolbar', { name: 'Squawk palette' });
    const grip = page.getByRole('button', { name: 'Drag Squawk palette' });
    const before = await palette.boundingBox();
    const gripBox = await grip.boundingBox();

    expect(before).not.toBeNull();
    expect(gripBox).not.toBeNull();

    if (before === null || gripBox === null) {
      return;
    }

    const startX = gripBox.x + gripBox.width / 2;
    const startY = gripBox.y + gripBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY - 60);
    await page.mouse.up();

    const after = await palette.boundingBox();
    expect(after).not.toBeNull();

    if (after === null) {
      return;
    }

    expect(after.x - before.x).toBeGreaterThanOrEqual(79);
    expect(after.x - before.x).toBeLessThanOrEqual(81);
    expect(after.y - before.y).toBeGreaterThanOrEqual(-61);
    expect(after.y - before.y).toBeLessThanOrEqual(-59);
  });

  await test.step('leave the fixture interactive', async () => {
    const output = page.getByRole('status');
    await expect(output).toHaveText('0');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(output).toHaveText('1');
  });

  await test.step('tear down from each supported path', async () => {
    await triggerExtensionAction(context, page, extensionId);
    await expect(host).toHaveCount(0);

    await triggerExtensionAction(context, page, extensionId);
    await expect(host).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(host).toHaveCount(0);

    await triggerExtensionAction(context, page, extensionId);
    await page.getByRole('button', { name: 'Close Squawk' }).click();
    await expect(host).toHaveCount(0);
  });
});
