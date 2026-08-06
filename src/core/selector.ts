import { z } from 'zod';

import { SelectorLabelSchema, type SelectorLabel } from './model';

export const ElementTagNameSchema = z.string().min(1).brand<'ElementTagName'>();
export type ElementTagName = z.infer<typeof ElementTagNameSchema>;

export const ElementIdSchema = z.string().brand<'ElementId'>();
export type ElementId = z.infer<typeof ElementIdSchema>;

export const ElementClassNameSchema = z
  .string()
  .min(1)
  .brand<'ElementClassName'>();
export type ElementClassName = z.infer<typeof ElementClassNameSchema>;

export const SelectorElementFactsSchema = z
  .object({
    tagName: ElementTagNameSchema,
    id: ElementIdSchema,
    classNames: z.array(ElementClassNameSchema).readonly(),
  })
  .strict()
  .readonly();
export type SelectorElementFacts = z.infer<typeof SelectorElementFactsSchema>;

export function selectorLabel(facts: SelectorElementFacts): SelectorLabel {
  const tagName = facts.tagName.toLowerCase();
  let rawLabel = tagName;

  if (facts.id.length > 0) {
    rawLabel = `${tagName}#${facts.id}`;
  } else if (facts.classNames.length > 0) {
    rawLabel = `${tagName}.${facts.classNames.slice(0, 2).join('.')}`;
  }

  const codePoints = Array.from(rawLabel);
  const label =
    codePoints.length > 40 ? `${codePoints.slice(0, 39).join('')}…` : rawLabel;
  return SelectorLabelSchema.parse(label);
}
