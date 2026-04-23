function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function ensureOpenAIModelsUrl(baseUrl) {
  return `${trimTrailingSlash(baseUrl)}/models`;
}

function ensureGeminiModelsUrl(baseUrl, apiKey) {
  const trimmed = trimTrailingSlash(baseUrl);
  const withVersion = /\/v\d+(beta)?$/i.test(trimmed)
    ? trimmed
    : `${trimmed}/v1beta`;
  return `${withVersion}/models?key=${encodeURIComponent(apiKey)}`;
}

async function readResponsePayload(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function summarizeErrorPayload(payload) {
  if (!payload) return "";
  if (typeof payload === "string") {
    return payload.trim();
  }
  if (typeof payload?.error === "string") {
    return payload.error.trim();
  }
  if (typeof payload?.error?.message === "string") {
    return payload.error.message.trim();
  }
  if (typeof payload?.message === "string") {
    return payload.message.trim();
  }
  return "";
}

function summarizeSuccessPayload(providerId, payload, i18n) {
  if (providerId === "gemini") {
    const count = Array.isArray(payload?.models) ? payload.models.length : 0;
    const firstModel = payload?.models?.[0]?.name || "";
    return i18n.t("panel.settings.testSuccessDetail", {
      count,
      sample: firstModel || i18n.t("panel.settings.testNoSample"),
    });
  }

  const count = Array.isArray(payload?.data) ? payload.data.length : 0;
  const firstModel = payload?.data?.[0]?.id || "";
  return i18n.t("panel.settings.testSuccessDetail", {
    count,
    sample: firstModel || i18n.t("panel.settings.testNoSample"),
  });
}

function buildRequest(providerId, providerConfig) {
  const baseUrl = trimTrailingSlash(providerConfig?.baseUrl);
  const apiKey = String(providerConfig?.apiKey || "").trim();

  if (!baseUrl) {
    throw new Error("missing-base-url");
  }
  if (!apiKey) {
    throw new Error("missing-api-key");
  }

  if (providerId === "gemini") {
    return {
      url: ensureGeminiModelsUrl(baseUrl, apiKey),
      options: {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    };
  }

  return {
    url: ensureOpenAIModelsUrl(baseUrl),
    options: {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    },
  };
}

export function createProviderConnectionTester({ config, i18n }) {
  return {
    async test({ providerId, providerConfig }) {
      let request;

      try {
        request = buildRequest(providerId, providerConfig);
      } catch (error) {
        if (error.message === "missing-base-url") {
          return {
            ok: false,
            code: "missing-base-url",
            message: i18n.t("panel.settings.testMissingBaseUrl"),
          };
        }
        if (error.message === "missing-api-key") {
          return {
            ok: false,
            code: "missing-api-key",
            message: i18n.t("panel.settings.testMissingApiKey"),
          };
        }
        return {
          ok: false,
          code: "invalid-config",
          message: i18n.t("panel.settings.testUnknownError"),
        };
      }

      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), config.network?.requestTimeoutMs || 12000)
        : null;

      try {
        const response = await fetch(request.url, {
          ...request.options,
          signal: controller?.signal,
        });
        const payload = await readResponsePayload(response);

        if (!response.ok) {
          const detail = summarizeErrorPayload(payload);
          return {
            ok: false,
            code: `http-${response.status}`,
            message: i18n.t("panel.settings.testHttpError", {
              status: response.status,
              detail: detail || i18n.t("panel.settings.testNoDetail"),
            }),
          };
        }

        return {
          ok: true,
          code: "ok",
          message: i18n.t("panel.settings.testSuccess", {
            detail: summarizeSuccessPayload(providerId, payload, i18n),
          }),
        };
      } catch (error) {
        if (error?.name === "AbortError") {
          return {
            ok: false,
            code: "timeout",
            message: i18n.t("panel.settings.testTimeout"),
          };
        }

        return {
          ok: false,
          code: "network-error",
          message: i18n.t("panel.settings.testNetworkError", {
            detail: error?.message || i18n.t("panel.settings.testNoDetail"),
          }),
        };
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    },
  };
}
