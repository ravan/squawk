import { describe, expect, it } from 'vitest';

import { StrokeStyleSchema, StrokeWidthSchema } from '../src/core/model';
import { strokePattern } from '../src/core/stroke-pattern';

describe('strokePattern', () => {
  it('returns the exact width-relative pattern for every style and width', () => {
    const cases = [
      {
        strokeStyle: StrokeStyleSchema.parse('solid'),
        strokeWidth: StrokeWidthSchema.parse(2),
        expected: { style: 'solid', lineCap: 'round' },
      },
      {
        strokeStyle: StrokeStyleSchema.parse('solid'),
        strokeWidth: StrokeWidthSchema.parse(4),
        expected: { style: 'solid', lineCap: 'round' },
      },
      {
        strokeStyle: StrokeStyleSchema.parse('solid'),
        strokeWidth: StrokeWidthSchema.parse(6),
        expected: { style: 'solid', lineCap: 'round' },
      },
      {
        strokeStyle: StrokeStyleSchema.parse('dashed'),
        strokeWidth: StrokeWidthSchema.parse(2),
        expected: { style: 'dashed', dashArray: [6, 4], lineCap: 'round' },
      },
      {
        strokeStyle: StrokeStyleSchema.parse('dashed'),
        strokeWidth: StrokeWidthSchema.parse(4),
        expected: { style: 'dashed', dashArray: [12, 8], lineCap: 'round' },
      },
      {
        strokeStyle: StrokeStyleSchema.parse('dashed'),
        strokeWidth: StrokeWidthSchema.parse(6),
        expected: { style: 'dashed', dashArray: [18, 12], lineCap: 'round' },
      },
      {
        strokeStyle: StrokeStyleSchema.parse('dotted'),
        strokeWidth: StrokeWidthSchema.parse(2),
        expected: { style: 'dotted', dashArray: [0, 4], lineCap: 'round' },
      },
      {
        strokeStyle: StrokeStyleSchema.parse('dotted'),
        strokeWidth: StrokeWidthSchema.parse(4),
        expected: { style: 'dotted', dashArray: [0, 8], lineCap: 'round' },
      },
      {
        strokeStyle: StrokeStyleSchema.parse('dotted'),
        strokeWidth: StrokeWidthSchema.parse(6),
        expected: { style: 'dotted', dashArray: [0, 12], lineCap: 'round' },
      },
    ];

    for (const testCase of cases) {
      expect(strokePattern(testCase.strokeStyle, testCase.strokeWidth)).toEqual(
        testCase.expected,
      );
    }
  });
});
