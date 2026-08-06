import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  PageTargetInfoSchema,
  TabTargetInfoSchema,
  tabTargetIdForPage,
} from '../e2e/tab-target';

const pageTarget = PageTargetInfoSchema.parse({
  type: 'page',
  url: 'http://127.0.0.1:4173/',
  browserContextId: 'context-a',
});

const tabTargets = z.array(TabTargetInfoSchema);

describe('tabTargetIdForPage', () => {
  it('matches a tab by URL and browser context', () => {
    const targets = tabTargets.parse([
      {
        targetId: 'blank-tab',
        type: 'tab',
        url: 'about:blank',
        browserContextId: 'context-a',
      },
      {
        targetId: 'other-context-tab',
        type: 'tab',
        url: 'http://127.0.0.1:4173/',
        browserContextId: 'context-b',
      },
      {
        targetId: 'matching-tab',
        type: 'tab',
        url: 'http://127.0.0.1:4173/',
        browserContextId: 'context-a',
      },
    ]);

    expect(tabTargetIdForPage(pageTarget, targets)).toBe('matching-tab');
  });

  it('rejects a missing URL-plus-context match', () => {
    const targets = tabTargets.parse([
      {
        targetId: 'other-context-tab',
        type: 'tab',
        url: 'http://127.0.0.1:4173/',
        browserContextId: 'context-b',
      },
    ]);

    expect(() => tabTargetIdForPage(pageTarget, targets)).toThrow(
      'Expected one tab target for page, found 0',
    );
  });

  it('rejects ambiguous URL-plus-context matches', () => {
    const targets = tabTargets.parse([
      {
        targetId: 'matching-tab-a',
        type: 'tab',
        url: 'http://127.0.0.1:4173/',
        browserContextId: 'context-a',
      },
      {
        targetId: 'matching-tab-b',
        type: 'tab',
        url: 'http://127.0.0.1:4173/',
        browserContextId: 'context-a',
      },
    ]);

    expect(() => tabTargetIdForPage(pageTarget, targets)).toThrow(
      'Expected one tab target for page, found 2',
    );
  });
});
