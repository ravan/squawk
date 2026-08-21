import { describe, expect, it } from 'vitest';

import { bitmapPixelForViewport, rgbToHex } from '../src/core/color-sampling';

describe('color sampling', () => {
  it('maps a viewport point into the captured bitmap and clamps its edges', () => {
    const viewport = { width: 800, height: 600 };
    const bitmap = { width: 1200, height: 900 };

    expect(
      bitmapPixelForViewport({ x: 200, y: 100 }, viewport, bitmap),
    ).toEqual({ x: 300, y: 150 });
    expect(
      bitmapPixelForViewport({ x: 800, y: 600 }, viewport, bitmap),
    ).toEqual({ x: 1199, y: 899 });
    expect(
      bitmapPixelForViewport({ x: -20, y: -10 }, viewport, bitmap),
    ).toEqual({ x: 0, y: 0 });
  });

  it('formats RGB channels as an uppercase six-digit hex color', () => {
    expect(rgbToHex(0, 15, 255)).toBe('#000FFF');
    expect(rgbToHex(224, 49, 49)).toBe('#E03131');
  });
});
