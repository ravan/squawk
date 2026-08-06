export type CssPixels = number;

export type ViewportPoint = Readonly<{
  x: CssPixels;
  y: CssPixels;
}>;

export type BoxSize = Readonly<{
  width: CssPixels;
  height: CssPixels;
}>;

export type PalettePosition = ViewportPoint;

export type PaletteDragStart = Readonly<{
  pointer: ViewportPoint;
  palette: PalettePosition;
  paletteSize: BoxSize;
  viewportSize: BoxSize;
  margin: CssPixels;
}>;

export function clampPalettePosition(
  position: PalettePosition,
  paletteSize: BoxSize,
  viewportSize: BoxSize,
  margin: CssPixels,
): PalettePosition {
  const maximumX = Math.max(
    margin,
    viewportSize.width - paletteSize.width - margin,
  );
  const maximumY = Math.max(
    margin,
    viewportSize.height - paletteSize.height - margin,
  );

  return {
    x: Math.min(Math.max(position.x, margin), maximumX),
    y: Math.min(Math.max(position.y, margin), maximumY),
  };
}

export function palettePositionForPointer(
  start: PaletteDragStart,
  pointer: ViewportPoint,
): PalettePosition {
  return clampPalettePosition(
    {
      x: start.palette.x + pointer.x - start.pointer.x,
      y: start.palette.y + pointer.y - start.pointer.y,
    },
    start.paletteSize,
    start.viewportSize,
    start.margin,
  );
}
