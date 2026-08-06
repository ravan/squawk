import type { StrokePattern, StrokeStyle, StrokeWidth } from './model';

function dashedPattern(strokeWidth: StrokeWidth): StrokePattern {
  switch (strokeWidth) {
    case 2:
      return {
        style: 'dashed',
        dashArray: [6, 4],
        lineCap: 'round',
      };
    case 4:
      return {
        style: 'dashed',
        dashArray: [12, 8],
        lineCap: 'round',
      };
    case 6:
      return {
        style: 'dashed',
        dashArray: [18, 12],
        lineCap: 'round',
      };
  }
}

function dottedPattern(strokeWidth: StrokeWidth): StrokePattern {
  switch (strokeWidth) {
    case 2:
      return {
        style: 'dotted',
        dashArray: [0, 4],
        lineCap: 'round',
      };
    case 4:
      return {
        style: 'dotted',
        dashArray: [0, 8],
        lineCap: 'round',
      };
    case 6:
      return {
        style: 'dotted',
        dashArray: [0, 12],
        lineCap: 'round',
      };
  }
}

export function strokePattern(
  strokeStyle: StrokeStyle,
  strokeWidth: StrokeWidth,
): StrokePattern {
  switch (strokeStyle) {
    case 'solid':
      return { style: 'solid', lineCap: 'round' };
    case 'dashed':
      return dashedPattern(strokeWidth);
    case 'dotted':
      return dottedPattern(strokeWidth);
  }
}
