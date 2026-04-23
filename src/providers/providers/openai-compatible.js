function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function contentFromParts(parts = []) {
  return parts.filter(Boolean).join("\n\n").trim();
}

function normalizeHistoryMessages(historyMessages = []) {
  return historyMessages
    .filter(message => message && (message.role === "user" || message.role === "assistant"))
    .map(message => ({
      role: message.role,
      content: String(message.text || "").trim(),
    }))
    .filter(message => message.content);
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

function buildCurrentUserMessage(request, i18n) {
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

function buildMessages(request, i18n) {
  const historyMessages = normalizeHistoryMessages(request.historyMessages);
  return [
    {
      role: "system",
      content: i18n.t("provider.systemPrompt"),
    },
    ...historyMessages,
    {
      role: "user",
      content: buildCurrentUserMessage(request, i18n),
    },
  ];
}

function resolveApiEndpoint(baseUrl) {
  return `${trimTrailingSlash(baseUrl)}/chat/completions`;
}

function extractTextFromMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractDeltaText(payload) {
  const delta = payload?.choices?.[0]?.delta;
  if (!delta) return "";

  if (typeof delta.content === "string") {
    return delta.content;
  }

  if (Array.isArray(delta.content)) {
    return delta.content
      .map(item => {
        if (typeof item === "string") return item;
        if (item?.type === "reasoning") return "";
        if (typeof item?.text === "string") return item.text;
        return "";
      })
      .join("");
  }

  return "";
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
  if (typeof payload?.error?.message === "string") {
    return payload.error.message;
  }
  if (typeof payload?.message === "string") {
    return payload.message;
  }
  if (typeof payload?.raw === "string") {
    return payload.raw;
  }
  return "";
}

async function consumeStream(response, onDelta) {
  if (!response.body?.getReader) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  function flushBuffer(chunk) {
    buffer += chunk;
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";

    blocks.forEach(block => {
      block.split(/\r?\n/).forEach(line => {
        if (!line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") return;

        try {
          const payload = JSON.parse(data);
          const deltaText = extractDeltaText(payload);
          if (!deltaText) return;
          text += deltaText;
          onDelta?.(text);
        } catch (error) {
          // Ignore non-JSON keepalive chunks.
        }
      });
    });
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    flushBuffer(decoder.decode(value, { stream: true }));
  }

  flushBuffer(decoder.decode());
  return text.trim();
}

async function requestCompletion({ endpoint, body, headers, onDelta, timeoutMs, abortSignal, i18n }) {
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

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller?.signal,
    });

    if (!response.ok) {
      const payload = await readJsonSafely(response);
      throw new Error(i18n.t("provider.errorHttp", {
        status: response.status,
        detail: extractErrorMessage(payload) || i18n.t("provider.errorNoDetail"),
      }));
    }

    if (body.stream && onDelta) {
      const streamedText = await consumeStream(response, onDelta);
      if (streamedText) {
        return streamedText;
      }
    }

    const payload = await readJsonSafely(response);
    const text = extractTextFromMessageContent(payload?.choices?.[0]?.message?.content).trim();
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

export function createOpenAICompatibleProvider({ providerId, auth, i18n }) {
  return {
    id: providerId,
    async complete(request) {
      const credentials = await auth.resolve(providerId);
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

      const body = {
        model: providerConfig.model,
        messages: buildMessages(request, i18n),
        stream: Boolean(request.onDelta),
      };

      const text = await requestCompletion({
        endpoint: resolveApiEndpoint(providerConfig.baseUrl),
        body,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerConfig.apiKey}`,
        },
        onDelta: request.onDelta,
        abortSignal: request.abortSignal,
        timeoutMs: 60000,
        i18n,
      });

      return {
        providerId,
        protocol: "openai-compatible",
        credentials,
        mode: request.mode,
        selectionCapture: request.selectionCapture || null,
        text: normalizeWhitespace(text) ? text : text,
      };
    },
  };
}
