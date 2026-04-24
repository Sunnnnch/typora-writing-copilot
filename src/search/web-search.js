function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeSearchConfig(config = {}) {
  const maxResults = Number(config.maxResults || 5);
  return {
    provider: String(config.provider || "tavily"),
    apiKey: String(config.apiKey || "").trim(),
    baseUrl: trimTrailingSlash(config.baseUrl || "https://api.tavily.com"),
    maxResults: Number.isFinite(maxResults) && maxResults > 0 ? Math.min(maxResults, 10) : 5,
  };
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
}

function extractErrorMessage(payload) {
  if (!payload) return "";
  if (typeof payload?.error === "string") return payload.error;
  if (typeof payload?.error?.message === "string") return payload.error.message;
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.raw === "string") return payload.raw;
  return "";
}

function normalizeTavilyResults(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results
    .map(result => ({
      title: String(result.title || result.url || "").trim(),
      url: String(result.url || "").trim(),
      content: String(result.content || result.snippet || result.raw_content || "").trim(),
      score: typeof result.score === "number" ? result.score : null,
    }))
    .filter(result => result.title && result.url);
}

function formatSearchSummary({ query, answer, sources, i18n }) {
  const lines = [
    i18n.t("search.live.title"),
    "",
    i18n.t("search.live.query", { query }),
    "",
  ];

  if (answer) {
    lines.push(answer.trim(), "");
  }

  if (sources.length) {
    lines.push(i18n.t("search.preview.sources"));
    sources.forEach((source, index) => {
      const note = source.content ? ` - ${source.content}` : "";
      lines.push(`- [${index + 1}] [${source.title}](${source.url})${note}`);
    });
  } else {
    lines.push(i18n.t("search.live.noResults"));
  }

  return lines.join("\n");
}

async function requestTavilySearch({ query, searchConfig, i18n, abortSignal }) {
  if (!searchConfig.apiKey) {
    throw new Error(i18n.t("search.errorMissingApiKey"));
  }

  const endpoint = `${searchConfig.baseUrl}/search`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${searchConfig.apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: searchConfig.maxResults,
      search_depth: "advanced",
      include_answer: true,
      include_raw_content: false,
    }),
    signal: abortSignal,
  });

  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw new Error(i18n.t("search.errorHttp", {
      status: response.status,
      detail: extractErrorMessage(payload) || i18n.t("provider.errorNoDetail"),
    }));
  }

  const sources = normalizeTavilyResults(payload);
  return {
    answer: String(payload?.answer || "").trim(),
    sources,
  };
}

export function createWebSearchService({ config, i18n, store }) {
  return {
    async search({ query, selectionCapture = null, abortSignal = null }) {
      const normalizedQuery = String(query || "").trim();
      if (!normalizedQuery) {
        throw new Error(i18n.t("search.errorMissingQuery"));
      }

      const searchConfig = normalizeSearchConfig({
        ...config.search,
        ...store.getSearchConfig?.(),
      });

      if (searchConfig.provider !== "tavily") {
        throw new Error(i18n.t("search.errorUnsupportedProvider", { provider: searchConfig.provider }));
      }

      const result = await requestTavilySearch({
        query: normalizedQuery,
        searchConfig,
        i18n,
        abortSignal,
      });

      return {
        providerId: searchConfig.provider,
        protocol: "tavily-search",
        mode: "search_web",
        selectionCapture,
        sources: result.sources,
        text: formatSearchSummary({
          query: normalizedQuery,
          answer: result.answer,
          sources: result.sources,
          i18n,
        }),
      };
    },
  };
}
