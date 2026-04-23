export function createApiKeyAuth({ config, i18n, store }) {
  return {
    async resolve(providerId) {
      const providerConfig = store.getProviderConfig(providerId);
      const configured = Boolean(providerConfig.apiKey);
      return {
        mode: "api-key",
        providerId,
        available: true,
        configured,
        authenticated: configured,
        providerConfig,
        message: i18n.t("auth.apiKeyPreview"),
      };
    },
  };
}
