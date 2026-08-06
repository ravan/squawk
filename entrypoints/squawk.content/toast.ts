import {
  createTimedToastController,
  type CaptureToast,
  type ScheduleToastDismiss,
  type ToastVisibility,
} from '../../src/capture/toast';

export type ToastView = Readonly<{
  element: HTMLDivElement;
  show: (message: CaptureToast) => void;
  hide: () => void;
}>;

export function createToast(signal: AbortSignal): ToastView {
  const element = document.createElement('div');
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.hidden = true;

  const render = (visibility: ToastVisibility): void => {
    if (visibility.kind === 'hidden') {
      element.textContent = '';
      element.hidden = true;
      return;
    }

    element.textContent = visibility.message;
    element.hidden = false;
  };
  const scheduleDismiss: ScheduleToastDismiss = (
    delayMilliseconds,
    dismiss,
  ) => {
    const timeoutId = window.setTimeout(dismiss, delayMilliseconds);
    return () => {
      window.clearTimeout(timeoutId);
    };
  };
  const controller = createTimedToastController({ render, scheduleDismiss });

  if (signal.aborted) {
    controller.hide();
  } else {
    signal.addEventListener('abort', controller.hide, { once: true });
  }

  return { element, show: controller.show, hide: controller.hide };
}
