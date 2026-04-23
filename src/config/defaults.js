export function createDefaultConfig(overrides = {}) {
  return {
    productName: "Typora Writing Copilot",
    ui: {
      defaultSurface: "panel",
      panelWidth: 420,
      panelCollapsedControls: true,
      streamOutput: true,
      autoApplySelectionEdits: true,
    },
    auth: {
      preferredMode: "api-key",
    },
    providers: {
      defaultProvider: "openai",
      apiKeyProviders: [
        "openai",
        "gemini",
        "deepseek",
        "qwen",
        "moonshot",
        "zhipu",
        "openrouter",
        "openai-compatible",
      ],
      presets: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          model: "",
        },
        gemini: {
          baseUrl: "https://generativelanguage.googleapis.com",
          model: "",
        },
        deepseek: {
          baseUrl: "https://api.deepseek.com",
          model: "",
        },
        qwen: {
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          model: "",
        },
        moonshot: {
          baseUrl: "https://api.moonshot.cn/v1",
          model: "",
        },
        zhipu: {
          baseUrl: "https://open.bigmodel.cn/api/paas/v4",
          model: "",
        },
        openrouter: {
          baseUrl: "https://openrouter.ai/api/v1",
          model: "",
        },
        "openai-compatible": {
          baseUrl: "",
          model: "",
        },
      },
    },
    search: {
      provider: "tavily",
      maxResults: 5,
    },
    network: {
      requestTimeoutMs: 12000,
    },
    ...overrides,
  };
}
