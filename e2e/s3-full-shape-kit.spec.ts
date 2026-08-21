import {
  annotationIds,
  dragPointer,
  numericAttribute,
  requiredBox,
  selectSquawkColor,
  selectStrokeWidth,
} from './browser-helpers';
import { triggerExtensionAction } from './extension-driver';
import { expect, test } from './extension-fixture';

test('draws and erases the full shape kit through the built extension', async ({
  context,
  extensionId,
  page,
}) => {
  await page.goto('http://127.0.0.1:4173');
  await triggerExtensionAction(context, page, extensionId);

  const toolNames = [
    'Interact',
    'Rectangle',
    'Ellipse',
    'Arrow',
    'Pen',
    'Text',
    'Element picker',
    'Eyedropper',
    'Eraser',
  ];
  const toolbar = page.getByRole('toolbar', { name: 'Squawk palette' });
  const labels = await toolbar
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.slice(0, 11).map((button) => button.getAttribute('aria-label')),
    );
  expect(labels).toEqual([
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
  for (const name of [
    'Ellipse',
    'Arrow',
    'Pen',
    'Text',
    'Element picker',
    'Eyedropper',
    'Eraser',
  ]) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }

  const expectSelectedTool = async (selected: string): Promise<void> => {
    for (const name of toolNames) {
      await expect(
        page.getByRole('button', { name, exact: true }),
      ).toHaveAttribute('aria-pressed', String(name === selected));
    }
  };
  await expectSelectedTool('Interact');

  await selectSquawkColor(page, '#e03131');
  await selectStrokeWidth(page, 4);

  const redBox = await requiredBox(page.locator('#target-red'));
  await page.getByRole('button', { name: 'Ellipse', exact: true }).click();
  await expectSelectedTool('Ellipse');
  await dragPointer(page, {
    constraint: 'equal-axes',
    start: { x: redBox.x + 20, y: redBox.y + 20 },
    end: { x: redBox.x + 130, y: redBox.y + 80 },
  });

  const ellipse = page.locator(
    '#squawk-root svg.overlay ellipse.annotation[data-phase="committed"][data-kind="ellipse"]',
  );
  await expect(ellipse).toHaveCount(1);
  expect(await numericAttribute(ellipse, 'rx')).toBe(55);
  expect(await numericAttribute(ellipse, 'ry')).toBe(55);
  await expect(ellipse).toHaveAttribute('stroke', '#e03131');
  await expect(ellipse).toHaveAttribute('stroke-width', '4');

  const blueBox = await requiredBox(page.locator('#target-blue'));
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await expectSelectedTool('Arrow');
  await dragPointer(page, {
    constraint: 'free',
    start: {
      x: redBox.x + redBox.width / 2,
      y: redBox.y + redBox.height / 2,
    },
    end: {
      x: blueBox.x + blueBox.width / 2,
      y: blueBox.y + blueBox.height / 2,
    },
  });

  const arrow = page.locator(
    '#squawk-root svg.overlay g.annotation[data-phase="committed"][data-kind="arrow"]',
  );
  await expect(arrow).toHaveCount(1);
  const shaft = arrow.locator('.arrow-shaft');
  const head = arrow.locator('.arrow-head');
  await expect(shaft).toHaveCount(1);
  await expect(head).toHaveCount(1);
  await expect(shaft).toHaveAttribute('stroke', '#e03131');
  await expect(shaft).toHaveAttribute('stroke-width', '4');
  await expect(head).toHaveAttribute('fill', '#e03131');

  const greenBox = await requiredBox(page.locator('#target-green'));
  const p0 = { x: greenBox.x + 20, y: greenBox.y + 25 };
  const p1 = { x: greenBox.x + 55, y: greenBox.y + 75 };
  const p2 = { x: greenBox.x + 100, y: greenBox.y + 25 };
  const p3 = { x: greenBox.x + 145, y: greenBox.y + 75 };
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  await expectSelectedTool('Pen');
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.move(p2.x, p2.y);
  await page.mouse.move(p3.x, p3.y);
  await page.mouse.up();

  const pen = page.locator(
    '#squawk-root svg.overlay polyline.annotation[data-phase="committed"][data-kind="pen"]',
  );
  await expect(pen).toHaveCount(1);
  await expect(pen).toHaveAttribute('stroke', '#e03131');
  await expect(pen).toHaveAttribute('stroke-width', '4');
  await expect(pen).toHaveAttribute('stroke-linecap', 'round');
  await expect(pen).toHaveAttribute('stroke-linejoin', 'round');

  const committed = page.locator(
    '#squawk-root svg.overlay .annotation[data-phase="committed"]',
  );
  const committedOrder = await annotationIds(committed);
  expect(committedOrder).toHaveLength(3);

  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await expectSelectedTool('Eraser');
  await page.mouse.move(greenBox.x + 77.5, greenBox.y + 50);
  await expect(pen).toHaveAttribute('opacity', '0.4');
  await expect(
    committed.filter({ has: page.locator('[opacity="0.4"]') }),
  ).toHaveCount(0);
  await expect(
    page.locator(
      '#squawk-root svg.overlay .annotation[data-phase="committed"][opacity="0.4"]',
    ),
  ).toHaveCount(1);
  await expect(ellipse).toHaveAttribute('opacity', '1');
  await expect(arrow).toHaveAttribute('opacity', '1');

  await page.mouse.down();
  await page.mouse.up();
  await expect(pen).toHaveCount(0);
  await expect(ellipse).toHaveCount(1);
  await expect(arrow).toHaveCount(1);
  expect(await annotationIds(committed)).toEqual(committedOrder.slice(0, 2));

  await page.keyboard.press('Control+z');
  await expect(pen).toHaveCount(1);
  expect(await annotationIds(committed)).toEqual(committedOrder);
});
