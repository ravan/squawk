import { TEXT_FONT_FAMILY } from './text-font';

export const SQUAWK_STYLES = `
  :host {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    overflow: visible;
    z-index: 2147483647;
    pointer-events: none;
  }

  [hidden] { display: none; }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    overflow: visible;
  }

  .overlay[data-pointer-routing='transparent'] {
    pointer-events: none;
  }

  .overlay[data-pointer-routing='drawing'],
  .overlay[data-pointer-routing='erasing'],
  .overlay[data-pointer-routing='picking'],
  .overlay[data-pointer-routing='selecting'],
  .overlay[data-pointer-routing='dragging'] {
    pointer-events: auto;
    touch-action: none;
  }

  .annotation,
  .picker-highlight,
  .selection-affordance,
  .annotation-hit-target,
  .text-eraser-hit-target {
    pointer-events: none;
  }

  .overlay[data-pointer-routing='selecting'] .selection-hit-stroke {
    pointer-events: stroke;
    cursor: move;
  }

  .overlay[data-pointer-routing='selecting'] .selection-hit-fill {
    pointer-events: all;
    cursor: move;
  }

  .overlay[data-pointer-routing='dragging'],
  .overlay[data-pointer-routing='dragging'] .annotation-hit-target {
    cursor: grabbing;
  }

  .text-metrics {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }

  .text-editor {
    position: absolute;
    box-sizing: content-box;
    appearance: none;
    overflow: hidden;
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: transparent;
    font-family: ${TEXT_FONT_FAMILY};
    font-weight: 400;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: normal;
    line-break: auto;
    hyphens: none;
    resize: none;
    pointer-events: auto;
  }

  .overlay[data-pointer-routing='erasing'] .annotation[data-phase='committed']:not([data-kind='text']) {
    pointer-events: painted;
  }

  .overlay[data-pointer-routing='erasing'] .annotation-hit-target {
    pointer-events: stroke;
  }

  .overlay[data-pointer-routing='erasing'] .text-eraser-hit-target {
    pointer-events: all;
  }

  .palette-shell {
    position: fixed;
    left: 50%;
    bottom: 24px;
    max-width: calc(100vw - 16px);
    pointer-events: auto;
    transform: translateX(-50%);
  }

  .toast {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    padding: 8px 12px;
    border: 1px solid #d0d0d0;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
    color: #1e1e1e;
    font: 14px/1 system-ui, sans-serif;
    white-space: nowrap;
    transform: translateX(-50%);
  }

  .palette {
    display: flex;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    max-width: 100%;
    min-height: 48px;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding: 8px;
    border: 1px solid #d0d0d0;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
    color: #1e1e1e;
    font: 14px/1 system-ui, sans-serif;
    pointer-events: auto;
  }

  .palette-group {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
  }

  .palette-group + .palette-group {
    padding-left: 8px;
    border-left: 1px solid #dee2e6;
  }

  .palette button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
  }

  .palette button:hover:not(:disabled) {
    background: #f1f3f5;
  }

  .palette button:focus-visible {
    outline: 2px solid #1971c2;
    outline-offset: 2px;
  }

  .palette button[aria-pressed='true'] {
    background: #e7f5ff;
    box-shadow: inset 0 0 0 2px #1971c2;
  }

  .palette button:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .grip {
    cursor: grab;
    touch-action: none;
  }

  .grip[data-dragging] {
    cursor: grabbing;
  }

  .color-select {
    position: relative;
    display: grid;
    place-items: center;
    width: 36px;
    height: 32px;
    border-radius: 6px;
    background: transparent;
  }

  .color-select:hover {
    background: #f1f3f5;
  }

  .color-select:has(select:focus-visible) {
    outline: 2px solid #1971c2;
    outline-offset: 2px;
  }

  .color-select select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .color-swatch {
    width: 18px;
    height: 18px;
    border: 1px solid rgb(0 0 0 / 25%);
    border-radius: 50%;
    background: var(--squawk-color);
    pointer-events: none;
  }

  .color-select-chevron {
    position: absolute;
    right: 3px;
    color: #495057;
    font-size: 10px;
    pointer-events: none;
  }

  .stroke-swatch {
    width: 20px;
    border-top: var(--squawk-stroke-width) solid currentcolor;
    border-radius: 999px;
  }

  .stroke-style-sample {
    width: 26px;
    height: 8px;
  }
`;
