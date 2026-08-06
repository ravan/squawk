import { z } from 'zod';

export const BrowserContextIdSchema = z
  .string()
  .min(1)
  .brand<'BrowserContextId'>();

export type BrowserContextId = z.infer<typeof BrowserContextIdSchema>;

export const TabTargetIdSchema = z.string().min(1).brand<'TabTargetId'>();

export type TabTargetId = z.infer<typeof TabTargetIdSchema>;

export const PageTargetInfoSchema = z.object({
  type: z.literal('page'),
  url: z.string().min(1),
  browserContextId: BrowserContextIdSchema,
});

export type PageTargetInfo = z.infer<typeof PageTargetInfoSchema>;

export const PageTargetInfoResultSchema = z.object({
  targetInfo: PageTargetInfoSchema,
});

export type PageTargetInfoResult = z.infer<typeof PageTargetInfoResultSchema>;

export const TabTargetInfoSchema = z.object({
  targetId: TabTargetIdSchema,
  type: z.literal('tab'),
  url: z.string(),
  browserContextId: BrowserContextIdSchema,
});

export type TabTargetInfo = z.infer<typeof TabTargetInfoSchema>;

export const TabTargetsResultSchema = z.object({
  targetInfos: z.array(TabTargetInfoSchema),
});

export type TabTargetsResult = z.infer<typeof TabTargetsResultSchema>;

export function tabTargetIdForPage(
  pageTarget: PageTargetInfo,
  tabTargets: readonly TabTargetInfo[],
): TabTargetId {
  const matches = tabTargets.filter(
    (tabTarget) =>
      tabTarget.url === pageTarget.url &&
      tabTarget.browserContextId === pageTarget.browserContextId,
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected one tab target for page, found ${matches.length.toString()}`,
    );
  }

  for (const match of matches) {
    return match.targetId;
  }

  throw new Error('Expected one tab target for page, found 0');
}
