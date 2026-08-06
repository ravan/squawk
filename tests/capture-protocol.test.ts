import { describe, expect, it } from 'vitest';

import {
  CaptureVisibleTabRequestSchema,
  CaptureVisibleTabResponseSchema,
} from '../src/capture/protocol';

const validPngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';

describe('capture protocol', () => {
  it('parses capture requests exactly', () => {
    const request = { type: 'capture-visible-tab' };

    expect(CaptureVisibleTabRequestSchema.parse(request)).toEqual(request);
    expect(
      CaptureVisibleTabRequestSchema.safeParse({ ...request, extra: true })
        .success,
    ).toBe(false);
  });

  it('parses captured responses exactly', () => {
    const response = { kind: 'captured', pngDataUrl: validPngDataUrl };

    expect(CaptureVisibleTabResponseSchema.parse(response)).toEqual(response);
  });

  it('parses failed responses exactly', () => {
    const response = { kind: 'capture-failed', reason: 'capture-rejected' };

    expect(CaptureVisibleTabResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    'data:image/jpeg;base64,iVBORw0KGgo=',
    'data:image/png;base64,',
    'data:image/png;base64,a',
    'data:image/png;base64,QUFBQQ==',
  ])('rejects invalid PNG data URL %s', (pngDataUrl) => {
    expect(
      CaptureVisibleTabResponseSchema.safeParse({
        kind: 'captured',
        pngDataUrl,
      }).success,
    ).toBe(false);
  });

  it('rejects incomplete and unknown responses', () => {
    expect(
      CaptureVisibleTabResponseSchema.safeParse({ kind: 'capture-failed' })
        .success,
    ).toBe(false);
    expect(
      CaptureVisibleTabResponseSchema.safeParse({ kind: 'unknown' }).success,
    ).toBe(false);
  });
});
