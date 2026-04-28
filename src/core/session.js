function toMode(action) {
  switch (action) {
    case "rewrite":
    case "shorten":
    case "expand":
    case "translate":
      return "rewrite";
    case "summarize":
      return "summarize";
    case "search":
    case "citation_search":
      return "search_web";
    case "document_outline":
    case "ai_commentary":
    case "writing_check":
    case "organize_notes":
      return "ask";
    default:
      return "chat";
  }
}

function defaultPromptForAction(action, i18n) {
  switch (action) {
    case "rewrite":
      return i18n.t("session.prompt.rewrite");
    case "shorten":
      return i18n.t("session.prompt.shorten");
    case "expand":
      return i18n.t("session.prompt.expand");
    case "translate":
      return i18n.t("session.prompt.translate");
    case "summarize":
      return i18n.t("session.prompt.summarize");
    case "search":
    case "citation_search":
      return "";
    case "document_outline":
      return i18n.t("session.prompt.document_outline");
    case "ai_commentary":
      return i18n.t("session.prompt.ai_commentary");
    case "writing_check":
      return i18n.t("session.prompt.writing_check");
    case "organize_notes":
      return i18n.t("session.prompt.organize_notes");
    default:
      return "";
  }
}

function getContextText(shell, scope, selectionCapture) {
  if (scope === "selection") {
    return selectionCapture?.text || shell.getSelectionText() || "";
  }
  if (scope === "paragraph") {
    return shell.getCurrentParagraphText(selectionCapture) || "";
  }
  if (scope === "document") {
    return shell.getDocumentText() || "";
  }
  return "";
}

export function createChatSession({ shell, providers, search, i18n }) {
  const api = {
    async start({ mode, scope, selectionCapture = null }) {
      return {
        started: true,
        mode,
        scope,
        selectionCapture,
      };
    },
    async runQuickAction({ action, selectionCapture, providerId }) {
      return api.submit({
        providerId,
        mode: toMode(action),
        intent: action,
        scope: action === "search" ? "selection" : "selection",
        prompt: defaultPromptForAction(action, i18n),
        selectionCapture,
      });
    },
    async submit({
      providerId,
      mode,
      intent = mode,
      scope,
      prompt,
      contextOverride = null,
      selectionCapture = null,
      onDelta = null,
      historyMessages = [],
      abortSignal = null,
    }) {
      const context = contextOverride == null
        ? getContextText(shell, scope, selectionCapture)
        : String(contextOverride || "");

      if (scope === "document" && context) {
        const allowed = await shell.confirmSendFullDocument();
        if (!allowed) {
          return {
            cancelled: true,
            mode,
            scope,
          };
        }
      }

      if (mode === "search_web") {
        return search.search({
          query: prompt || context,
          selectionCapture,
          abortSignal,
        });
      }

      return providers.complete({
        providerId,
        mode,
        intent,
        scope,
        prompt,
        context,
        selectionCapture,
        onDelta,
        historyMessages,
        abortSignal,
      });
    },
  };

  return api;
}
