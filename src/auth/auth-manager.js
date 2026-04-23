import { createApiKeyAuth } from "./providers/api-key.js";

export function createAuthManager({ config, i18n, store }) {
  const apiKey = createApiKeyAuth({ config, i18n, store });

  return {
    getModes() {
      return ["api-key"];
    },
    async resolve(providerId) {
      return apiKey.resolve(providerId);
    },
    async startLogin() {
      return null;
    },
    async runCompletion() {
      return null;
    },
    async resetSession() {
      return null;
    },
  };
}
