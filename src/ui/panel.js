import { streamText } from "../core/stream-text.js";
import { ensureWritingCopilotStyles } from "./styles.js";

const MODE_OPTIONS = ["chat", "rewrite", "summarize", "ask", "search_web"];
const SCOPE_OPTIONS = ["selection", "paragraph", "document", "none"];
const LAUNCHER_STORAGE_KEY = "typora-writing-copilot.launcher-position";
const FLOATING_MARGIN = 12;
const HISTORY_LIMIT = 10;

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMessage(text) {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return linked.replace(/\r?\n/g, "<br>");
}

function normalizeScope(scope) {
  return scope === "document"
    ? "document"
    : scope === "paragraph"
      ? "paragraph"
      : scope === "none"
        ? "none"
        : "selection";
}

function normalizeMode(mode) {
  return MODE_OPTIONS.includes(mode) ? mode : "chat";
}

function getModeLabel(mode, i18n) {
  return i18n.t(`option.mode.${normalizeMode(mode)}`);
}

function getScopeLabel(scope, i18n) {
  return i18n.t(`option.scope.${normalizeScope(scope)}`);
}

function getProviderLabel(providerId, i18n) {
  const key = `provider.${providerId}`;
  const label = i18n.t(key);
  return label === key ? providerId : label;
}

function getQuickActionLabel(action, i18n) {
  const key = `quickAction.${action}`;
  const label = i18n.t(key);
  return label === key ? action : label;
}

function isSelectionEditIntent(intent, mode) {
  return intent === "rewrite"
    || intent === "shorten"
    || intent === "expand"
    || intent === "translate"
    || mode === "rewrite";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readStoredLauncherPosition() {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(LAUNCHER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function writeStoredLauncherPosition(position) {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(LAUNCHER_STORAGE_KEY, JSON.stringify(position));
  } catch (error) {
    // Ignore persistence failures.
  }
}

function setSelectOptions(select, values, getLabel, selectedValue) {
  if (!select) return;
  select.innerHTML = "";
  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = getLabel(value);
    select.appendChild(option);
  });
  if (selectedValue && values.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function formatConversationTime(timestamp, i18n) {
  try {
    return new Intl.DateTimeFormat(i18n.getLocale(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch (error) {
    return "";
  }
}

function cloneMessages(messages = []) {
  return messages.map(message => ({
    role: message.role,
    text: message.text,
  }));
}

function cloneSelectionCapture(capture = null) {
  if (!capture) return null;
  return {
    text: String(capture.text || ""),
    range: capture.range?.cloneRange ? capture.range.cloneRange() : capture.range || null,
    rect: capture.rect ? { ...capture.rect } : null,
  };
}

function getDocumentIdentity(shell) {
  return shell.getDocumentIdentity?.() || {
    id: "document:unknown",
    title: "Untitled",
    path: null,
  };
}

function markUiIsolated(node) {
  if (!node?.setAttribute) return;
  node.setAttribute("contenteditable", "false");
  node.setAttribute("data-typora-writing-copilot", "true");
}

function shieldKeyboardBubble(node) {
  if (!node?.addEventListener) return;
  const stop = event => {
    event.stopPropagation();
  };
  [
    "beforeinput",
    "input",
    "compositionstart",
    "compositionupdate",
    "compositionend",
  ].forEach(eventName => {
    node.addEventListener(eventName, stop, true);
    node.addEventListener(eventName, stop, false);
  });
}

export function createPanelController({ config, shell, session, resultActions, providers, i18n, store, connectionTester }) {
  let mounted = false;
  let busy = false;
  let root = null;
  let launcher = null;
  let elements = null;
  let unsubscribeLocale = null;
  let dragState = null;
  let suppressLauncherClick = false;
  let activeRequestController = null;
  let activeRequestVersion = 0;

  const state = {
    open: false,
    optionsOpen: false,
    historyOpen: false,
    settingsOpen: false,
    mode: "chat",
    scope: "selection",
    providerId: providers.getDefaultProviderId(),
    settingsProviderId: providers.getDefaultProviderId(),
    messages: [],
    lastResult: null,
    selectionCapture: null,
    documentIdentity: getDocumentIdentity(shell),
    conversationId: null,
    forceFreshConversation: false,
    settingsTesting: false,
    settingsTestState: null,
    lastRequestMeta: null,
    lastAppliedChange: null,
    pendingDeleteConversationId: null,
  };

  function closeTransientLayers(except = null) {
    if (except !== "options") {
      state.optionsOpen = false;
    }
    if (except !== "history") {
      state.historyOpen = false;
    }
    if (except !== "settings") {
      state.settingsOpen = false;
    }
  }

  function hasLastResult() {
    return Boolean(state.lastResult?.text);
  }

  function canUndoLastApply() {
    return Boolean(state.lastAppliedChange?.text && state.lastAppliedChange?.selectionCapture);
  }

  function canRegenerate() {
    return Boolean(state.lastRequestMeta && !busy && state.lastRequestMeta.status === "success");
  }

  function canRetry() {
    return Boolean(
      state.lastRequestMeta
        && !busy
        && (state.lastRequestMeta.status === "error" || state.lastRequestMeta.status === "cancelled"),
    );
  }

  function syncResultActions() {
    if (!elements) return;
    const visible = hasLastResult() || canUndoLastApply() || canRegenerate() || canRetry();
    elements.actions.style.display = visible ? "flex" : "none";
    elements.replace.style.display = hasLastResult() ? "" : "none";
    elements.insert.style.display = hasLastResult() ? "" : "none";
    elements.copy.style.display = hasLastResult() ? "" : "none";
    elements.undo.style.display = canUndoLastApply() ? "" : "none";
    elements.regenerate.style.display = canRegenerate() ? "" : "none";
    elements.retry.style.display = canRetry() ? "" : "none";
    elements.replace.disabled = !state.lastResult?.selectionCapture;
    elements.insert.disabled = !hasLastResult();
    elements.copy.disabled = !hasLastResult();
    elements.undo.disabled = !canUndoLastApply();
    elements.regenerate.disabled = !canRegenerate();
    elements.retry.disabled = !canRetry();
  }

  function updatePanelPlacement() {
    if (!root || !launcher || typeof window === "undefined") return;

    if (window.innerWidth <= 900) {
      root.style.left = "";
      root.style.top = "";
      root.style.right = "";
      root.style.bottom = "";
      root.style.width = "";
      return;
    }

    const launcherRect = launcher.getBoundingClientRect();
    const panelWidth = Math.min(config.ui.panelWidth || 420, window.innerWidth - FLOATING_MARGIN * 2);
    const panelHeight = Math.min(root.offsetHeight || 720, window.innerHeight - FLOATING_MARGIN * 2);
    const leftCandidate = launcherRect.left >= window.innerWidth / 2
      ? launcherRect.right - panelWidth
      : launcherRect.left;
    const left = clamp(
      Math.round(leftCandidate),
      FLOATING_MARGIN,
      Math.max(FLOATING_MARGIN, window.innerWidth - panelWidth - FLOATING_MARGIN),
    );

    let top;
    if (launcherRect.bottom + FLOATING_MARGIN + panelHeight <= window.innerHeight - FLOATING_MARGIN) {
      top = launcherRect.bottom + FLOATING_MARGIN;
    } else if (launcherRect.top - FLOATING_MARGIN - panelHeight >= FLOATING_MARGIN) {
      top = launcherRect.top - FLOATING_MARGIN - panelHeight;
    } else {
      top = clamp(
        Math.round(launcherRect.top),
        FLOATING_MARGIN,
        Math.max(FLOATING_MARGIN, window.innerHeight - panelHeight - FLOATING_MARGIN),
      );
    }

    root.style.width = `${panelWidth}px`;
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function setLauncherPosition(position, persist = false) {
    if (!launcher || typeof window === "undefined") return;

    const rect = launcher.getBoundingClientRect();
    const x = clamp(
      Math.round(position.x),
      FLOATING_MARGIN,
      Math.max(FLOATING_MARGIN, window.innerWidth - rect.width - FLOATING_MARGIN),
    );
    const y = clamp(
      Math.round(position.y),
      FLOATING_MARGIN,
      Math.max(FLOATING_MARGIN, window.innerHeight - rect.height - FLOATING_MARGIN),
    );

    launcher.style.left = `${x}px`;
    launcher.style.top = `${y}px`;
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";

    if (persist) {
      writeStoredLauncherPosition({ x, y });
    }

    if (state.open) {
      updatePanelPlacement();
    }
  }

  function applyStoredLauncherPosition() {
    const stored = readStoredLauncherPosition();
    if (stored) {
      setLauncherPosition(stored, false);
      return;
    }

    const rect = launcher.getBoundingClientRect();
    setLauncherPosition({ x: rect.left, y: rect.top }, false);
  }

  function renderMessages() {
    if (!elements) return;
    if (state.messages.length === 0) {
      elements.messages.innerHTML = `
        <div class="twc-empty">
          ${escapeHtml(i18n.t("panel.empty"))}
        </div>
      `;
      return;
    }

    const userLabel = i18n.t("panel.meta.you");
    const assistantLabel = i18n.t("panel.meta.assistant");
    elements.messages.innerHTML = state.messages.map(message => `
      <div class="twc-message ${message.role === "user" ? "is-user" : ""}">
        <div class="twc-message-meta">${message.role === "user" ? userLabel : assistantLabel}</div>
        <div class="twc-bubble">${formatMessage(message.text)}</div>
      </div>
    `).join("");
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function setStatus(text) {
    if (elements) {
      elements.status.textContent = text || "";
    }
  }

  function setBusy(nextBusy, label = "") {
    busy = nextBusy;
    setStatus(nextBusy ? label : "");
    syncUi();
  }

  function invalidateActiveRequest({ abort = false, silent = true } = {}) {
    activeRequestVersion += 1;
    if (abort && activeRequestController && !activeRequestController.signal.aborted) {
      activeRequestController.abort();
      if (!silent) {
        setStatus(i18n.t("panel.status.stopping"));
      }
    }
    activeRequestController = null;
    busy = false;
  }

  function stopActiveRequest() {
    if (!activeRequestController || activeRequestController.signal.aborted) return false;
    activeRequestController.abort();
    setStatus(i18n.t("panel.status.stopping"));
    return true;
  }

  function focusComposer() {
    if (!elements?.input) return;

    const focus = () => {
      elements.input.disabled = false;
      elements.input.readOnly = false;
      elements.input.style.pointerEvents = "auto";
      elements.input.focus();
      if (typeof elements.input.setSelectionRange === "function") {
        const length = elements.input.value.length;
        elements.input.setSelectionRange(length, length);
      }
    };

    focus();
    setTimeout(focus, 0);
    setTimeout(focus, 40);
  }

  function updateDocumentIdentity() {
    state.documentIdentity = getDocumentIdentity(shell);
    if (elements) {
      elements.historySubtitle.textContent = i18n.t("panel.history.subtitle", {
        title: state.documentIdentity.title,
      });
    }
  }

  function resetDraft({ fresh = false } = {}) {
    invalidateActiveRequest({ abort: true, silent: true });
    state.messages = [];
    state.lastResult = null;
    state.lastAppliedChange = null;
    state.lastRequestMeta = null;
    state.conversationId = null;
    state.forceFreshConversation = fresh;
    state.mode = "chat";
    state.scope = "selection";
    state.providerId = store.getDefaultProviderId() || providers.getDefaultProviderId();
    state.selectionCapture = shell.captureSelection();
    if (elements?.input) {
      elements.input.value = "";
      elements.input.disabled = false;
    }
    setStatus("");
    renderMessages();
    syncResultActions();
    renderHistory();
    syncUi();
  }

  function activateFreshChat() {
    resetDraft({ fresh: true });
    state.pendingDeleteConversationId = null;
    state.open = true;
    closeTransientLayers();
    syncUi();
    focusComposer();
    setStatus(i18n.t("panel.status.newChatReady"));
  }

  function loadConversation(conversation) {
    if (!conversation) return;
    invalidateActiveRequest({ abort: true, silent: true });

    state.conversationId = conversation.id;
    state.providerId = conversation.providerId || state.providerId;
    state.mode = normalizeMode(conversation.mode || state.mode);
    state.scope = normalizeScope(conversation.scope || state.scope);
    state.messages = cloneMessages(conversation.messages || []);
    state.lastResult = null;
    state.lastAppliedChange = null;
    state.lastRequestMeta = null;
    state.pendingDeleteConversationId = null;
    state.forceFreshConversation = false;
    setStatus("");
    renderMessages();
    syncResultActions();
    renderHistory();
    syncUi();
  }

  function loadActiveConversationForCurrentDocument() {
    updateDocumentIdentity();
    if (state.forceFreshConversation) {
      renderHistory();
      return;
    }

    const activeConversationId = store.getActiveConversationId(state.documentIdentity.id);
    if (!activeConversationId) {
      if (!state.messages.length) {
        state.providerId = store.getDefaultProviderId() || providers.getDefaultProviderId();
        syncUi();
      }
      renderHistory();
      return;
    }

    if (state.conversationId === activeConversationId && state.messages.length) {
      renderHistory();
      return;
    }

    const conversation = store.getConversation(activeConversationId);
    if (conversation) {
      loadConversation(conversation);
    } else {
      store.setActiveConversation(state.documentIdentity.id, null);
      renderHistory();
    }
  }

  function persistConversation() {
    if (!state.messages.length) return null;

    updateDocumentIdentity();
    const existingConversation = state.conversationId ? store.getConversation(state.conversationId) : null;
    const conversation = store.saveConversation({
      ...existingConversation,
      id: existingConversation?.id || state.conversationId,
      documentId: existingConversation?.documentId || state.documentIdentity.id,
      documentTitle: existingConversation?.documentTitle || state.documentIdentity.title,
      providerId: state.providerId,
      mode: state.mode,
      scope: state.scope,
      messages: state.messages,
      createdAt: existingConversation?.createdAt,
    });

    state.conversationId = conversation.id;
    state.forceFreshConversation = false;
    store.setActiveConversation(state.documentIdentity.id, conversation.id);
    renderHistory();
    return conversation;
  }

  function rememberAppliedChange(originalText, appliedCapture) {
    if (!originalText || !appliedCapture?.range) {
      state.lastAppliedChange = null;
      return;
    }

    state.lastAppliedChange = {
      text: originalText,
      selectionCapture: cloneSelectionCapture(appliedCapture),
    };
  }

  function rememberLastRequest(meta) {
    state.lastRequestMeta = meta
      ? {
        ...meta,
        selectionCapture: cloneSelectionCapture(meta.selectionCapture),
        baseMessages: cloneMessages(meta.baseMessages),
      }
      : null;
  }

  async function replayLastRequest(kind = "regenerate") {
    if (busy || !state.lastRequestMeta) return null;

    const requestMeta = state.lastRequestMeta;
    state.messages = cloneMessages(requestMeta.baseMessages);
    state.lastResult = null;
    state.lastAppliedChange = null;
    state.conversationId = requestMeta.conversationId || state.conversationId;
    state.providerId = requestMeta.providerId || state.providerId;
    renderMessages();
    syncResultActions();
    syncUi();

    setStatus(i18n.t(kind === "retry" ? "panel.status.retrying" : "panel.status.regenerating"));

    return submitRequest({
      mode: requestMeta.mode,
      scope: requestMeta.scope,
      prompt: requestMeta.prompt,
      intent: requestMeta.intent,
      selectionCapture: cloneSelectionCapture(requestMeta.selectionCapture),
      userLabel: requestMeta.userLabel,
      persistMode: requestMeta.persistMode,
    });
  }

  async function undoLastApply() {
    if (!state.lastAppliedChange) return false;

    const restored = await resultActions.apply("replace-selection", {
      text: state.lastAppliedChange.text,
      selectionCapture: cloneSelectionCapture(state.lastAppliedChange.selectionCapture),
    });

    if (!restored?.ok) {
      setStatus(i18n.t("panel.status.undoFailed"));
      return false;
    }

    state.lastAppliedChange = null;
    if (state.lastResult) {
      state.lastResult.selectionCapture = cloneSelectionCapture(restored.capture);
    }
    if (state.lastRequestMeta) {
      state.lastRequestMeta.selectionCapture = cloneSelectionCapture(restored.capture);
      state.lastRequestMeta.status = "success";
    }

    syncResultActions();
    setStatus(i18n.t("panel.status.undoApplied"));
    return true;
  }

  async function streamResponse(text) {
    let current = "";
    state.messages.push({ role: "assistant", text: "" });
    renderMessages();

    for await (const chunk of streamText(text, { chunkSize: 28 })) {
      current += chunk;
      state.messages[state.messages.length - 1].text = current;
      renderMessages();
    }

    return current;
  }

  function renderHistoryList(conversations, emptyText, activeId) {
    if (!conversations.length) {
      return `<div class="twc-sheet-empty">${escapeHtml(emptyText)}</div>`;
    }

    return conversations.map(conversation => {
      const activeClass = conversation.id === activeId ? " is-active" : "";
      const confirmDelete = state.pendingDeleteConversationId === conversation.id;
      const meta = [
        conversation.documentTitle,
        formatConversationTime(conversation.updatedAt, i18n),
      ].filter(Boolean).join(" · ");

      return `
        <div class="twc-history-item${activeClass}">
          <button type="button" class="twc-history-item-main" data-open-conversation="${escapeHtml(conversation.id)}">
            <span class="twc-history-item-title">${escapeHtml(conversation.title)}</span>
            <span class="twc-history-item-meta">${escapeHtml(meta)}</span>
          </button>
          <button type="button" class="twc-history-item-delete${confirmDelete ? " is-confirm" : ""}" data-delete-conversation="${escapeHtml(conversation.id)}">
            ${escapeHtml(i18n.t(confirmDelete ? "panel.history.confirmDeleteShort" : "panel.history.deleteShort"))}
          </button>
        </div>
      `;
    }).join("");
  }

  function renderHistory() {
    if (!elements) return;

    updateDocumentIdentity();
    const allConversations = store.listConversations();
    const currentDocumentConversations = state.documentIdentity?.id
      ? allConversations.filter(conversation => conversation.documentId === state.documentIdentity.id)
      : [];
    const recentConversations = allConversations
      .filter(conversation => conversation.documentId !== state.documentIdentity?.id)
      .slice(0, HISTORY_LIMIT);

    elements.historyCurrent.innerHTML = renderHistoryList(
      currentDocumentConversations,
      i18n.t("panel.history.emptyCurrent"),
      state.conversationId,
    );
    elements.historyRecent.innerHTML = renderHistoryList(
      recentConversations,
      i18n.t("panel.history.emptyRecent"),
      state.conversationId,
    );
  }

  function getDraftSettingsProviderConfig() {
    if (!elements) {
      return store.getProviderConfig(state.settingsProviderId);
    }

    return {
      baseUrl: elements.settingsBaseUrl.value.trim(),
      model: elements.settingsModel.value.trim(),
      apiKey: elements.settingsApiKey.value.trim(),
    };
  }

  function renderSettings() {
    if (!elements) return;

    const providerIds = providers.list();
    const defaultProviderId = store.getDefaultProviderId() || providers.getDefaultProviderId();
    const settingsProviderId = providerIds.includes(state.settingsProviderId)
      ? state.settingsProviderId
      : defaultProviderId;
    const providerConfig = store.getProviderConfig(settingsProviderId);

    state.settingsProviderId = settingsProviderId;

    setSelectOptions(elements.settingsDefaultProvider, providerIds, providerId => getProviderLabel(providerId, i18n), defaultProviderId);
    setSelectOptions(elements.settingsProvider, providerIds, providerId => getProviderLabel(providerId, i18n), settingsProviderId);

    elements.settingsBaseUrl.value = providerConfig.baseUrl || "";
    elements.settingsModel.value = providerConfig.model || "";
    elements.settingsApiKey.value = providerConfig.apiKey || "";
    elements.settingsAutoApply.checked = store.getAutoApplySelectionEdits();
    elements.settingsTest.disabled = state.settingsTesting;
    elements.settingsTest.textContent = state.settingsTesting
      ? i18n.t("panel.settings.testing")
      : i18n.t("panel.settings.test");

    const activeStatus = state.settingsTestState?.providerId === settingsProviderId
      ? state.settingsTestState
      : {
        kind: providerConfig.apiKey ? "success" : "neutral",
        text: providerConfig.apiKey
          ? i18n.t("panel.settings.configured")
          : i18n.t("panel.settings.notConfigured"),
      };

    elements.settingsStatus.dataset.state = activeStatus.kind || "neutral";
    elements.settingsStatus.textContent = activeStatus.text;
  }

  function syncUi() {
    if (!elements) return;

    root.classList.toggle("is-open", state.open);
    root.classList.toggle("is-chat-mode", state.mode === "chat");
    elements.options.classList.toggle("is-open", state.optionsOpen);
    elements.historySheet.classList.toggle("is-open", state.historyOpen);
    elements.settingsSheet.classList.toggle("is-open", state.settingsOpen);
    elements.options.hidden = !state.optionsOpen;
    elements.historySheet.hidden = !state.historyOpen;
    elements.settingsSheet.hidden = !state.settingsOpen;
    elements.options.inert = !state.optionsOpen;
    elements.historySheet.inert = !state.historyOpen;
    elements.settingsSheet.inert = !state.settingsOpen;
    elements.options.style.pointerEvents = state.optionsOpen ? "auto" : "none";
    elements.historySheet.style.pointerEvents = state.historyOpen ? "auto" : "none";
    elements.settingsSheet.style.pointerEvents = state.settingsOpen ? "auto" : "none";
    elements.toggleOptions.classList.toggle("is-active", state.optionsOpen);
    elements.toggleHistory.classList.toggle("is-active", state.historyOpen);
    elements.toggleSettings.classList.toggle("is-active", state.settingsOpen);
    elements.mode.value = state.mode;
    elements.scope.value = state.scope;
    elements.provider.value = state.providerId;
    elements.language.value = i18n.getPreference();
    elements.send.disabled = busy;
    elements.input.disabled = false;
    elements.stop.style.display = busy ? "inline-flex" : "none";
    elements.stop.disabled = !busy;
    syncResultActions();

    if (state.open) {
      updatePanelPlacement();
    }
  }

  async function submitRequest({
    mode,
    scope,
    prompt,
    intent = mode,
    selectionCapture = null,
    userLabel = null,
    persistMode = true,
  }) {
    updateDocumentIdentity();
    const historyMessages = cloneMessages(state.messages);
    const effectiveScope = normalizeScope(scope);
    const effectiveMode = normalizeMode(mode);
    const capture = cloneSelectionCapture(
      selectionCapture || (effectiveScope === "selection" ? shell.captureSelection() : null),
    );
    const requestVersion = ++activeRequestVersion;

    const previousMode = state.mode;
    const previousScope = state.scope;
    state.mode = effectiveMode;
    state.scope = effectiveScope;
    state.selectionCapture = capture;
    state.lastResult = null;
    state.open = true;
    closeTransientLayers(effectiveMode === "chat" ? null : "options");
    syncUi();

    rememberLastRequest({
      conversationId: state.conversationId,
      providerId: state.providerId,
      mode: effectiveMode,
      scope: effectiveScope,
      prompt,
      intent,
      selectionCapture: capture,
      userLabel,
      persistMode,
      baseMessages: historyMessages,
      status: "pending",
    });

    if (userLabel || prompt) {
      state.messages.push({
        role: "user",
        text: userLabel || prompt,
      });
      renderMessages();
    }

    setBusy(
      true,
      effectiveMode === "search_web"
        ? i18n.t("panel.status.preparingSearch")
        : i18n.t("panel.status.preparingResponse"),
    );

    try {
      const requestController = typeof AbortController !== "undefined" ? new AbortController() : null;
      activeRequestController = requestController;
      let liveText = "";
      let usedLiveDelta = false;
      let assistantIndex = -1;
      const onDelta = config.ui.streamOutput
        ? nextText => {
          if (requestVersion !== activeRequestVersion) return;
          if (!usedLiveDelta) {
            usedLiveDelta = true;
            state.messages.push({ role: "assistant", text: "" });
            assistantIndex = state.messages.length - 1;
          }
          liveText = nextText;
          state.messages[assistantIndex].text = nextText;
          renderMessages();
        }
        : null;

      const result = await session.submit({
        providerId: state.providerId,
        mode: effectiveMode,
        intent,
        scope: effectiveScope,
        prompt,
        selectionCapture: capture,
        onDelta,
        historyMessages,
        abortSignal: requestController?.signal,
      });

      if (requestVersion !== activeRequestVersion) {
        return null;
      }

      if (result?.cancelled) {
        if (state.lastRequestMeta) {
          state.lastRequestMeta.status = "cancelled";
        }
        setStatus(i18n.t("panel.status.cancelled"));
        syncResultActions();
        return result;
      }

      let text = result.text || "";
      if (usedLiveDelta) {
        text = liveText;
      } else if (config.ui.streamOutput) {
        text = await streamResponse(text);
      } else {
        state.messages.push({ role: "assistant", text });
        renderMessages();
      }

      state.lastResult = {
        ...result,
        text,
        selectionCapture: cloneSelectionCapture(result.selectionCapture || capture),
      };
      if (state.lastRequestMeta) {
        state.lastRequestMeta.status = "success";
      }

      const shouldAutoApply = store.getAutoApplySelectionEdits()
        && effectiveScope === "selection"
        && Boolean(state.lastResult.selectionCapture)
        && isSelectionEditIntent(intent, effectiveMode);

      if (shouldAutoApply) {
        const applied = await resultActions.apply("replace-selection", state.lastResult);
        if (requestVersion !== activeRequestVersion) {
          return null;
        }

        if (applied?.ok) {
          rememberAppliedChange(capture?.text || "", applied.capture);
          if (state.lastRequestMeta) {
            state.lastRequestMeta.selectionCapture = cloneSelectionCapture(applied.capture);
          }
          state.lastResult.selectionCapture = null;
          setStatus(i18n.t("panel.status.autoApplied"));
        } else {
          state.lastAppliedChange = null;
          setStatus(i18n.t("panel.status.autoApplyFailed"));
        }
      }

      syncResultActions();
      persistConversation();
      if (!persistMode) {
        state.mode = previousMode;
        state.scope = previousScope;
        syncUi();
      }
      return state.lastResult;
    } catch (error) {
      if (requestVersion !== activeRequestVersion) {
        return null;
      }

      if (error?.name === "AbortError") {
        if (state.lastRequestMeta) {
          state.lastRequestMeta.status = "cancelled";
        }
        setStatus(i18n.t("panel.status.cancelled"));
        persistConversation();
        if (!persistMode) {
          state.mode = previousMode;
          state.scope = previousScope;
          syncUi();
        }
        syncResultActions();
        return null;
      }

      if (state.lastRequestMeta) {
        state.lastRequestMeta.status = "error";
      }
      state.messages.push({
        role: "assistant",
        text: `${i18n.t("panel.status.failed")}\n${error.message || error}`,
      });
      renderMessages();
      setStatus(i18n.t("panel.status.failed"));
      persistConversation();
      if (!persistMode) {
        state.mode = previousMode;
        state.scope = previousScope;
        syncUi();
      }
      return null;
    } finally {
      if (requestVersion !== activeRequestVersion) {
        return;
      }
      activeRequestController = null;
      setBusy(false);
      syncResultActions();
      elements?.input?.focus?.();
    }
  }

  function syncTranslations() {
    if (!elements) return;

    launcher.textContent = i18n.t("app.launcher");
    elements.kicker.textContent = i18n.t("app.kicker");
    elements.name.textContent = i18n.t("app.productName");
    elements.toggleHistory.textContent = i18n.t("panel.header.historyShort");
    elements.toggleHistory.title = i18n.t("panel.header.history");
    elements.toggleOptions.textContent = "+";
    elements.toggleOptions.title = i18n.t("panel.header.options");
    elements.toggleSettings.textContent = i18n.t("panel.header.settingsShort");
    elements.toggleSettings.title = i18n.t("panel.header.settings");
    elements.close.textContent = "x";
    elements.close.title = i18n.t("panel.header.close");
    elements.historyTitle.textContent = i18n.t("panel.history.title");
    elements.historySubtitle.textContent = i18n.t("panel.history.subtitle", {
      title: state.documentIdentity.title,
    });
    elements.historyCurrentTitle.textContent = i18n.t("panel.history.currentDocument");
    elements.historyRecentTitle.textContent = i18n.t("panel.history.recent");
    elements.historyNew.textContent = i18n.t("panel.history.newChat");
    elements.settingsTitle.textContent = i18n.t("panel.settings.title");
    elements.settingsCopy.textContent = i18n.t("panel.settings.copy");
    elements.settingsClose.textContent = i18n.t("panel.settings.done");
    elements.settingsNote.textContent = i18n.t("panel.settings.note");
    elements.settingsDefaultProviderLabel.textContent = i18n.t("panel.field.defaultProvider");
    elements.settingsProviderLabel.textContent = i18n.t("panel.field.providerConfig");
    elements.settingsBaseUrlLabel.textContent = i18n.t("panel.field.baseUrl");
    elements.settingsModelLabel.textContent = i18n.t("panel.field.model");
    elements.settingsApiKeyLabel.textContent = i18n.t("panel.field.apiKey");
    elements.settingsAutoApplyLabel.textContent = i18n.t("panel.field.autoApplySelectionEdits");
    elements.settingsAutoApplyCopy.textContent = i18n.t("panel.settings.autoApplySelectionEditsHelp");
    elements.settingsBaseUrl.placeholder = i18n.t("panel.settings.baseUrlPlaceholder");
    elements.settingsModel.placeholder = i18n.t("panel.settings.modelPlaceholder");
    elements.settingsApiKey.placeholder = i18n.t("panel.settings.apiKeyPlaceholder");
    elements.settingsTest.textContent = state.settingsTesting
      ? i18n.t("panel.settings.testing")
      : i18n.t("panel.settings.test");
    elements.settingsSave.textContent = i18n.t("panel.settings.save");
    elements.providerLabel.textContent = i18n.t("panel.field.provider");
    elements.modeLabel.textContent = i18n.t("panel.field.mode");
    elements.scopeLabel.textContent = i18n.t("panel.field.scope");
    elements.languageLabel.textContent = i18n.t("panel.field.language");
    elements.input.placeholder = i18n.t("panel.input.placeholder");
    elements.send.textContent = i18n.t("panel.action.send");
    elements.stop.textContent = i18n.t("panel.action.stop");
    elements.replace.textContent = i18n.t("panel.action.replace");
    elements.insert.textContent = i18n.t("panel.action.insert");
    elements.copy.textContent = i18n.t("panel.action.copy");
    elements.undo.textContent = i18n.t("panel.action.undo");
    elements.regenerate.textContent = i18n.t("panel.action.regenerate");
    elements.retry.textContent = i18n.t("panel.action.retry");

    setSelectOptions(elements.provider, providers.list(), providerId => getProviderLabel(providerId, i18n), state.providerId);
    setSelectOptions(elements.mode, MODE_OPTIONS, mode => getModeLabel(mode, i18n), state.mode);
    setSelectOptions(elements.scope, SCOPE_OPTIONS, scope => getScopeLabel(scope, i18n), state.scope);
    setSelectOptions(elements.language, i18n.getLocaleOptions(), locale => i18n.t(`option.locale.${locale}`), i18n.getPreference());

    renderMessages();
    renderHistory();
    renderSettings();
    syncUi();
  }

  function handleDocumentPointerDown(event) {
    if (!root) return;
    if (root.contains(event.target)) return;
    if (state.pendingDeleteConversationId) {
      state.pendingDeleteConversationId = null;
      renderHistory();
    }
    closeTransientLayers();
    syncUi();
  }

  function handleWindowResize() {
    if (!launcher) return;

    const rect = launcher.getBoundingClientRect();
    setLauncherPosition({ x: rect.left, y: rect.top }, true);
    if (state.open) {
      updatePanelPlacement();
    }
  }

  function startLauncherDrag(event) {
    if (event.button !== 0 || !launcher) return;

    const rect = launcher.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false,
    };
    launcher.classList.add("is-dragging");
    launcher.setPointerCapture?.(event.pointerId);
  }

  function moveLauncherDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const nextX = dragState.originX + (event.clientX - dragState.startX);
    const nextY = dragState.originY + (event.clientY - dragState.startY);
    if (!dragState.moved && (Math.abs(nextX - dragState.originX) > 3 || Math.abs(nextY - dragState.originY) > 3)) {
      dragState.moved = true;
      suppressLauncherClick = true;
    }

    if (!dragState.moved) return;
    setLauncherPosition({ x: nextX, y: nextY }, false);
  }

  function endLauncherDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId || !launcher) return;

    launcher.classList.remove("is-dragging");
    launcher.releasePointerCapture?.(event.pointerId);
    if (dragState.moved) {
      const rect = launcher.getBoundingClientRect();
      setLauncherPosition({ x: rect.left, y: rect.top }, true);
    }
    dragState = null;
  }

  function createRoot() {
    ensureWritingCopilotStyles();

    launcher = document.createElement("button");
    launcher.className = "twc-launcher";
    launcher.type = "button";
    markUiIsolated(launcher);

    root = document.createElement("aside");
    root.className = "twc-panel";
    root.tabIndex = -1;
    markUiIsolated(root);
    root.innerHTML = `
      <div class="twc-panel-header">
        <div class="twc-panel-title">
          <div class="twc-panel-kicker" data-role="kicker"></div>
          <div class="twc-panel-name" data-role="name"></div>
        </div>
        <div class="twc-panel-header-actions">
          <button type="button" class="twc-icon-button is-pill" data-role="toggle-history"></button>
          <button type="button" class="twc-icon-button" data-role="toggle-options"></button>
          <button type="button" class="twc-icon-button is-pill" data-role="toggle-settings"></button>
          <button type="button" class="twc-icon-button" data-role="close"></button>
        </div>
      </div>
      <div class="twc-sheet" data-role="history-sheet">
        <div class="twc-sheet-head">
          <div>
            <div class="twc-sheet-title" data-role="history-title"></div>
            <div class="twc-sheet-subtitle" data-role="history-subtitle"></div>
          </div>
          <button type="button" class="twc-button" data-role="history-new"></button>
        </div>
        <div class="twc-sheet-section">
          <div class="twc-sheet-section-title" data-role="history-current-title"></div>
          <div class="twc-history-list" data-role="history-current"></div>
        </div>
        <div class="twc-sheet-section">
          <div class="twc-sheet-section-title" data-role="history-recent-title"></div>
          <div class="twc-history-list" data-role="history-recent"></div>
        </div>
      </div>
      <div class="twc-sheet" data-role="settings-sheet">
        <div class="twc-sheet-head">
          <div class="twc-sheet-title" data-role="settings-title"></div>
          <button type="button" class="twc-button" data-role="settings-close"></button>
        </div>
        <div class="twc-sheet-copy" data-role="settings-copy"></div>
        <div class="twc-settings-grid">
          <label class="twc-field">
            <span class="twc-field-label" data-role="settings-default-provider-label"></span>
            <select class="twc-select" data-role="settings-default-provider"></select>
          </label>
          <label class="twc-field">
            <span class="twc-field-label" data-role="settings-provider-label"></span>
            <select class="twc-select" data-role="settings-provider"></select>
          </label>
          <label class="twc-field twc-field-span">
            <span class="twc-field-label" data-role="settings-base-url-label"></span>
            <input type="text" class="twc-input" data-role="settings-base-url">
          </label>
          <label class="twc-field">
            <span class="twc-field-label" data-role="settings-model-label"></span>
            <input type="text" class="twc-input" data-role="settings-model">
          </label>
          <label class="twc-field">
            <span class="twc-field-label" data-role="settings-api-key-label"></span>
            <input type="password" class="twc-input" data-role="settings-api-key">
          </label>
          <label class="twc-check twc-field-span">
            <input type="checkbox" data-role="settings-auto-apply">
            <span>
              <span class="twc-check-title" data-role="settings-auto-apply-label"></span>
              <span class="twc-check-copy" data-role="settings-auto-apply-copy"></span>
            </span>
          </label>
        </div>
        <div class="twc-settings-status" data-role="settings-status"></div>
        <div class="twc-sheet-copy is-muted" data-role="settings-note"></div>
        <div class="twc-sheet-actions">
          <button type="button" class="twc-button" data-role="settings-test"></button>
          <button type="button" class="twc-button is-primary" data-role="settings-save"></button>
        </div>
      </div>
      <div class="twc-options" data-role="options">
        <label class="twc-field">
          <span class="twc-field-label" data-role="provider-label"></span>
          <select class="twc-select" data-role="provider"></select>
        </label>
        <label class="twc-field">
          <span class="twc-field-label" data-role="mode-label"></span>
          <select class="twc-select" data-role="mode"></select>
        </label>
        <label class="twc-field">
          <span class="twc-field-label" data-role="scope-label"></span>
          <select class="twc-select" data-role="scope"></select>
        </label>
        <label class="twc-field">
          <span class="twc-field-label" data-role="language-label"></span>
          <select class="twc-select" data-role="language"></select>
        </label>
      </div>
      <div class="twc-messages" data-role="messages"></div>
      <div class="twc-status" data-role="status"></div>
      <div class="twc-composer">
        <textarea class="twc-textarea" data-role="input"></textarea>
        <div class="twc-composer-actions">
          <button type="button" class="twc-button" data-role="stop" style="display:none"></button>
          <button type="button" class="twc-button is-primary" data-role="send"></button>
        </div>
      </div>
      <div class="twc-actions" data-role="actions" style="display:none">
        <button type="button" class="twc-button" data-role="replace"></button>
        <button type="button" class="twc-button" data-role="insert"></button>
        <button type="button" class="twc-button" data-role="copy"></button>
        <button type="button" class="twc-button" data-role="undo"></button>
        <button type="button" class="twc-button" data-role="regenerate"></button>
        <button type="button" class="twc-button" data-role="retry"></button>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(root);
    applyStoredLauncherPosition();

    elements = {
      kicker: root.querySelector('[data-role="kicker"]'),
      name: root.querySelector('[data-role="name"]'),
      historySheet: root.querySelector('[data-role="history-sheet"]'),
      historyTitle: root.querySelector('[data-role="history-title"]'),
      historySubtitle: root.querySelector('[data-role="history-subtitle"]'),
      historyCurrentTitle: root.querySelector('[data-role="history-current-title"]'),
      historyRecentTitle: root.querySelector('[data-role="history-recent-title"]'),
      historyCurrent: root.querySelector('[data-role="history-current"]'),
      historyRecent: root.querySelector('[data-role="history-recent"]'),
      historyNew: root.querySelector('[data-role="history-new"]'),
      settingsSheet: root.querySelector('[data-role="settings-sheet"]'),
      settingsTitle: root.querySelector('[data-role="settings-title"]'),
      settingsCopy: root.querySelector('[data-role="settings-copy"]'),
      settingsClose: root.querySelector('[data-role="settings-close"]'),
      settingsDefaultProviderLabel: root.querySelector('[data-role="settings-default-provider-label"]'),
      settingsProviderLabel: root.querySelector('[data-role="settings-provider-label"]'),
      settingsBaseUrlLabel: root.querySelector('[data-role="settings-base-url-label"]'),
      settingsModelLabel: root.querySelector('[data-role="settings-model-label"]'),
      settingsApiKeyLabel: root.querySelector('[data-role="settings-api-key-label"]'),
      settingsAutoApplyLabel: root.querySelector('[data-role="settings-auto-apply-label"]'),
      settingsAutoApplyCopy: root.querySelector('[data-role="settings-auto-apply-copy"]'),
      settingsDefaultProvider: root.querySelector('[data-role="settings-default-provider"]'),
      settingsProvider: root.querySelector('[data-role="settings-provider"]'),
      settingsBaseUrl: root.querySelector('[data-role="settings-base-url"]'),
      settingsModel: root.querySelector('[data-role="settings-model"]'),
      settingsApiKey: root.querySelector('[data-role="settings-api-key"]'),
      settingsAutoApply: root.querySelector('[data-role="settings-auto-apply"]'),
      settingsStatus: root.querySelector('[data-role="settings-status"]'),
      settingsNote: root.querySelector('[data-role="settings-note"]'),
      settingsTest: root.querySelector('[data-role="settings-test"]'),
      settingsSave: root.querySelector('[data-role="settings-save"]'),
      options: root.querySelector('[data-role="options"]'),
      providerLabel: root.querySelector('[data-role="provider-label"]'),
      modeLabel: root.querySelector('[data-role="mode-label"]'),
      scopeLabel: root.querySelector('[data-role="scope-label"]'),
      languageLabel: root.querySelector('[data-role="language-label"]'),
      provider: root.querySelector('[data-role="provider"]'),
      mode: root.querySelector('[data-role="mode"]'),
      scope: root.querySelector('[data-role="scope"]'),
      language: root.querySelector('[data-role="language"]'),
      messages: root.querySelector('[data-role="messages"]'),
      status: root.querySelector('[data-role="status"]'),
      input: root.querySelector('[data-role="input"]'),
      stop: root.querySelector('[data-role="stop"]'),
      send: root.querySelector('[data-role="send"]'),
      actions: root.querySelector('[data-role="actions"]'),
      replace: root.querySelector('[data-role="replace"]'),
      insert: root.querySelector('[data-role="insert"]'),
      copy: root.querySelector('[data-role="copy"]'),
      undo: root.querySelector('[data-role="undo"]'),
      regenerate: root.querySelector('[data-role="regenerate"]'),
      retry: root.querySelector('[data-role="retry"]'),
      toggleHistory: root.querySelector('[data-role="toggle-history"]'),
      toggleOptions: root.querySelector('[data-role="toggle-options"]'),
      toggleSettings: root.querySelector('[data-role="toggle-settings"]'),
      close: root.querySelector('[data-role="close"]'),
    };

    root.querySelectorAll("button, input, select, textarea, label, option").forEach(node => {
      markUiIsolated(node);
    });
    root.querySelectorAll("input, select, textarea").forEach(node => {
      shieldKeyboardBubble(node);
    });
  }

  function bindEvents() {
    launcher.addEventListener("pointerdown", startLauncherDrag);
    launcher.addEventListener("pointermove", moveLauncherDrag);
    launcher.addEventListener("pointerup", endLauncherDrag);
    launcher.addEventListener("pointercancel", endLauncherDrag);
    launcher.addEventListener("click", () => {
      if (suppressLauncherClick) {
        suppressLauncherClick = false;
        return;
      }

      state.open = !state.open;
      if (state.open) {
        loadActiveConversationForCurrentDocument();
        if (state.scope === "selection") {
          state.selectionCapture = shell.captureSelection();
        }
        closeTransientLayers();
        syncUi();
        focusComposer();
        return;
      }

      closeTransientLayers();
      syncUi();
    });

    elements.toggleHistory.addEventListener("click", () => {
      state.historyOpen = !state.historyOpen;
      closeTransientLayers(state.historyOpen ? "history" : null);
      if (state.historyOpen) {
        renderHistory();
      }
      syncUi();
    });

    elements.toggleOptions.addEventListener("click", () => {
      state.optionsOpen = !state.optionsOpen;
      closeTransientLayers(state.optionsOpen ? "options" : null);
      syncUi();
    });

    elements.toggleSettings.addEventListener("click", () => {
      state.settingsProviderId = state.providerId;
      state.settingsOpen = !state.settingsOpen;
      closeTransientLayers(state.settingsOpen ? "settings" : null);
      if (state.settingsOpen) {
        renderSettings();
      }
      syncUi();
    });

    elements.historyNew.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      activateFreshChat();
    });

    elements.historyCurrent.addEventListener("click", event => {
      const openTarget = event.target.closest("[data-open-conversation]");
      if (openTarget) {
        event.preventDefault();
        event.stopPropagation();
        state.pendingDeleteConversationId = null;
        const conversation = store.getConversation(openTarget.dataset.openConversation);
        if (conversation) {
          loadConversation(conversation);
          state.historyOpen = false;
          syncUi();
        }
        return;
      }

      const deleteTarget = event.target.closest("[data-delete-conversation]");
      if (deleteTarget) {
        event.preventDefault();
        event.stopPropagation();
        const conversationId = deleteTarget.dataset.deleteConversation;
        if (state.pendingDeleteConversationId !== conversationId) {
          state.pendingDeleteConversationId = conversationId;
          renderHistory();
          setStatus(i18n.t("panel.history.confirmDeleteHint"));
          return;
        }

        state.pendingDeleteConversationId = null;
        store.deleteConversation(conversationId);
        if (state.conversationId === conversationId) {
          activateFreshChat();
        }
        renderHistory();
      }
    });

    elements.historyRecent.addEventListener("click", event => {
      const openTarget = event.target.closest("[data-open-conversation]");
      if (openTarget) {
        event.preventDefault();
        event.stopPropagation();
        state.pendingDeleteConversationId = null;
        const conversation = store.getConversation(openTarget.dataset.openConversation);
        if (conversation) {
          loadConversation(conversation);
          state.historyOpen = false;
          syncUi();
        }
        return;
      }

      const deleteTarget = event.target.closest("[data-delete-conversation]");
      if (deleteTarget) {
        event.preventDefault();
        event.stopPropagation();
        const conversationId = deleteTarget.dataset.deleteConversation;
        if (state.pendingDeleteConversationId !== conversationId) {
          state.pendingDeleteConversationId = conversationId;
          renderHistory();
          setStatus(i18n.t("panel.history.confirmDeleteHint"));
          return;
        }

        state.pendingDeleteConversationId = null;
        store.deleteConversation(conversationId);
        if (state.conversationId === conversationId) {
          activateFreshChat();
        }
        renderHistory();
      }
    });

    elements.settingsProvider.addEventListener("change", () => {
      state.settingsProviderId = elements.settingsProvider.value;
      state.settingsTestState = null;
      renderSettings();
    });

    elements.settingsTest.addEventListener("click", async () => {
      if (state.settingsTesting) return;

      const providerId = state.settingsProviderId;
      const providerConfig = getDraftSettingsProviderConfig();

      state.settingsTesting = true;
      state.settingsTestState = {
        providerId,
        kind: "loading",
        text: i18n.t("panel.settings.testingStatus"),
      };
      renderSettings();

      try {
        const result = await connectionTester.test({ providerId, providerConfig });
        state.settingsTestState = {
          providerId,
          kind: result.ok ? "success" : "error",
          text: result.message,
        };
      } catch (error) {
        state.settingsTestState = {
          providerId,
          kind: "error",
          text: i18n.t("panel.settings.testUnknownError"),
        };
      } finally {
        state.settingsTesting = false;
        renderSettings();
      }
    });

    elements.settingsSave.addEventListener("click", () => {
      const previousDefault = store.getDefaultProviderId();
      const nextDefault = elements.settingsDefaultProvider.value;

      store.setDefaultProviderId(nextDefault);
      store.setAutoApplySelectionEdits(elements.settingsAutoApply.checked);
      store.updateProviderConfig(state.settingsProviderId, {
        baseUrl: elements.settingsBaseUrl.value.trim(),
        model: elements.settingsModel.value.trim(),
        apiKey: elements.settingsApiKey.value.trim(),
      });

      if (!state.messages.length || state.providerId === previousDefault) {
        state.providerId = nextDefault;
      }

      state.settingsTestState = {
        providerId: state.settingsProviderId,
        kind: "neutral",
        text: i18n.t("panel.status.settingsSaved"),
      };
      renderSettings();
      syncUi();
      setStatus(i18n.t("panel.status.settingsSaved"));
    });

    elements.settingsClose.addEventListener("click", () => {
      state.settingsOpen = false;
      syncUi();
    });

    elements.close.addEventListener("click", () => {
      state.open = false;
      closeTransientLayers();
      syncUi();
      shell.focusEditor();
    });

    elements.provider.addEventListener("change", () => {
      state.providerId = elements.provider.value;
    });

    elements.mode.addEventListener("change", () => {
      state.mode = normalizeMode(elements.mode.value);
      syncUi();
    });

    elements.scope.addEventListener("change", () => {
      state.scope = normalizeScope(elements.scope.value);
      if (state.scope === "selection") {
        state.selectionCapture = shell.captureSelection();
      }
    });

    elements.language.addEventListener("change", () => {
      i18n.setPreference(elements.language.value);
    });

    elements.send.addEventListener("click", async () => {
      if (busy) return;
      const prompt = elements.input.value.trim();
      if (!prompt && state.mode === "chat") return;
      elements.input.value = "";
      await submitRequest({
        mode: state.mode,
        scope: state.scope,
        prompt,
        userLabel: prompt || i18n.t("panel.userLabel", {
          mode: getModeLabel(state.mode, i18n),
          scope: getScopeLabel(state.scope, i18n),
        }),
        selectionCapture: state.scope === "selection" ? state.selectionCapture || shell.captureSelection() : null,
      });
    });

    elements.stop.addEventListener("click", () => {
      stopActiveRequest();
    });

    elements.input.addEventListener("keydown", async event => {
      event.stopPropagation();
      const isEnter = event.key === "Enter";
      const isComposing = event.isComposing || event.keyCode === 229;
      if (isEnter && !event.shiftKey && !isComposing) {
        event.preventDefault();
        if (busy) return;
        elements.send.click();
      }
    });

    elements.input.addEventListener("keyup", event => {
      event.stopPropagation();
    });

    elements.input.addEventListener("pointerdown", event => {
      event.stopPropagation();
    });

    elements.input.addEventListener("mousedown", event => {
      event.stopPropagation();
    });

    elements.input.addEventListener("click", event => {
      event.stopPropagation();
      setTimeout(() => focusComposer(), 0);
    });

    elements.replace.addEventListener("click", async () => {
      if (!state.lastResult) return;
      const replaced = await resultActions.apply("replace-selection", state.lastResult);
      if (!replaced?.ok) return;

      rememberAppliedChange(state.lastResult.selectionCapture?.text || "", replaced.capture);
      if (state.lastRequestMeta) {
        state.lastRequestMeta.selectionCapture = cloneSelectionCapture(replaced.capture);
        state.lastRequestMeta.status = "success";
      }
      state.lastResult.selectionCapture = cloneSelectionCapture(replaced.capture);
      syncResultActions();
      setStatus(i18n.t("panel.status.applied"));
    });

    elements.insert.addEventListener("click", async () => {
      await resultActions.apply("insert-below", state.lastResult);
    });

    elements.copy.addEventListener("click", async () => {
      await resultActions.apply("copy", state.lastResult);
      setStatus(i18n.t("panel.status.copied"));
    });

    elements.undo.addEventListener("click", async () => {
      await undoLastApply();
    });

    elements.regenerate.addEventListener("click", async () => {
      await replayLastRequest("regenerate");
    });

    elements.retry.addEventListener("click", async () => {
      await replayLastRequest("retry");
    });

    document.addEventListener("mousedown", handleDocumentPointerDown, true);
    window.addEventListener("resize", handleWindowResize, true);
  }

  const api = {
    mount() {
      if (mounted || typeof document === "undefined") return;
      createRoot();
      bindEvents();
      unsubscribeLocale = i18n.subscribe(() => {
        syncTranslations();
      });
      mounted = true;
      syncTranslations();
      loadActiveConversationForCurrentDocument();
    },
    unmount() {
      if (!mounted) return;
      unsubscribeLocale?.();
      document.removeEventListener("mousedown", handleDocumentPointerDown, true);
      window.removeEventListener("resize", handleWindowResize, true);
      launcher?.remove();
      root?.remove();
      launcher = null;
      root = null;
      elements = null;
      unsubscribeLocale = null;
      dragState = null;
      mounted = false;
    },
    isMounted() {
      return mounted;
    },
    getSurfaceMode() {
      return config.ui.defaultSurface;
    },
    async openChat(options = {}) {
      state.open = true;
      closeTransientLayers();
      loadActiveConversationForCurrentDocument();
      state.mode = normalizeMode(options.mode || state.mode);
      state.scope = normalizeScope(options.scope || state.scope);
      state.selectionCapture = options.selectionCapture || shell.captureSelection();
      syncUi();
      if (typeof options.prompt === "string") {
        elements.input.value = options.prompt;
      }
      focusComposer();
      return session.start({
        mode: state.mode,
        scope: state.scope,
        selectionCapture: state.selectionCapture,
      });
    },
    async runQuickAction(action, selectionCapture = null) {
      const capture = selectionCapture || shell.captureSelection();
      if (!capture?.text) return null;

      updateDocumentIdentity();
      state.open = true;
      closeTransientLayers();
      syncUi();

      const mode = action === "search" ? "search_web" : action === "summarize" ? "summarize" : "rewrite";
      return submitRequest({
        mode,
        scope: "selection",
        prompt: action === "search" ? capture.text : "",
        intent: action,
        selectionCapture: capture,
        userLabel: getQuickActionLabel(action, i18n),
        persistMode: false,
      });
    },
    getAvailableResultActions() {
      return resultActions.getAvailableActions();
    },
  };

  return api;
}
