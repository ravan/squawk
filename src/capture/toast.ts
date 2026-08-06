import { z } from 'zod';

export const CaptureToastSchema = z.enum([
  'Copied',
  'Downloaded',
  'Capture failed',
  'Download failed',
]);
export type CaptureToast = z.infer<typeof CaptureToastSchema>;

export const ToastDismissDelayMillisecondsSchema = z
  .literal(2500)
  .brand<'ToastDismissDelayMilliseconds'>();
export type ToastDismissDelayMilliseconds = z.infer<
  typeof ToastDismissDelayMillisecondsSchema
>;
export const TOAST_DISMISS_DELAY_MILLISECONDS =
  ToastDismissDelayMillisecondsSchema.parse(2500);
export const ToastVisibilitySchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('hidden') })
      .strict()
      .readonly(),
    z
      .object({ kind: z.literal('visible'), message: CaptureToastSchema })
      .strict()
      .readonly(),
  ])
  .readonly();
export type ToastVisibility = z.infer<typeof ToastVisibilitySchema>;

export type CancelToastDismiss = () => void;
export type ScheduleToastDismiss = (
  delayMilliseconds: ToastDismissDelayMilliseconds,
  dismiss: () => void,
) => CancelToastDismiss;
export type TimedToastDependencies = Readonly<{
  render: (visibility: ToastVisibility) => void;
  scheduleDismiss: ScheduleToastDismiss;
}>;
export type TimedToastController = Readonly<{
  show: (message: CaptureToast) => void;
  hide: () => void;
}>;

export function createTimedToastController(
  dependencies: TimedToastDependencies,
): TimedToastController {
  type State =
    | Readonly<{ kind: 'hidden' }>
    | Readonly<{ kind: 'visible'; cancelDismiss: CancelToastDismiss }>;

  let state: State = { kind: 'hidden' };

  function show(message: CaptureToast): void {
    if (state.kind === 'visible') {
      state.cancelDismiss();
    }

    let live = true;
    let cancelScheduledDismiss: CancelToastDismiss = () => undefined;
    const cancelDismiss = (): void => {
      if (!live) {
        return;
      }
      live = false;
      cancelScheduledDismiss();
    };

    state = { kind: 'visible', cancelDismiss };
    dependencies.render({ kind: 'visible', message });
    const scheduledDismiss = dependencies.scheduleDismiss(
      TOAST_DISMISS_DELAY_MILLISECONDS,
      () => {
        if (!live) {
          return;
        }
        live = false;
        if (state.kind === 'visible' && state.cancelDismiss === cancelDismiss) {
          state = { kind: 'hidden' };
          dependencies.render({ kind: 'hidden' });
        }
      },
    );
    cancelScheduledDismiss = scheduledDismiss;
  }

  function hide(): void {
    if (state.kind === 'hidden') {
      return;
    }

    state.cancelDismiss();
    state = { kind: 'hidden' };
    dependencies.render({ kind: 'hidden' });
  }

  return { show, hide };
}
