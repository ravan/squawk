import { z } from 'zod';

export const PngDataUrlSchema = z
  .string()
  .startsWith('data:image/png;base64,iVBORw0KGgo')
  .regex(
    /^data:image\/png;base64,(?=[A-Za-z0-9+/])(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
  )
  .brand<'PngDataUrl'>();
export type PngDataUrl = z.infer<typeof PngDataUrlSchema>;

export const CaptureVisibleTabRequestSchema = z
  .object({ type: z.literal('capture-visible-tab') })
  .strict()
  .readonly();
export type CaptureVisibleTabRequest = z.infer<
  typeof CaptureVisibleTabRequestSchema
>;

export const CaptureFailureReasonSchema = z.enum([
  'missing-window-id',
  'capture-rejected',
  'invalid-png-data-url',
]);
export type CaptureFailureReason = z.infer<typeof CaptureFailureReasonSchema>;

export const CaptureVisibleTabResponseSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('captured'),
        pngDataUrl: PngDataUrlSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('capture-failed'),
        reason: CaptureFailureReasonSchema,
      })
      .strict(),
  ])
  .readonly();
export type CaptureVisibleTabResponse = z.infer<
  typeof CaptureVisibleTabResponseSchema
>;
