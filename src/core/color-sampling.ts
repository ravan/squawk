import type { ViewportPoint } from './model';

type PixelSize = Readonly<{ width: number; height: number }>;
type BitmapPixel = Readonly<{ x: number; y: number }>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function bitmapPixelForViewport(
  point: ViewportPoint,
  viewport: PixelSize,
  bitmap: PixelSize,
): BitmapPixel {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    bitmap.width <= 0 ||
    bitmap.height <= 0
  ) {
    throw new Error('Color sampling requires positive viewport dimensions');
  }
  return {
    x: clamp(
      Math.floor((point.x * bitmap.width) / viewport.width),
      0,
      bitmap.width - 1,
    ),
    y: clamp(
      Math.floor((point.y * bitmap.height) / viewport.height),
      0,
      bitmap.height - 1,
    ),
  };
}

function hexByte(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error('RGB channels must be bytes');
  }
  return value.toString(16).padStart(2, '0').toUpperCase();
}

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;
}
