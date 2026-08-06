import {
  SQUAWK_HOST_ID,
  SVELTE_LOC_REQUEST_EVENT,
  SVELTE_LOC_RESULT_ATTRIBUTE,
} from '../src/core/svelte-loc-protocol';

// Svelte's dev runtime stamps `__svelte_meta` onto DOM elements in the MAIN
// world, where the isolated content script cannot see it. This bridge runs in
// the MAIN world and answers the picker's synchronous request event by writing
// the nearest `file:line` onto the Squawk host element's result attribute.

type SvelteMetaElement = Element &
  Readonly<{
    __svelte_meta?: Readonly<{
      loc?: Readonly<{ file?: unknown; line?: unknown }>;
    }>;
  }>;

const BRIDGE_FLAG = '__squawkSvelteLocBridge';

export default defineUnlistedScript(() => {
  const scope = window as unknown as Record<string, unknown>;
  if (scope[BRIDGE_FLAG] === true) {
    return;
  }
  scope[BRIDGE_FLAG] = true;

  document.addEventListener(
    SVELTE_LOC_REQUEST_EVENT,
    (event) => {
      const host = document.getElementById(SQUAWK_HOST_ID);
      if (host === null) {
        return;
      }
      host.removeAttribute(SVELTE_LOC_RESULT_ATTRIBUTE);
      let node = event.target instanceof Element ? event.target : null;
      while (node !== null) {
        const loc = (node as SvelteMetaElement).__svelte_meta?.loc;
        if (typeof loc?.file === 'string' && typeof loc.line === 'number') {
          host.setAttribute(
            SVELTE_LOC_RESULT_ATTRIBUTE,
            `${loc.file}:${String(loc.line)}`,
          );
          return;
        }
        node = node.parentElement;
      }
    },
    true,
  );
});
