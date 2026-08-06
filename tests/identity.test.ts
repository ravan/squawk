import { describe, expect, it } from 'vitest';

import {
  IdentityEntropySchema,
  annotationIdFromEntropy,
  selectionTargetIdFromEntropy,
} from '../entrypoints/squawk.content/identity';

describe('browser identity adapter', () => {
  it('formats deterministic 128-bit entropy as either branded identity', () => {
    const entropy = IdentityEntropySchema.parse([
      0, 1, 0x89ab_cdef, 0xffff_ffff,
    ]);

    expect(annotationIdFromEntropy(entropy)).toBe(
      '00000000-00000001-89abcdef-ffffffff',
    );
    expect(selectionTargetIdFromEntropy(entropy)).toBe(
      '00000000-00000001-89abcdef-ffffffff',
    );
  });

  it('requires exactly four uint32 words', () => {
    expect(() => IdentityEntropySchema.parse([0, 1, 2])).toThrow();
    expect(() =>
      IdentityEntropySchema.parse([0, 1, 2, 4_294_967_296]),
    ).toThrow();
  });
});
