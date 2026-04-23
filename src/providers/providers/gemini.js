function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function createGeminiProvider({ auth, i18n }) {
  return {
    id: "gemini",
    async complete(request) {
      const credentials = await auth.resolve("gemini");
      const sourceText = normalizeWhitespace(request.context || request.prompt);
      const configLine = credentials?.providerConfig?.model || credentials?.providerConfig?.baseUrl
        ? [
          credentials.providerConfig.model
            ? i18n.t("preview.model", { model: credentials.providerConfig.model })
            : null,
          credentials.providerConfig.baseUrl
            ? i18n.t("preview.baseUrl", { baseUrl: credentials.providerConfig.baseUrl })
            : null,
        ].filter(Boolean).join(" / ")
        : null;

      return {
        providerId: "gemini",
        protocol: "gemini-native",
        credentials,
        mode: request.mode,
        selectionCapture: request.selectionCapture || null,
        text: [
          i18n.t("gemini.preview.title"),
          "",
          sourceText
            ? i18n.t("gemini.preview.input", { text: sourceText })
            : i18n.t("gemini.preview.inputEmpty"),
          "",
          configLine,
          configLine ? "" : null,
          credentials?.configured === false
            ? i18n.t("gemini.preview.notConfigured")
            : i18n.t("gemini.preview.nextStep"),
        ].filter(Boolean).join("\n"),
      };
    },
  };
}
