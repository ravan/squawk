import { describe, expect, it } from 'vitest';

import {
  TOAST_DISMISS_DELAY_MILLISECONDS,
  createTimedToastController,
  type ScheduleToastDismiss,
  type ToastVisibility,
} from '../src/capture/toast';

type ScheduledDismiss = {
  delayMilliseconds: number;
  dismiss: () => void;
  cancelled: boolean;
};

function createHarness() {
  const rendered: ToastVisibility[] = [];
  const scheduled: ScheduledDismiss[] = [];
  const scheduleDismiss: ScheduleToastDismiss = (
    delayMilliseconds,
    dismiss,
  ) => {
    const record = {
      delayMilliseconds,
      dismiss,
      cancelled: false,
    };
    scheduled.push(record);
    return () => {
      record.cancelled = true;
    };
  };
  const controller = createTimedToastController({
    render: (visibility) => {
      rendered.push(visibility);
    },
    scheduleDismiss,
  });

  return { controller, rendered, scheduled };
}

describe('timed toast controller', () => {
  it('shows a message and schedules its exact dismissal delay', () => {
    const { controller, rendered, scheduled } = createHarness();

    controller.show('Copied');

    expect(rendered).toEqual([{ kind: 'visible', message: 'Copied' }]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMilliseconds).toBe(
      TOAST_DISMISS_DELAY_MILLISECONDS,
    );
    expect(scheduled[0]?.cancelled).toBe(false);
  });

  it('restarts the full duration when another message is shown', () => {
    const { controller, rendered, scheduled } = createHarness();

    controller.show('Copied');
    controller.show('Downloaded');

    expect(scheduled[0]?.cancelled).toBe(true);
    expect(rendered).toEqual([
      { kind: 'visible', message: 'Copied' },
      { kind: 'visible', message: 'Downloaded' },
    ]);
    expect(scheduled).toHaveLength(2);
    expect(scheduled[1]?.delayMilliseconds).toBe(
      TOAST_DISMISS_DELAY_MILLISECONDS,
    );
  });

  it('hides once when the live dismissal fires', () => {
    const { controller, rendered, scheduled } = createHarness();

    controller.show('Copied');
    scheduled[0]?.dismiss();
    scheduled[0]?.dismiss();

    expect(rendered).toEqual([
      { kind: 'visible', message: 'Copied' },
      { kind: 'hidden' },
    ]);
  });

  it('cancels and hides a visible toast while repeated hide is inert', () => {
    const { controller, rendered, scheduled } = createHarness();

    controller.show('Copied');
    controller.hide();
    controller.hide();

    expect(scheduled[0]?.cancelled).toBe(true);
    expect(rendered).toEqual([
      { kind: 'visible', message: 'Copied' },
      { kind: 'hidden' },
    ]);
  });

  it('ignores a cancelled stale callback', () => {
    const { controller, rendered, scheduled } = createHarness();

    controller.show('Copied');
    controller.show('Downloaded');
    scheduled[0]?.dismiss();

    expect(rendered).toEqual([
      { kind: 'visible', message: 'Copied' },
      { kind: 'visible', message: 'Downloaded' },
    ]);
  });
});
