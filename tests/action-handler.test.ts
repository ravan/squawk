import { describe, expect, it } from 'vitest';

import { createActionClickHandler } from '../src/background/action-handler';
import type { TabId } from '../src/core/action-target';

describe('createActionClickHandler', () => {
  it('injects exactly once into an eligible tab', async () => {
    const calls: TabId[] = [];
    const handler = createActionClickHandler((tabId) => {
      calls.push(tabId);
      return Promise.resolve();
    });

    await expect(
      handler({ id: 42, url: 'https://example.com/a' }),
    ).resolves.toEqual({ kind: 'injected' });
    expect(calls).toEqual([42]);
  });

  it('ignores an ineligible tab without executing a script', async () => {
    const calls: TabId[] = [];
    const handler = createActionClickHandler((tabId) => {
      calls.push(tabId);
      return Promise.resolve();
    });

    await expect(
      handler({ id: 42, url: 'chrome://settings' }),
    ).resolves.toEqual({ kind: 'ignored' });
    expect(calls).toEqual([]);
  });

  it('propagates the executor rejection unchanged', async () => {
    const failure = new Error('injection failed');
    const handler = createActionClickHandler(() => Promise.reject(failure));

    await expect(
      handler({ id: 42, url: 'https://example.com/a' }),
    ).rejects.toBe(failure);
  });
});
