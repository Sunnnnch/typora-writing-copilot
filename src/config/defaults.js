export function createDefaultConfig(overrides = {}) {
  return {
    productName: "Typrism",
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
      modelPresets: {
        openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
        gemini: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"],
        deepseek: ["deepseek-chat", "deepseek-reasoner"],
        qwen: ["qwen-plus", "qwen-max", "qwen-turbo"],
        moonshot: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        zhipu: ["glm-4-flash", "glm-4-plus", "glm-4-air"],
        openrouter: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5"],
        "openai-compatible": [],
      },
    },
    search: {
      provider: "tavily",
      baseUrl: "https://api.tavily.com",
      apiKey: "",
      maxResults: 5,
    },
    network: {
      requestTimeoutMs: 12000,
    },
    ...overrides,
  };
}
