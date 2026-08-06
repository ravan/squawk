import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';

import {
  SelectorElementFactsSchema,
  selectorLabel,
} from '../src/core/selector';

const { document } = parseHTML(`
  <a id="primary" class="nav-link active">Primary</a>
  <button class="button primary large">Action</button>
  <section>Section</section>
  <DIV class="Card">Card</DIV>
  <button id="abcdefghijklmnopqrstuvwxyz1234567890">Long id</button>
`);

function factsFor(selector: string) {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`Missing fixture element: ${selector}`);
  }
  return SelectorElementFactsSchema.parse({
    tagName: element.localName,
    id: element.id,
    classNames: Array.from(element.classList),
  });
}

describe('selector labels', () => {
  it('uses deterministic id, class, and tag precedence from fixture DOM', () => {
    expect(selectorLabel(factsFor('#primary'))).toBe('a#primary');
    expect(selectorLabel(factsFor('.button'))).toBe('button.button.primary');
    expect(selectorLabel(factsFor('section'))).toBe('section');
    expect(selectorLabel(factsFor('.Card'))).toBe('div.Card');
  });

  it('truncates labels to exactly 40 Unicode code points', () => {
    const label = selectorLabel(factsFor('[id$="7890"]'));
    expect(label).toBe('button#abcdefghijklmnopqrstuvwxyz123456…');
    expect(Array.from(label)).toHaveLength(40);
  });

  it('rejects malformed element facts', () => {
    expect(() =>
      SelectorElementFactsSchema.parse({
        tagName: '',
        id: '',
        classNames: [],
      }),
    ).toThrow();
    expect(() =>
      SelectorElementFactsSchema.parse({
        tagName: 'button',
        id: '',
        classNames: [''],
      }),
    ).toThrow();
  });
});
