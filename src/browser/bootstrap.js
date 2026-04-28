import { createTyprismApp } from "../main.js";

const WINDOW_KEY = "__typrism";
const LEGACY_TYPILOT_WINDOW_KEY = "__typilot";
const LEGACY_WRITING_COPILOT_WINDOW_KEY = "__typoraWritingCopilot";

export function mountTyprism(options = {}) {
  if (typeof window === "undefined") {
    return null;
  }
  if (window[LEGACY_TYPILOT_WINDOW_KEY] && !window[WINDOW_KEY]) {
    window[WINDOW_KEY] = window[LEGACY_TYPILOT_WINDOW_KEY];
  }
  if (window[LEGACY_WRITING_COPILOT_WINDOW_KEY] && !window[WINDOW_KEY]) {
    window[WINDOW_KEY] = window[LEGACY_WRITING_COPILOT_WINDOW_KEY];
  }
  if (window[WINDOW_KEY]) {
    return window[WINDOW_KEY];
  }

  const app = createTyprismApp(options);
  app.mount();
  window[WINDOW_KEY] = app;
  window[LEGACY_TYPILOT_WINDOW_KEY] = app;
  window[LEGACY_WRITING_COPILOT_WINDOW_KEY] = app;
  return app;
}

export function autoMountTyprism(options = {}) {
  if (typeof document === "undefined") {
    return null;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      mountTyprism(options);
    }, { once: true });
    return null;
  }
  return mountTyprism(options);
}

export const mountTypilot = mountTyprism;
export const autoMountTypilot = autoMountTyprism;
export const mountWritingCopilot = mountTyprism;
export const autoMountWritingCopilot = autoMountTyprism;
