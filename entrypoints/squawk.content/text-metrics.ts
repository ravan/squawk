import type { MeasureTextWidth } from '../../src/core/geometry';
import { TEXT_FONT_FAMILY } from './text-font';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

export type TextMetricsAdapter = Readonly<{
  element: SVGSVGElement;
  measureWidth: MeasureTextWidth;
}>;

export function createTextMetricsAdapter(): TextMetricsAdapter {
  const element = document.createElementNS(SVG_NAMESPACE, 'svg');
  element.classList.add('text-metrics');
  element.ariaHidden = 'true';

  const text = document.createElementNS(SVG_NAMESPACE, 'text');
  text.setAttribute('font-family', TEXT_FONT_FAMILY);
  text.setAttribute('font-weight', '400');
  text.setAttributeNS(XML_NAMESPACE, 'xml:space', 'preserve');
  element.append(text);

  return {
    element,
    measureWidth: (value, size) => {
      text.setAttribute('font-size', String(size));
      text.textContent = value;
      return text.getComputedTextLength();
    },
  };
}
