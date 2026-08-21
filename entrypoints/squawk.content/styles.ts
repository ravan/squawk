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
    flex: none;
  }

  .palette .stroke-select-trigger.color-select-trigger {
    width: 36px;
    padding-left: 5px;
  }

  .color-swatch {
    width: 18px;
    height: 18px;
    border: 1px solid rgb(0 0 0 / 25%);
    border-radius: 50%;
    background: var(--squawk-color);
    pointer-events: none;
  }

  .color-menu {
    min-width: 0;
  }

  .color-menu:popover-open {
    display: grid;
    grid-template-columns: repeat(3, 34px);
  }

  .palette .color-menu-option {
    width: 34px;
    padding: 0;
  }

  .stroke-group {
    gap: 2px;
  }

  .stroke-select {
    position: relative;
    flex: none;
  }

  .palette .stroke-select-trigger {
    position: relative;
    display: flex;
    width: 44px;
    padding: 0 11px 0 3px;
  }

  .stroke-select-trigger[aria-expanded='true'] {
    background: #e7f5ff;
    box-shadow: inset 0 0 0 2px #1971c2;
  }

  .stroke-select-chevron {
    position: absolute;
    right: 3px;
    color: #495057;
    font-size: 10px;
    pointer-events: none;
  }

  .stroke-style-sample {
    display: block;
    width: 34px;
    height: 10px;
    overflow: visible;
    pointer-events: none;
  }

  .stroke-text-size {
    display: grid;
    place-items: center;
    width: 28px;
    height: 20px;
    border-radius: 4px;
    background: #f1f3f5;
    font-weight: 700;
    pointer-events: none;
  }

  .stroke-style-sample[hidden],
  .stroke-text-size[hidden] {
    display: none;
  }

  .stroke-menu {
    position: fixed;
    inset: auto;
    box-sizing: border-box;
    min-width: 132px;
    margin: 0;
    padding: 4px;
    border: 1px solid #ced4da;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 10px 30px rgb(0 0 0 / 22%);
    color: #1e1e1e;
    font: 13px/1 system-ui, sans-serif;
  }

  .stroke-menu::backdrop {
    background: transparent;
  }

  .palette .stroke-menu-option {
    display: flex;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 8px;
    border-radius: 5px;
    text-align: left;
  }

  .palette .stroke-menu-option[aria-selected='true'] {
    background: #e7f5ff;
    box-shadow: inset 0 0 0 1px #74c0fc;
  }

  .stroke-menu-label {
    flex: 1;
    white-space: nowrap;
  }

  .stroke-width-select .stroke-menu,
  .text-size-select .stroke-menu {
    min-width: 58px;
  }
`;
