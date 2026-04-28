import { createI18n } from "./i18n/index.js";
import { createDefaultConfig } from "./config/defaults.js";
import { createTyporaShell } from "./shell/typora-shell.js";
import { createPanelController } from "./ui/panel.js";
import { createSelectionToolbar } from "./ui/selection-toolbar.js";
import { createAuthManager } from "./auth/auth-manager.js";
import { createProviderRegistry } from "./providers/provider-registry.js";
import { createProviderConnectionTester } from "./providers/connection-tester.js";
import { createChatSession } from "./core/session.js";
import { createResultActions } from "./core/result-actions.js";
import { createWebSearchService } from "./search/web-search.js";
import { createWorkspaceStore } from "./state/workspace-store.js";

export function createTyprismApp(overrides = {}) {
  const i18n = createI18n(overrides.i18n);
  const config = createDefaultConfig(overrides.config);
  const store = createWorkspaceStore({ config });
  const shell = createTyporaShell({ i18n, ...overrides.shell });
  const auth = createAuthManager({ config, i18n, store });
  const providers = createProviderRegistry({ config, auth, i18n, store });
  const connectionTester = createProviderConnectionTester({ config, i18n });
  const resultActions = createResultActions({ shell });
  const search = createWebSearchService({ config, auth, providers, i18n, store });
  const session = createChatSession({ config, shell, providers, search, resultActions, i18n });
  const panel = createPanelController({
    config,
    shell,
    session,
    resultActions,
    providers,
    i18n,
    store,
    connectionTester,
  });
  const toolbar = createSelectionToolbar({ shell, panel, i18n });

  return {
    config,
    i18n,
    store,
    shell,
    auth,
    providers,
    connectionTester,
    search,
    session,
    panel,
    toolbar,
    mount() {
      panel.mount();
      toolbar.mount();
    },
    unmount() {
      toolbar.unmount();
      panel.unmount();
    },
  };
}

export const createTypilotApp = createTyprismApp;
export const createWritingCopilotApp = createTyprismApp;
