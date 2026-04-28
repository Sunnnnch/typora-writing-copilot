import { ensureTyprismStyles } from "./styles.js";

const ACTIONS = ["rewrite", "shorten", "expand", "translate", "summarize", "search"];

function toPositionStyle(rect) {
  if (!rect) {
    return { left: "18px", top: "18px" };
  }
  const top = Math.max(18, rect.top + window.scrollY - 56);
  const left = Math.max(18, rect.left + window.scrollX);
  return {
    top: `${top}px`,
    left: `${left}px`,
  };
}

function getActionLabel(action, i18n) {
  const key = `toolbar.${action}`;
  const label = i18n.t(key);
  return label === key ? action : label;
}

export function createSelectionToolbar({ shell, panel, i18n }) {
  let mounted = false;
  let root = null;
  let menu = null;
  let unsubscribeSelection = null;
  let unsubscribeLocale = null;
  let latestCapture = null;
  let expanded = false;

  function setExpanded(nextExpanded) {
    expanded = Boolean(nextExpanded && latestCapture?.text);
    if (!root) return;
    root.classList.toggle("is-expanded", expanded);
  }

  function syncVisibility(capture) {
    latestCapture = capture;
    if (!root) return;

    const visible = Boolean(capture?.text);
    root.classList.toggle("is-open", visible);
    if (!visible) {
      setExpanded(false);
      return;
    }

    const position = toPositionStyle(capture.rect);
    root.style.top = position.top;
    root.style.left = position.left;
    setExpanded(false);
  }

  function renderButtons() {
    if (!menu) return;
    menu.innerHTML = ACTIONS
      .map(action => `<button type="button" class="twc-toolbar-button" data-action="${action}">${getActionLabel(action, i18n)}</button>`)
      .join("");
  }

  function handleDocumentPointer(event) {
    if (!root?.classList.contains("is-expanded")) return;
    if (root.contains(event.target)) return;
    setExpanded(false);
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape") {
      setExpanded(false);
    }
  }

  function createRoot() {
    ensureTyprismStyles();

    root = document.createElement("div");
    root.className = "twc-toolbar";
    root.innerHTML = `
      <button type="button" class="twc-toolbar-trigger" data-role="trigger">AI</button>
      <div class="twc-toolbar-menu" data-role="menu"></div>
    `;

    menu = root.querySelector('[data-role="menu"]');
    renderButtons();

    root.addEventListener("mousedown", event => {
      event.preventDefault();
    });

    root.addEventListener("click", async event => {
      const trigger = event.target.closest('[data-role="trigger"]');
      if (trigger) {
        setExpanded(!expanded);
        return;
      }

      const button = event.target.closest("[data-action]");
      if (!button) return;

      const action = button.getAttribute("data-action");
      await panel.runQuickAction(action, latestCapture);
      setExpanded(false);
      syncVisibility(null);
    });

    document.addEventListener("mousedown", handleDocumentPointer, true);
    document.addEventListener("keydown", handleDocumentKeydown, true);
    document.body.appendChild(root);
  }

  return {
    mount() {
      if (mounted || typeof document === "undefined") return;
      createRoot();
      unsubscribeSelection = shell.onSelectionChange(capture => {
        syncVisibility(capture);
      });
      unsubscribeLocale = i18n.subscribe(() => {
        renderButtons();
        setExpanded(false);
        syncVisibility(latestCapture);
      });
      mounted = true;
    },
    unmount() {
      if (!mounted) return;
      unsubscribeSelection?.();
      unsubscribeLocale?.();
      document.removeEventListener("mousedown", handleDocumentPointer, true);
      document.removeEventListener("keydown", handleDocumentKeydown, true);
      root?.remove();
      root = null;
      menu = null;
      unsubscribeSelection = null;
      unsubscribeLocale = null;
      latestCapture = null;
      expanded = false;
      mounted = false;
    },
    isMounted() {
      return mounted;
    },
    getActions() {
      return [...ACTIONS];
    },
  };
}
