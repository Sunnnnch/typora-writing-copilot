import { createOpenAICompatibleProvider } from "./providers/openai-compatible.js";
import { createGeminiProvider } from "./providers/gemini.js";

export function createProviderRegistry({ config, auth, i18n, store }) {
  const providers = new Map([
    ["openai", createOpenAICompatibleProvider({ providerId: "openai", auth, i18n })],
    ["deepseek", createOpenAICompatibleProvider({ providerId: "deepseek", auth, i18n })],
    ["qwen", createOpenAICompatibleProvider({ providerId: "qwen", auth, i18n })],
    ["moonshot", createOpenAICompatibleProvider({ providerId: "moonshot", auth, i18n })],
    ["zhipu", createOpenAICompatibleProvider({ providerId: "zhipu", auth, i18n })],
    ["openrouter", createOpenAICompatibleProvider({ providerId: "openrouter", auth, i18n })],
    ["openai-compatible", createOpenAICompatibleProvider({ providerId: "openai-compatible", auth, i18n })],
    ["gemini", createGeminiProvider({ auth, i18n })],
  ]);

  return {
    list() {
      return [...providers.keys()];
    },
    getDefaultProviderId() {
      return store.getDefaultProviderId() || config.providers.defaultProvider;
    },
    get(providerId = config.providers.defaultProvider) {
      return providers.get(providerId);
    },
    async getStatus(providerId = config.providers.defaultProvider) {
      const provider = this.get(providerId);
      if (provider?.getStatus) {
        return provider.getStatus();
      }
      return auth.resolve(providerId);
    },
    async startLogin(providerId = config.providers.defaultProvider) {
      const provider = this.get(providerId);
      if (provider?.startLogin) {
        return provider.startLogin();
      }
      return auth.startLogin(providerId);
    },
    async resetSession(providerId = config.providers.defaultProvider) {
      const provider = this.get(providerId);
      if (provider?.resetSession) {
        return provider.resetSession();
      }
      return auth.resetSession(providerId);
    },
    async complete(request) {
      const provider = this.get(request.providerId);
      if (!provider) {
        throw new Error(`Unknown provider: ${request.providerId}`);
      }
      return provider.complete(request);
    },
  };
}
