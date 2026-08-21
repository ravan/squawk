import type { PngDataUrl } from '../../src/capture/protocol';
import {
  bitmapPixelForViewport,
  rgbToHex,
} from '../../src/core/color-sampling';
import {
  SampledColorSchema,
  type SampledColor,
  type ViewportPoint,
} from '../../src/core/model';

export async function sampleCapturedColor(
  pngDataUrl: PngDataUrl,
  point: ViewportPoint,
): Promise<SampledColor> {
  const response = await fetch(pngDataUrl);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const pixel = bitmapPixelForViewport(
      point,
      { width: window.innerWidth, height: window.innerHeight },
      { width: bitmap.width, height: bitmap.height },
    );
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('Color sampling requires a 2D canvas context');
    }
    context.drawImage(bitmap, pixel.x, pixel.y, 1, 1, 0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    if (red === undefined || green === undefined || blue === undefined) {
      throw new Error('Color sampling returned no pixel data');
    }
    return SampledColorSchema.parse(rgbToHex(red, green, blue));
  } finally {
    bitmap.close();
  }
}
