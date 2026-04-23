function buildPreviewSources(query, i18n) {
  const encoded = encodeURIComponent(query || "typora ai writing");
  return [
    {
      title: i18n.t("search.source.tavilyTitle"),
      url: "https://docs.tavily.com/",
      note: i18n.t("search.source.tavilyNote"),
    },
    {
      title: i18n.t("search.source.openaiTitle"),
      url: "https://platform.openai.com/docs/overview",
      note: i18n.t("search.source.openaiNote"),
    },
    {
      title: i18n.t("search.source.seedTitle"),
      url: `https://www.google.com/search?q=${encoded}`,
      note: i18n.t("search.source.seedNote"),
    },
  ];
}

export function createWebSearchService({ config, auth, i18n }) {
  return {
    async search({ query, selectionCapture = null }) {
      const sources = buildPreviewSources(query, i18n);
      const authState = await auth.resolve("openai-compatible");
      const lines = [
        i18n.t("search.preview.title"),
        "",
        i18n.t("search.preview.query", { query: query || i18n.t("search.preview.queryEmpty") }),
        "",
        i18n.t("search.preview.body"),
        authState?.configured === false
          ? i18n.t("search.preview.authPreview")
          : i18n.t("search.preview.authReady"),
        "",
        i18n.t("search.preview.sources"),
        ...sources.map((source, index) => `- [${index + 1}] [${source.title}](${source.url}) - ${source.note}`),
      ];

      return {
        providerId: config.search.provider,
        protocol: "search-preview",
        mode: "search_web",
        selectionCapture,
        sources,
        text: lines.join("\n"),
      };
    },
  };
}
