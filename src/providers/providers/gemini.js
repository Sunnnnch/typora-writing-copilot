function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function contentFromParts(parts = []) {
  return parts.filter(Boolean).join("\n\n").trim();
}

function normalizeModelName(model) {
  const trimmed = String(model || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("models/") ? trimmed.slice("models/".length) : trimmed;
}

function getTaskInstruction(intent, i18n) {
  switch (intent) {
    case "rewrite":
      return i18n.t("provider.task.rewrite");
    case "shorten":
      return i18n.t("provider.task.shorten");
    case "expand":
      return i18n.t("provider.task.expand");
    case "translate":
      return i18n.t("provider.task.translate");
    case "summarize":
      return i18n.t("provider.task.summarize");
    case "ask":
      return i18n.t("provider.task.ask");
    case "document_outline":
      return i18n.t("provider.task.document_outline");
    case "ai_commentary":
      return i18n.t("provider.task.ai_commentary");
    case "writing_check":
      return i18n.t("provider.task.writing_check");
    case "organize_notes":
      return i18n.t("provider.task.organize_notes");
    case "citation_search":
      return i18n.t("provider.task.citation_search");
    default:
      return "";
  }
}

function getContextLabel(scope, i18n) {
  switch (scope) {
    case "document":
      return i18n.t("provider.context.document");
    case "paragraph":
      return i18n.t("provider.context.paragraph");
    case "selection":
      return i18n.t("provider.context.selection");
    default:
      return i18n.t("provider.context.reference");
  }
}

function buildCurrentUserText(request, i18n) {
  const taskInstruction = getTaskInstruction(request.intent, i18n);
  const prompt = String(request.prompt || "").trim();
  const context = String(request.context || "").trim();
  const parts = [];
  const isSelectionEdit = request.intent === "rewrite"
    || request.intent === "shorten"
    || request.intent === "expand"
    || request.intent === "translate"
    || request.mode === "rewrite";

  if (taskInstruction) {
    parts.push(taskInstruction);
  }
  if (prompt && prompt !== taskInstruction) {
    parts.push(prompt);
  }
  if (context) {
    parts.push(`${getContextLabel(request.scope, i18n)}\n${context}`);
  }
  if (isSelectionEdit) {
    parts.push(i18n.t("provider.output.selectionEditOnly"));
  }

  return contentFromParts(parts) || prompt || context || i18n.t("provider.task.fallback");
}

function normalizeHistoryMessages(historyMessages = []) {
  return historyMessages
    .filter(message => message && (message.role === "user" || message.role === "assistant"))
    .map(message => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.text || "").trim() }],
    }))
    .filter(message => message.parts[0].text);
}

function buildGeminiBody(request, i18n) {
  return {
    systemInstruction: {
      parts: [{ text: i18n.t("provider.systemPrompt") }],
    },
    contents: [
      ...normalizeHistoryMessages(request.historyMessages),
      {
        role: "user",
        parts: [{ text: buildCurrentUserText(request, i18n) }],
      },
    ],
  };
}

function buildEndpoint(baseUrl, model, stream) {
  const root = trimTrailingSlash(baseUrl || "https://generativelanguage.googleapis.com");
  const versioned = /\/v\d+(beta)?$/i.test(root) ? root : `${root}/v1beta`;
  const action = stream ? "streamGenerateContent" : "generateContent";
  return `${versioned}/models/${encodeURIComponent(normalizeModelName(model))}:${action}`;
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map(part => typeof part?.text === "string" ? part.text : "")
    .join("");
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
  if (typeof payload?.error?.message === "string") return payload.error.message;
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.raw === "string") return payload.raw;
  return "";
}

function getHttpStatusHint(status, i18n) {
  if (status === 401 || status === 403) {
    return i18n.t("provider.errorHintAuth");
  }
  if (status === 404) {
    return i18n.t("provider.errorHintNotFound");
  }
  if (status === 429) {
    return i18n.t("provider.errorHintRateLimit");
  }
  if (status >= 500) {
    return i18n.t("provider.errorHintServer");
  }
  return "";
}

async function consumeGeminiStream(response, onDelta) {
  if (!response.body?.getReader) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  function handleBlock(block) {
    block.split(/\r?\n/).forEach(line => {
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data) return;

      try {
        const payload = JSON.parse(data);
        const deltaText = extractGeminiText(payload);
        if (!deltaText) return;
        text += deltaText;
        onDelta?.(text);
      } catch (error) {
        // Ignore non-JSON stream keepalive chunks.
      }
    });
  }

  function flushBuffer(chunk) {
    buffer += chunk;
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach(handleBlock);
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    flushBuffer(decoder.decode(value, { stream: true }));
  }

  flushBuffer(decoder.decode());
  if (buffer.trim()) {
    handleBlock(buffer);
  }
  return text.trim();
}

async function requestGeminiCompletion({ providerConfig, body, onDelta, timeoutMs, abortSignal, i18n }) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let didTimeout = false;
  let removeExternalAbort = null;
  let timeoutId = null;

  try {
    if (abortSignal?.aborted) {
      const cancelError = new Error(i18n.t("provider.errorCancelled"));
      cancelError.name = "AbortError";
      throw cancelError;
    }

    if (controller) {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, timeoutMs);

      if (abortSignal) {
        const handleExternalAbort = () => controller.abort();
        abortSignal.addEventListener("abort", handleExternalAbort, { once: true });
        removeExternalAbort = () => abortSignal.removeEventListener("abort", handleExternalAbort);
      }
    }

    const stream = Boolean(onDelta);
    const endpoint = buildEndpoint(providerConfig.baseUrl, providerConfig.model, stream);
    const url = `${endpoint}?key=${encodeURIComponent(providerConfig.apiKey)}${stream ? "&alt=sse" : ""}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });

    if (!response.ok) {
      const payload = await readJsonSafely(response);
      const hint = getHttpStatusHint(response.status, i18n);
      throw new Error(i18n.t("provider.errorHttp", {
        status: response.status,
        detail: [hint, extractErrorMessage(payload) || i18n.t("provider.errorNoDetail")].filter(Boolean).join(" "),
      }));
    }

    if (stream && onDelta) {
      const streamedText = await consumeGeminiStream(response, onDelta);
      if (streamedText) {
        return streamedText;
      }
    }

    const payload = await readJsonSafely(response);
    const text = extractGeminiText(payload).trim();
    if (!text) {
      throw new Error(i18n.t("provider.errorEmpty"));
    }
    return text;
  } catch (error) {
    if (error?.name === "AbortError") {
      if (didTimeout) {
        throw new Error(i18n.t("provider.errorTimeout"));
      }
      const cancelError = new Error(i18n.t("provider.errorCancelled"));
      cancelError.name = "AbortError";
      throw cancelError;
    }
    if (didTimeout) {
      throw new Error(i18n.t("provider.errorTimeout"));
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    removeExternalAbort?.();
  }
}

export function createGeminiProvider({ auth, i18n, config }) {
  return {
    id: "gemini",
    async complete(request) {
      const credentials = await auth.resolve("gemini");
      const providerConfig = credentials?.providerConfig || {};

      if (!providerConfig.apiKey) {
        throw new Error(i18n.t("provider.errorMissingApiKey"));
      }
      if (!providerConfig.baseUrl) {
        throw new Error(i18n.t("provider.errorMissingBaseUrl"));
      }
      if (!providerConfig.model) {
        throw new Error(i18n.t("provider.errorMissingModel"));
      }

      const text = await requestGeminiCompletion({
        providerConfig,
        body: buildGeminiBody(request, i18n),
        onDelta: request.onDelta,
        abortSignal: request.abortSignal,
        timeoutMs: config.network?.requestTimeoutMs || 60000,
        i18n,
      });

      return {
        providerId: "gemini",
        protocol: "gemini-native",
        credentials,
        mode: request.mode,
        selectionCapture: request.selectionCapture || null,
        text,
      };
    },
  };
}
