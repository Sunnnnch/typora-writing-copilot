const STORAGE_KEY = "typora-writing-copilot.workspace";

function createConversationId() {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function truncate(text, maxLength = 48) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
}

function cloneMessages(messages = []) {
  return messages
    .filter(message => message && typeof message.text === "string" && typeof message.role === "string")
    .map(message => ({
      role: message.role,
      text: message.text,
    }));
}

function pickString(rawConfig = {}, fallbackConfig = {}, key) {
  if (Object.prototype.hasOwnProperty.call(rawConfig, key) && rawConfig[key] != null) {
    return String(rawConfig[key]);
  }
  if (Object.prototype.hasOwnProperty.call(fallbackConfig, key) && fallbackConfig[key] != null) {
    return String(fallbackConfig[key]);
  }
  return "";
}

function normalizeProviderConfig(rawConfig = {}, fallbackConfig = {}) {
  return {
    apiKey: pickString(rawConfig, fallbackConfig, "apiKey"),
    baseUrl: pickString(rawConfig, fallbackConfig, "baseUrl"),
    model: pickString(rawConfig, fallbackConfig, "model"),
  };
}

function normalizeSearchConfig(rawConfig = {}, fallbackConfig = {}) {
  const maxResults = Number(rawConfig.maxResults || fallbackConfig.maxResults || 5);

  return {
    provider: pickString(rawConfig, fallbackConfig, "provider") || "tavily",
    apiKey: pickString(rawConfig, fallbackConfig, "apiKey"),
    baseUrl: pickString(rawConfig, fallbackConfig, "baseUrl"),
    maxResults: Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 5,
  };
}

function buildDefaultProviderConfigs(config) {
  const providerIds = config?.providers?.apiKeyProviders || [];
  const presets = config?.providers?.presets || {};

  return providerIds.reduce((result, providerId) => {
    result[providerId] = normalizeProviderConfig(presets[providerId], {});
    return result;
  }, {});
}

function buildInitialState(config) {
  return {
    settings: {
      defaultProvider: config?.providers?.defaultProvider || "openai",
      autoApplySelectionEdits: config?.ui?.autoApplySelectionEdits !== false,
      providerConfigs: buildDefaultProviderConfigs(config),
      searchConfig: normalizeSearchConfig(config?.search, {}),
    },
    conversations: {},
    order: [],
    activeConversationByDocument: {},
  };
}

function deriveConversationTitle(conversation) {
  const firstUserMessage = (conversation.messages || []).find(message => {
    return message.role === "user" && message.text && message.text.trim();
  });

  return truncate(firstUserMessage?.text || conversation.documentTitle || "New chat") || "New chat";
}

function normalizeConversation(rawConversation = {}) {
  const now = Date.now();
  const messages = cloneMessages(rawConversation.messages);
  return {
    id: String(rawConversation.id || createConversationId()),
    documentId: String(rawConversation.documentId || "document:unknown"),
    documentTitle: String(rawConversation.documentTitle || "Untitled"),
    title: String(rawConversation.title || deriveConversationTitle({ ...rawConversation, messages })),
    providerId: String(rawConversation.providerId || "openai"),
    mode: String(rawConversation.mode || "chat"),
    scope: String(rawConversation.scope || "selection"),
    messages,
    createdAt: Number(rawConversation.createdAt) || now,
    updatedAt: Number(rawConversation.updatedAt) || now,
  };
}

function normalizeState(rawState, config) {
  const initial = buildInitialState(config);
  const parsedSettings = rawState?.settings || {};
  const incomingConfigs = parsedSettings.providerConfigs || {};
  const providerConfigs = { ...initial.settings.providerConfigs };
  const searchConfig = normalizeSearchConfig(parsedSettings.searchConfig, initial.settings.searchConfig);

  Object.keys(providerConfigs).forEach(providerId => {
    providerConfigs[providerId] = normalizeProviderConfig(
      incomingConfigs[providerId],
      providerConfigs[providerId],
    );
  });

  const conversations = {};
  const order = [];
  const rawConversations = rawState?.conversations || {};

  Object.keys(rawConversations).forEach(conversationId => {
    const conversation = normalizeConversation(rawConversations[conversationId]);
    conversations[conversation.id] = conversation;
    order.push(conversation.id);
  });

  const orderedIds = (rawState?.order || [])
    .map(value => String(value))
    .filter(id => conversations[id]);

  Object.keys(conversations)
    .sort((left, right) => conversations[right].updatedAt - conversations[left].updatedAt)
    .forEach(id => {
      if (!orderedIds.includes(id)) {
        orderedIds.push(id);
      }
    });

  return {
    settings: {
      defaultProvider: String(parsedSettings.defaultProvider || initial.settings.defaultProvider),
      autoApplySelectionEdits: parsedSettings.autoApplySelectionEdits !== false,
      providerConfigs,
      searchConfig,
    },
    conversations,
    order: orderedIds,
    activeConversationByDocument: { ...(rawState?.activeConversationByDocument || {}) },
  };
}

function safeParseState(config) {
  if (typeof localStorage === "undefined") {
    return buildInitialState(config);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return buildInitialState(config);
    }
    return normalizeState(JSON.parse(raw), config);
  } catch (error) {
    return buildInitialState(config);
  }
}

export function createWorkspaceStore({ config }) {
  const listeners = new Set();
  const state = safeParseState(config);

  function emit() {
    listeners.forEach(listener => listener(api.getSnapshot()));
  }

  function persist() {
    if (typeof localStorage === "undefined") return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Ignore persistence failures in preview mode.
    }
  }

  function commit() {
    persist();
    emit();
  }

  const api = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return normalizeState(state, config);
    },
    getDefaultProviderId() {
      return state.settings.defaultProvider;
    },
    getAutoApplySelectionEdits() {
      return state.settings.autoApplySelectionEdits !== false;
    },
    setDefaultProviderId(providerId) {
      state.settings.defaultProvider = String(providerId || config?.providers?.defaultProvider || "openai");
      commit();
      return state.settings.defaultProvider;
    },
    setAutoApplySelectionEdits(enabled) {
      state.settings.autoApplySelectionEdits = Boolean(enabled);
      commit();
      return state.settings.autoApplySelectionEdits;
    },
    getProviderConfig(providerId) {
      const fallback = buildInitialState(config).settings.providerConfigs[providerId] || {};
      return normalizeProviderConfig(state.settings.providerConfigs[providerId], fallback);
    },
    updateProviderConfig(providerId, patch = {}) {
      const fallback = buildInitialState(config).settings.providerConfigs[providerId] || {};
      const nextConfig = normalizeProviderConfig(
        {
          ...state.settings.providerConfigs[providerId],
          ...patch,
        },
        fallback,
      );

      state.settings.providerConfigs[providerId] = nextConfig;
      commit();
      return nextConfig;
    },
    getSearchConfig() {
      return normalizeSearchConfig(state.settings.searchConfig, buildInitialState(config).settings.searchConfig);
    },
    updateSearchConfig(patch = {}) {
      state.settings.searchConfig = normalizeSearchConfig(
        {
          ...state.settings.searchConfig,
          ...patch,
        },
        buildInitialState(config).settings.searchConfig,
      );
      commit();
      return api.getSearchConfig();
    },
    listConversations() {
      return state.order
        .map(conversationId => state.conversations[conversationId])
        .filter(Boolean)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map(conversation => normalizeConversation(conversation));
    },
    listConversationsByDocument(documentId) {
      return api.listConversations().filter(conversation => conversation.documentId === documentId);
    },
    getConversation(conversationId) {
      const conversation = state.conversations[conversationId];
      return conversation ? normalizeConversation(conversation) : null;
    },
    createConversation(payload = {}) {
      return normalizeConversation({
        ...payload,
        id: payload.id || createConversationId(),
      });
    },
    saveConversation(conversation) {
      const normalized = normalizeConversation({
        ...conversation,
        title: deriveConversationTitle(conversation),
        updatedAt: Date.now(),
      });

      if (!state.conversations[normalized.id]) {
        normalized.createdAt = conversation.createdAt || normalized.createdAt;
      }

      state.conversations[normalized.id] = normalized;
      state.order = [normalized.id, ...state.order.filter(id => id !== normalized.id)];
      commit();
      return normalizeConversation(normalized);
    },
    deleteConversation(conversationId) {
      delete state.conversations[conversationId];
      state.order = state.order.filter(id => id !== conversationId);

      Object.keys(state.activeConversationByDocument).forEach(documentId => {
        if (state.activeConversationByDocument[documentId] === conversationId) {
          delete state.activeConversationByDocument[documentId];
        }
      });

      commit();
    },
    getActiveConversationId(documentId) {
      return documentId ? state.activeConversationByDocument[documentId] || null : null;
    },
    setActiveConversation(documentId, conversationId) {
      if (!documentId) return null;

      if (conversationId) {
        state.activeConversationByDocument[documentId] = conversationId;
      } else {
        delete state.activeConversationByDocument[documentId];
      }

      commit();
      return state.activeConversationByDocument[documentId] || null;
    },
  };

  return api;
}
