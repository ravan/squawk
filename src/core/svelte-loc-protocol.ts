// The svelte-loc bridge hands results between the MAIN-world script and the
// isolated content script through a DOM attribute on the Squawk host element —
// attributes are the only state both worlds share synchronously. This module
// must stay dependency-free: it is bundled into the MAIN-world bridge, which
// is injected into every page Squawk opens on.
export const SQUAWK_HOST_ID = 'squawk-root';
export const SVELTE_LOC_REQUEST_EVENT = 'squawk:svelte-loc-request';
export const SVELTE_LOC_RESULT_ATTRIBUTE = 'data-squawk-svelte-loc';
