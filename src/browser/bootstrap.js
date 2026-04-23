import { createWritingCopilotApp } from "../main.js";

const WINDOW_KEY = "__typoraWritingCopilot";

export function mountWritingCopilot(options = {}) {
  if (typeof window === "undefined") {
    return null;
  }
  if (window[WINDOW_KEY]) {
    return window[WINDOW_KEY];
  }

  const app = createWritingCopilotApp(options);
  app.mount();
  window[WINDOW_KEY] = app;
  return app;
}

export function autoMountWritingCopilot(options = {}) {
  if (typeof document === "undefined") {
    return null;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      mountWritingCopilot(options);
    }, { once: true });
    return null;
  }
  return mountWritingCopilot(options);
}
