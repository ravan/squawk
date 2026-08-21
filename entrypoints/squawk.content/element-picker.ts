import { documentRectFromViewport } from '../../src/core/geometry';
import {
  FontTargetSchema,
  PickerTargetSchema,
  ViewportRectSchema,
  type FontTargetSelection,
  type PickerTargetSelection,
  type ViewportPoint,
} from '../../src/core/model';
import {
  SelectorElementFactsSchema,
  selectorLabel,
} from '../../src/core/selector';
import {
  SVELTE_LOC_REQUEST_EVENT,
  SVELTE_LOC_RESULT_ATTRIBUTE,
  svelteLocLabel,
} from '../../src/core/svelte-loc';
import type { SvelteLoc } from '../../src/core/model';

// Asks the MAIN-world svelte-meta bridge for the element's source location.
// dispatchEvent runs the bridge's listener synchronously, so the result
// attribute on the host is readable immediately after the dispatch returns.
function resolveSvelteLoc(
  element: Element,
  host: HTMLDivElement,
): SvelteLoc | undefined {
  host.removeAttribute(SVELTE_LOC_RESULT_ATTRIBUTE);
  element.dispatchEvent(
    new Event(SVELTE_LOC_REQUEST_EVENT, { bubbles: true, composed: true }),
  );
  const raw = host.getAttribute(SVELTE_LOC_RESULT_ATTRIBUTE);
  host.removeAttribute(SVELTE_LOC_RESULT_ATTRIBUTE);
  return raw === null ? undefined : svelteLocLabel(raw);
}

export type ElementPickerView = Readonly<{
  targetAt: (point: ViewportPoint) => PickerTargetSelection;
  fontTargetAt: (point: ViewportPoint) => FontTargetSelection;
}>;

type PickedElement = Readonly<{
  element: Element;
  rect: Readonly<{ x: number; y: number; w: number; h: number }>;
}>;

function pickedElementAt(
  point: ViewportPoint,
  host: HTMLDivElement,
): PickedElement | undefined {
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    if (element === host || host.shadowRoot?.contains(element) === true) {
      continue;
    }
    const bounds = element.getBoundingClientRect();
    const viewportRect = ViewportRectSchema.parse({
      x: bounds.x,
      y: bounds.y,
      w: bounds.width,
      h: bounds.height,
    });
    if (viewportRect.w <= 0 || viewportRect.h <= 0) {
      continue;
    }
    return {
      element,
      rect: documentRectFromViewport(viewportRect, {
        x: window.scrollX,
        y: window.scrollY,
      }),
    };
  }
  return undefined;
}

export function createElementPicker(host: HTMLDivElement): ElementPickerView {
  return {
    targetAt(point) {
      const picked = pickedElementAt(point, host);
      if (picked !== undefined) {
        const { element, rect } = picked;
        const facts = SelectorElementFactsSchema.parse({
          tagName: element.localName,
          id: element.id,
          classNames: Array.from(element.classList),
        });
        const svelteLoc = resolveSvelteLoc(element, host);
        return {
          kind: 'element',
          target: PickerTargetSchema.parse({
            ...rect,
            selector: selectorLabel(facts),
            ...(svelteLoc === undefined ? {} : { svelteLoc }),
          }),
        };
      }
      return { kind: 'none' };
    },
    fontTargetAt(point) {
      const picked = pickedElementAt(point, host);
      if (picked === undefined) {
        return { kind: 'none' };
      }
      const computed = getComputedStyle(picked.element);
      const target = FontTargetSchema.safeParse({
        ...picked.rect,
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
      });
      return target.success
        ? { kind: 'element', target: target.data }
        : { kind: 'none' };
    },
  };
}
