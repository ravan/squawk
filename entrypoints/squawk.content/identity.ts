import { z } from 'zod';

import {
  AnnotationIdSchema,
  SelectionTargetIdSchema,
  type AnnotationId,
  type SelectionTargetId,
} from '../../src/core/model';

export const IdentityEntropyWordSchema = z
  .number()
  .int()
  .min(0)
  .max(0xffff_ffff)
  .brand<'IdentityEntropyWord'>();
export type IdentityEntropyWord = z.infer<typeof IdentityEntropyWordSchema>;

export const IdentityEntropySchema = z
  .tuple([
    IdentityEntropyWordSchema,
    IdentityEntropyWordSchema,
    IdentityEntropyWordSchema,
    IdentityEntropyWordSchema,
  ])
  .readonly();
export type IdentityEntropy = z.infer<typeof IdentityEntropySchema>;

function identityFromEntropy(entropy: IdentityEntropy): string {
  return entropy.map((word) => word.toString(16).padStart(8, '0')).join('-');
}

export function annotationIdFromEntropy(
  entropy: IdentityEntropy,
): AnnotationId {
  return AnnotationIdSchema.parse(identityFromEntropy(entropy));
}

export function selectionTargetIdFromEntropy(
  entropy: IdentityEntropy,
): SelectionTargetId {
  return SelectionTargetIdSchema.parse(identityFromEntropy(entropy));
}

export function browserIdentityEntropy(): IdentityEntropy {
  return IdentityEntropySchema.parse(
    Array.from(crypto.getRandomValues(new Uint32Array(4))),
  );
}
