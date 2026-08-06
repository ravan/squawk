import { describe, expect, it } from 'vitest';

import {
  clampPalettePosition,
  palettePositionForPointer,
} from '../src/core/palette-drag';

const paletteSize = { width: 240, height: 48 };
const viewportSize = { width: 1280, height: 800 };
const margin = 8;

describe('palettePositionForPointer', () => {
  it('translates the palette by the pointer delta', () => {
    expect(
      palettePositionForPointer(
        {
          pointer: { x: 320, y: 720 },
          palette: { x: 300, y: 700 },
          paletteSize,
          viewportSize,
          margin,
        },
        { x: 370, y: 680 },
      ),
    ).toEqual({ x: 350, y: 660 });
  });
});

describe('clampPalettePosition', () => {
  it('clamps the top-left corner to the viewport margin', () => {
    expect(
      clampPalettePosition(
        { x: -50, y: -20 },
        paletteSize,
        viewportSize,
        margin,
      ),
    ).toEqual({ x: 8, y: 8 });
  });

  it('clamps the bottom-right corner to the viewport margin', () => {
    expect(
      clampPalettePosition(
        { x: 1200, y: 790 },
        paletteSize,
        viewportSize,
        margin,
      ),
    ).toEqual({ x: 1032, y: 744 });
  });

  it('pins an axis when the palette is larger than the viewport', () => {
    expect(
      clampPalettePosition(
        { x: 50, y: 80 },
        paletteSize,
        { width: 200, height: 100 },
        margin,
      ),
    ).toEqual({ x: 8, y: 44 });
  });
});
