export function createResultActions({ shell }) {
  return {
    getAvailableActions() {
      return ["replace-selection", "insert-below", "copy"];
    },
    async apply(action, result) {
      const text = result?.text || "";
      const selectionCapture = result?.selectionCapture || null;

      if (!text) return { ok: false, capture: null };
      if (action === "replace-selection") {
        return shell.replaceSelectionDetailed(text, selectionCapture);
      }
      if (action === "insert-below") {
        return {
          ok: shell.insertBelow(text, selectionCapture),
          capture: null,
        };
      }
      if (action === "copy") {
        return {
          ok: await shell.copyText(text),
          capture: null,
        };
      }
      return { ok: false, capture: null };
    },
  };
}
