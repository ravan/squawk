import { actionTargetForTab } from '../core/action-target';
import type { ActionTab, TabId } from '../core/action-target';

export type ExecuteSquawkScript = (tabId: TabId) => Promise<void>;

export type ActionClickOutcome =
  Readonly<{ kind: 'injected' }> | Readonly<{ kind: 'ignored' }>;

export type ActionClickHandler = (
  tab: ActionTab,
) => Promise<ActionClickOutcome>;

export function createActionClickHandler(
  executeSquawkScript: ExecuteSquawkScript,
): ActionClickHandler {
  return async (tab) => {
    const target = actionTargetForTab(tab);

    if (target.kind === 'ignore') {
      return { kind: 'ignored' };
    }

    await executeSquawkScript(target.tabId);

    return { kind: 'injected' };
  };
}
