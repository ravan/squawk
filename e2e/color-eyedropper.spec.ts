import { selectStrokeStyle, selectStrokeWidth } from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

test('samples a clicked pixel and writes its hex color beside the marker', async ({
  context,
  extensionId,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:4173');
  await page.waitForLoadState('networkidle');
  await triggerExtensionAction(context, page, extensionId);

  await selectStrokeWidth(page, 4);
  await selectStrokeStyle(page, 'dotted');
  const eyedropper = page.getByRole('button', {
    name: 'Eyedropper',
    exact: true,
  });
  await eyedropper.click();
  await expect(eyedropper).toHaveAttribute('aria-pressed', 'true');

  const point = { x: 1100, y: 120 };
  await page.mouse.click(point.x, point.y);

  const host = page.locator('html > #squawk-root');
  const marker = host.locator(
    'g.annotation[data-phase="committed"][data-kind="color-sample"]',
  );
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute('data-sampled-color', '#C0FFEE');
  const circle = marker.locator('.color-sample-circle');
  await expect(circle).toHaveAttribute('cx', String(point.x));
  await expect(circle).toHaveAttribute('cy', String(point.y));
  await expect(circle).toHaveAttribute('stroke', '#C0FFEE');
  await expect(circle).toHaveAttribute('stroke-width', '4');
  await expect(circle).toHaveAttribute('stroke-dasharray', '0 8');
  await expect(marker.locator('.color-sample-label')).toHaveText('#C0FFEE');
  await expect(
    page.getByRole('toolbar', { name: 'Squawk palette' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(marker).toHaveCount(0);
});
