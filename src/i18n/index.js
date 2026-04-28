import { messages } from "./messages.js";

const STORAGE_KEY = "typrism.locale";
const LEGACY_TYPILOT_STORAGE_KEY = "typilot.locale";
const LEGACY_WRITING_COPILOT_STORAGE_KEY = "typora-writing-copilot.locale";
const FALLBACK_LOCALE = "en";

function resolveLocale(preference) {
  if (!preference || preference === "auto") {
    if (typeof navigator !== "undefined" && /^zh\b/i.test(navigator.language || "")) {
      return "zh-CN";
    }
    return FALLBACK_LOCALE;
  }

  return preference === "zh" ? "zh-CN" : (messages[preference] ? preference : FALLBACK_LOCALE);
}

function interpolate(template, vars = {}) {
  return String(template || "").replace(/\{([^}]+)\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

export function createI18n(overrides = {}) {
  const listeners = new Set();
  const initialPreference = overrides.preference
    || (typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
        || localStorage.getItem(LEGACY_TYPILOT_STORAGE_KEY)
        || localStorage.getItem(LEGACY_WRITING_COPILOT_STORAGE_KEY)
      : null)
    || "auto";

  const state = {
    preference: initialPreference,
  };

  const api = {
    getPreference() {
      return state.preference;
    },
    getLocale() {
      return resolveLocale(state.preference);
    },
    getLocaleOptions() {
      return ["auto", "en", "zh-CN"];
    },
    t(key, vars = {}) {
      const locale = api.getLocale();
      const bundle = messages[locale] || messages[FALLBACK_LOCALE];
      const fallbackBundle = messages[FALLBACK_LOCALE];
      const template = bundle?.[key] ?? fallbackBundle?.[key] ?? key;
      return interpolate(template, vars);
    },
    setPreference(nextPreference) {
      state.preference = nextPreference || "auto";
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, state.preference);
      }
      listeners.forEach(listener => listener(api.getLocale(), state.preference));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return api;
}
