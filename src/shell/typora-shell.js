function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function normalizeDocumentPath(pathname) {
  if (!pathname) return null;
  const decoded = decodeURIComponent(pathname);
  return decoded.replace(/^\/([A-Za-z]:\/)/, "$1");
}

function cloneRect(rect) {
  if (!rect) return null;
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function createTextFragment(text, insertedNodes = null) {
  const fragment = document.createDocumentFragment();
  const parts = String(text || "").split("\n");

  parts.forEach((part, index) => {
    if (part) {
      const textNode = document.createTextNode(part);
      fragment.appendChild(textNode);
      insertedNodes?.push(textNode);
    }
    if (index < parts.length - 1) {
      const lineBreak = document.createElement("br");
      fragment.appendChild(lineBreak);
      insertedNodes?.push(lineBreak);
    }
  });

  return fragment;
}

function captureRange(range, textOverride = null) {
  if (!range) return null;
  const cloned = range.cloneRange();
  const text = typeof textOverride === "string" ? textOverride : cloned.toString().trim();
  return {
    text,
    range: cloned,
    rect: cloneRect(cloned.getBoundingClientRect?.()),
  };
}

function toElement(node) {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement || null;
}

function findContextBlock(node, root) {
  const element = toElement(node);
  if (!element || !root) return null;

  const semanticBlock = element.closest?.("p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, td, th");
  if (semanticBlock && root.contains(semanticBlock)) {
    return semanticBlock;
  }

  let current = element;
  while (current && current !== root) {
    if (current.parentElement === root) {
      return current;
    }
    current = current.parentElement;
  }

  return root;
}

function selectRange(range) {
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function findEditorRoot() {
  return document.querySelector("#write")
    || document.querySelector(".typora-node")
    || document.querySelector('[contenteditable="true"]')
    || document.body;
}

function findDocumentTitle() {
  const rawTitle = String(document.title || "").replace(/\s*[-|]\s*Typora\s*$/i, "").trim();
  if (rawTitle && rawTitle.toLowerCase() !== "typora") {
    return rawTitle;
  }

  const heading = findEditorRoot()?.querySelector?.("h1, h2, h3");
  if (heading?.textContent?.trim()) {
    return heading.textContent.trim();
  }

  return "Untitled";
}

export function createTyporaShell(overrides = {}) {
  const i18n = overrides.i18n;
  const selectionListeners = new Set();
  let bridgeBound = false;

  const api = {
    isAvailable() {
      return isBrowser();
    },
    getSelectionText() {
      if (overrides.getSelectionText) {
        return overrides.getSelectionText() || "";
      }
      if (!isBrowser()) return "";
      return window.getSelection?.().toString().trim() || "";
    },
    captureSelection() {
      if (overrides.captureSelection) {
        return overrides.captureSelection() || null;
      }
      if (!isBrowser()) return null;

      const selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0) return null;

      const text = selection.toString().trim();
      if (!text) return null;

      return captureRange(selection.getRangeAt(0), text);
    },
    restoreSelection(capture) {
      if (overrides.restoreSelection) {
        return overrides.restoreSelection(capture);
      }
      if (!isBrowser() || !capture?.range) return false;
      return selectRange(capture.range.cloneRange());
    },
    getDocumentText() {
      if (overrides.getDocumentText) {
        return overrides.getDocumentText() || "";
      }
      if (!isBrowser()) return "";
      return findEditorRoot()?.innerText?.trim() || document.body?.innerText?.trim() || "";
    },
    getCurrentParagraphText(selectionCapture = null) {
      if (overrides.getCurrentParagraphText) {
        return overrides.getCurrentParagraphText(selectionCapture) || "";
      }
      if (!isBrowser()) return "";

      const selection = window.getSelection?.();
      const range = selectionCapture?.range
        || (selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null);
      if (!range) return "";

      const root = findEditorRoot();
      const block = findContextBlock(range.startContainer || range.commonAncestorContainer, root);
      return block?.innerText?.trim() || "";
    },
    getDocumentIdentity() {
      if (overrides.getDocumentIdentity) {
        return overrides.getDocumentIdentity() || null;
      }
      if (!isBrowser()) {
        return {
          id: "document:unknown",
          title: "Untitled",
          path: null,
        };
      }

      const title = findDocumentTitle();
      const path = window.location?.protocol === "file:" ? normalizeDocumentPath(window.location.pathname) : null;
      return {
        id: path || `title:${title}`,
        title,
        path,
      };
    },
    replaceSelectionDetailed(text, capture = null) {
      if (overrides.replaceSelectionDetailed) {
        return overrides.replaceSelectionDetailed(text, capture);
      }
      if (!isBrowser()) {
        return { ok: false, capture: null };
      }

      const activeCapture = capture || api.captureSelection();
      if (!activeCapture?.range) {
        return { ok: false, capture: null };
      }

      const range = activeCapture.range.cloneRange();
      range.deleteContents();

      const insertedNodes = [];
      const fragment = createTextFragment(text, insertedNodes);
      range.insertNode(fragment);
      if (!insertedNodes.length) {
        range.collapse(false);
        selectRange(range);
        return {
          ok: true,
          capture: captureRange(range, ""),
        };
      }

      const insertedRange = document.createRange();
      insertedRange.setStartBefore(insertedNodes[0]);
      insertedRange.setEndAfter(insertedNodes[insertedNodes.length - 1]);
      selectRange(insertedRange);
      return {
        ok: true,
        capture: captureRange(insertedRange, String(text || "")),
      };
    },
    replaceSelection(text, capture = null) {
      if (overrides.replaceSelection) {
        return overrides.replaceSelection(text, capture);
      }
      return api.replaceSelectionDetailed(text, capture)?.ok || false;
    },
    insertBelow(text, capture = null) {
      if (overrides.insertBelow) {
        return overrides.insertBelow(text, capture);
      }
      if (!isBrowser()) return false;

      const activeCapture = capture || api.captureSelection();
      if (!activeCapture?.range) return false;

      const range = activeCapture.range.cloneRange();
      range.collapse(false);
      const fragment = createTextFragment(`\n\n${text}`);
      range.insertNode(fragment);
      range.collapse(false);
      selectRange(range);
      return true;
    },
    async copyText(text) {
      if (overrides.copyText) {
        return overrides.copyText(text);
      }
      if (!isBrowser()) return false;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    },
    async confirmSendFullDocument() {
      if (overrides.confirmSendFullDocument) {
        return overrides.confirmSendFullDocument();
      }
      if (!isBrowser()) return true;
      return window.confirm(i18n?.t("shell.confirmSendDocument") || "Send the current document to the model?");
    },
    onSelectionChange(callback) {
      selectionListeners.add(callback);
      api._ensureSelectionBridge();
      callback(api.captureSelection());
      return () => selectionListeners.delete(callback);
    },
    focusEditor() {
      if (overrides.focusEditor) {
        return overrides.focusEditor();
      }
      findEditorRoot()?.focus?.();
      return true;
    },
    _emitSelectionChange() {
      const capture = api.captureSelection();
      selectionListeners.forEach(listener => listener(capture));
    },
    _ensureSelectionBridge() {
      if (bridgeBound || !isBrowser()) return;
      bridgeBound = true;

      const emit = () => api._emitSelectionChange();
      document.addEventListener("selectionchange", emit, true);
      document.addEventListener("mouseup", emit, true);
      document.addEventListener("keyup", emit, true);
      window.addEventListener("resize", emit, true);
      window.addEventListener("scroll", emit, true);
    },
  };

  return api;
}
