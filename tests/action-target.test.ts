import { describe, expect, it } from 'vitest';

import { actionTargetForTab } from '../src/core/action-target';
import type { ActionTab, ActionTarget } from '../src/core/action-target';

describe('actionTargetForTab', () => {
  it.each<Readonly<{ tab: ActionTab; expected: ActionTarget }>>([
    {
      tab: { id: 42, url: 'https://example.com/a' },
      expected: { kind: 'inject', tabId: 42 },
    },
    {
      tab: { id: 42, url: 'http://localhost:4173' },
      expected: { kind: 'inject', tabId: 42 },
    },
    {
      tab: { id: 42, url: 'file:///tmp/page.html' },
      expected: { kind: 'inject', tabId: 42 },
    },
    {
      tab: { id: 42, url: 'chrome://settings' },
      expected: { kind: 'ignore' },
    },
    {
      tab: {
        id: 42,
        url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/page.html',
      },
      expected: { kind: 'ignore' },
    },
    {
      tab: { id: 42, url: 'not a url' },
      expected: { kind: 'ignore' },
    },
    {
      tab: { id: undefined, url: 'https://example.com' },
      expected: { kind: 'ignore' },
    },
    {
      tab: { id: 42, url: undefined },
      expected: { kind: 'ignore' },
    },
  ])('returns $expected for $tab', ({ tab, expected }) => {
    expect(actionTargetForTab(tab)).toEqual(expected);
  });
});
