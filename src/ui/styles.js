export const WRITING_COPILOT_STYLE_ID = "typora-writing-copilot-style";

export function ensureWritingCopilotStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(WRITING_COPILOT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = WRITING_COPILOT_STYLE_ID;
  style.textContent = `
    :root {
      --twc-bg: linear-gradient(180deg, #fbfaf6 0%, #f4efe6 100%);
      --twc-panel: rgba(255, 252, 245, 0.96);
      --twc-panel-strong: #fffdf7;
      --twc-border: rgba(111, 84, 56, 0.16);
      --twc-border-strong: rgba(111, 84, 56, 0.28);
      --twc-text: #2f2418;
      --twc-muted: #77624a;
      --twc-accent: #9b5d2e;
      --twc-accent-soft: rgba(155, 93, 46, 0.12);
      --twc-user: rgba(56, 109, 89, 0.12);
      --twc-assistant: rgba(155, 93, 46, 0.10);
      --twc-shadow: 0 18px 40px rgba(68, 49, 29, 0.16);
      --twc-font: "IBM Plex Sans", "Source Sans Pro", "Avenir Next", sans-serif;
    }

    .twc-launcher {
      position: fixed;
      right: 18px;
      top: 96px;
      z-index: 99991;
      border: 1px solid var(--twc-border-strong);
      border-radius: 999px;
      background: var(--twc-panel-strong);
      color: var(--twc-text);
      box-shadow: var(--twc-shadow);
      padding: 10px 14px;
      font: 600 13px/1 var(--twc-font);
      letter-spacing: 0.04em;
      cursor: pointer;
      touch-action: none;
      user-select: none;
    }

    .twc-launcher.is-dragging {
      cursor: grabbing;
    }

    .twc-panel {
      position: fixed;
      top: 78px;
      right: 18px;
      z-index: 99990;
      width: 420px;
      max-width: calc(100vw - 32px);
      height: min(720px, calc(100vh - 108px));
      display: none;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--twc-border);
      border-radius: 20px;
      background: var(--twc-bg);
      box-shadow: var(--twc-shadow);
      color: var(--twc-text);
      font-family: var(--twc-font);
      box-sizing: border-box;
      overflow: hidden;
      backdrop-filter: blur(14px);
    }

    .twc-panel.is-open {
      display: flex;
    }

    .twc-panel-header {
      position: relative;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      z-index: 4;
    }

    .twc-panel-title {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .twc-panel-kicker {
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--twc-muted);
    }

    .twc-panel-name {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.2;
    }

    .twc-panel-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .twc-icon-button,
    .twc-button {
      border: 1px solid var(--twc-border);
      background: var(--twc-panel-strong);
      color: var(--twc-text);
      border-radius: 12px;
      font: inherit;
      cursor: pointer;
    }

    .twc-icon-button {
      min-width: 34px;
      height: 34px;
      padding: 0 10px;
      font-size: 15px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .twc-icon-button.is-pill {
      min-width: 54px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .twc-icon-button.is-active {
      border-color: var(--twc-border-strong);
      background: var(--twc-accent-soft);
    }

    .twc-options,
    .twc-sheet {
      display: none;
      position: absolute;
      left: 14px;
      right: 14px;
      z-index: 3;
      border-radius: 16px;
      background: var(--twc-panel-strong);
      border: 1px solid var(--twc-border);
      box-shadow: 0 18px 36px rgba(68, 49, 29, 0.14);
    }

    .twc-options {
      top: 68px;
      width: auto;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding: 10px;
    }

    .twc-options.is-open {
      display: grid;
    }

    .twc-sheet {
      top: 66px;
      bottom: 14px;
      padding: 14px;
      overflow: auto;
      display: none;
      flex-direction: column;
      gap: 14px;
    }

    .twc-sheet.is-open {
      display: flex;
    }

    .twc-sheet-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .twc-sheet-title {
      font-size: 16px;
      font-weight: 700;
    }

    .twc-sheet-subtitle,
    .twc-sheet-copy {
      color: var(--twc-muted);
      font-size: 12px;
      line-height: 1.6;
    }

    .twc-sheet-copy.is-muted {
      border-top: 1px solid var(--twc-border);
      padding-top: 10px;
    }

    .twc-sheet-section {
      display: grid;
      gap: 8px;
    }

    .twc-sheet-section-title {
      font-size: 11px;
      color: var(--twc-muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .twc-field {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .twc-field-span {
      grid-column: 1 / -1;
    }

    .twc-field-label {
      font-size: 11px;
      color: var(--twc-muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .twc-select,
    .twc-textarea,
    .twc-input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--twc-border);
      border-radius: 12px;
      background: #fffdf9;
      color: var(--twc-text);
      font: inherit;
    }

    .twc-select,
    .twc-input {
      padding: 9px 10px;
    }

    .twc-textarea {
      min-height: 112px;
      padding: 12px;
      resize: vertical;
      line-height: 1.6;
      caret-color: var(--twc-accent);
    }

    .twc-settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .twc-settings-hidden-selects {
      display: none;
    }

    .twc-provider-browser {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .twc-provider-card {
      display: grid;
      gap: 6px;
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid var(--twc-border);
      border-radius: 14px;
      background: rgba(255, 253, 247, 0.88);
      color: var(--twc-text);
      cursor: pointer;
      font-family: var(--twc-font);
      text-align: left;
    }

    .twc-provider-card.is-active {
      border-color: var(--twc-border-strong);
      background: var(--twc-accent-soft);
    }

    .twc-provider-card-name {
      font-size: 13px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .twc-provider-card-badges {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
      color: var(--twc-muted);
      font-size: 10px;
      line-height: 1.3;
    }

    .twc-provider-card-badges span {
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(111, 84, 56, 0.08);
    }

    .twc-provider-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--twc-border);
      border-radius: 14px;
      background: rgba(255, 253, 247, 0.72);
      color: var(--twc-muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .twc-check {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--twc-border);
      background: rgba(255, 253, 247, 0.82);
      cursor: pointer;
    }

    .twc-check input {
      margin-top: 2px;
      accent-color: var(--twc-accent);
    }

    .twc-check-title {
      display: block;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }

    .twc-check-copy {
      display: block;
      margin-top: 4px;
      color: var(--twc-muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .twc-settings-status {
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(255, 252, 245, 0.75);
      border: 1px solid var(--twc-border);
      color: var(--twc-muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .twc-settings-status[data-state="success"] {
      border-color: rgba(56, 109, 89, 0.24);
      background: rgba(56, 109, 89, 0.09);
      color: #355a49;
    }

    .twc-settings-status[data-state="error"] {
      border-color: rgba(161, 68, 48, 0.28);
      background: rgba(161, 68, 48, 0.08);
      color: #8b402e;
    }

    .twc-settings-status[data-state="loading"] {
      border-color: rgba(155, 93, 46, 0.24);
      background: rgba(155, 93, 46, 0.08);
      color: #8a5629;
    }

    .twc-sheet-actions,
    .twc-actions,
    .twc-composer-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .twc-history-list {
      display: grid;
      gap: 8px;
    }

    .twc-history-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: stretch;
    }

    .twc-history-item.is-active .twc-history-item-main,
    .twc-history-item.is-active .twc-history-item-delete {
      border-color: var(--twc-border-strong);
      background: var(--twc-accent-soft);
    }

    .twc-history-item-main,
    .twc-history-item-delete {
      border: 1px solid var(--twc-border);
      background: rgba(255, 253, 247, 0.88);
      border-radius: 12px;
      color: var(--twc-text);
      cursor: pointer;
      font-family: var(--twc-font);
    }

    .twc-history-item-main {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      text-align: left;
    }

    .twc-history-item-delete {
      min-width: 44px;
      padding: 0 10px;
      font-size: 12px;
    }

    .twc-history-item-delete.is-confirm {
      border-color: rgba(161, 68, 48, 0.28);
      background: rgba(161, 68, 48, 0.08);
      color: #8b402e;
    }

    .twc-history-item-title {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .twc-history-item-meta {
      color: var(--twc-muted);
      font-size: 11px;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .twc-sheet-empty {
      padding: 14px;
      border: 1px dashed var(--twc-border-strong);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.4);
      color: var(--twc-muted);
      font-size: 12px;
      line-height: 1.6;
    }

    .twc-messages {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 4px;
    }

    .twc-empty {
      border: 1px dashed var(--twc-border-strong);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.4);
      color: var(--twc-muted);
      line-height: 1.7;
      padding: 18px;
    }

    .twc-message {
      display: grid;
      gap: 4px;
    }

    .twc-message.is-user {
      justify-items: end;
    }

    .twc-message-meta {
      font-size: 11px;
      color: var(--twc-muted);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .twc-bubble {
      max-width: 100%;
      padding: 12px 14px;
      border-radius: 16px;
      line-height: 1.65;
      word-break: break-word;
      background: var(--twc-assistant);
      border: 1px solid rgba(111, 84, 56, 0.08);
    }

    .twc-message.is-user .twc-bubble {
      background: var(--twc-user);
    }

    .twc-status {
      min-height: 18px;
      color: var(--twc-muted);
      font-size: 12px;
    }

    .twc-composer {
      display: grid;
      gap: 8px;
    }

    .twc-button {
      padding: 8px 12px;
    }

    .twc-button:disabled,
    .twc-icon-button:disabled,
    .twc-select:disabled,
    .twc-input:disabled,
    .twc-textarea:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .twc-button.is-primary {
      background: var(--twc-accent);
      border-color: var(--twc-accent);
      color: #fffaf2;
    }

    .twc-replace-preview {
      display: grid;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--twc-border-strong);
      border-radius: 16px;
      background: rgba(255, 253, 247, 0.95);
    }

    .twc-replace-preview[hidden] {
      display: none;
    }

    .twc-replace-preview-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .twc-replace-preview-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .twc-replace-preview-box {
      max-height: 120px;
      overflow: auto;
      padding: 10px;
      border: 1px solid var(--twc-border);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.54);
      color: var(--twc-text);
      font-size: 12px;
      line-height: 1.6;
      word-break: break-word;
    }

    .twc-toolbar {
      position: fixed;
      z-index: 99992;
      display: none;
      align-items: center;
      gap: 6px;
      max-width: calc(100vw - 32px);
      padding: 6px;
      border: 1px solid var(--twc-border);
      border-radius: 999px;
      background: rgba(255, 252, 247, 0.98);
      box-shadow: 0 12px 30px rgba(68, 49, 29, 0.14);
      backdrop-filter: blur(10px);
      font-family: var(--twc-font);
    }

    .twc-toolbar.is-open {
      display: flex;
    }

    .twc-toolbar-trigger,
    .twc-toolbar-button {
      border: 1px solid transparent;
      background: transparent;
      color: var(--twc-text);
      cursor: pointer;
      font-family: var(--twc-font);
    }

    .twc-toolbar-trigger {
      min-width: 38px;
      height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      background: var(--twc-panel-strong);
      border-color: var(--twc-border);
      font: 700 12px/1 var(--twc-font);
      letter-spacing: 0.06em;
    }

    .twc-toolbar-menu {
      display: none;
      flex-wrap: wrap;
      gap: 6px;
      max-width: min(520px, calc(100vw - 96px));
    }

    .twc-toolbar.is-expanded .twc-toolbar-menu {
      display: flex;
    }

    .twc-toolbar-button {
      border-radius: 10px;
      font: 600 12px/1 var(--twc-font);
      padding: 8px 10px;
    }

    .twc-toolbar-button:hover,
    .twc-toolbar-trigger:hover,
    .twc-history-item-main:hover,
    .twc-history-item-delete:hover,
    .twc-icon-button:hover,
    .twc-button:hover,
    .twc-launcher:hover {
      border-color: var(--twc-border-strong);
      background: var(--twc-accent-soft);
    }

    @media (max-width: 900px) {
      .twc-panel {
        inset: auto 12px 12px 12px;
        width: auto;
        height: min(74vh, 620px);
      }

      .twc-launcher {
        top: auto;
        bottom: 18px;
      }

      .twc-options {
        top: 74px;
        grid-template-columns: 1fr;
      }

      .twc-settings-grid {
        grid-template-columns: 1fr;
      }

      .twc-provider-browser {
        grid-template-columns: 1fr;
      }

      .twc-replace-preview-grid {
        grid-template-columns: 1fr;
      }

      .twc-field-span {
        grid-column: auto;
      }
    }
  `;

  document.head.appendChild(style);
}
