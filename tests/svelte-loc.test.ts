import { describe, expect, it } from 'vitest';

import { svelteLocLabel } from '../src/core/svelte-loc';

describe('svelte loc labels', () => {
  it('keeps only the filename and line from source paths', () => {
    expect(svelteLocLabel('/Users/ravan/repo/src/App.svelte:852')).toBe(
      'App.svelte:852',
    );
    expect(svelteLocLabel('C:\\repo\\src\\Panel.svelte:24')).toBe(
      'Panel.svelte:24',
    );
  });

  it('normalizes an already-short location', () => {
    expect(svelteLocLabel('App.svelte:852')).toBe('App.svelte:852');
    expect(svelteLocLabel('  src/App.svelte:852  ')).toBe('App.svelte:852');
  });

  it('truncates unusually long basenames to the model limit', () => {
    const raw = `/Users/ravan/repo/${'x'.repeat(90)}.svelte:38`;
    const label = svelteLocLabel(raw);
    expect(label).toBeDefined();
    expect(Array.from(label ?? '')).toHaveLength(80);
    expect(label?.startsWith('…')).toBe(true);
    expect(label?.endsWith('.svelte:38')).toBe(true);
  });

  it('resolves blank results to undefined', () => {
    expect(svelteLocLabel('')).toBeUndefined();
    expect(svelteLocLabel('   ')).toBeUndefined();
  });
});
