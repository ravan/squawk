export type TabId = number;

export type ActionTab = Readonly<{
  id: TabId | undefined;
  url: string | undefined;
}>;

export type ActionTarget =
  Readonly<{ kind: 'inject'; tabId: TabId }> | Readonly<{ kind: 'ignore' }>;

const INJECTABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

export function actionTargetForTab(tab: ActionTab): ActionTarget {
  if (tab.id === undefined || tab.url === undefined) {
    return { kind: 'ignore' };
  }

  try {
    const url = new URL(tab.url);

    return INJECTABLE_PROTOCOLS.has(url.protocol)
      ? { kind: 'inject', tabId: tab.id }
      : { kind: 'ignore' };
  } catch {
    return { kind: 'ignore' };
  }
}
