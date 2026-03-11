import type { ToastItem } from "../components/ToastHost";
import type {
  AppNotification,
  AppSettings,
  BuildInfo,
  DebugResetScope,
  ReleaseStatus,
} from "./types";

export type InkbunnyDebugControls = {
  help: () => string;
  memoryReport: () => string;
  showUpdateToast: () => void;
  startGuidedTour: () => void;
  showOnboarding: () => void;
  showMockNotification(): void;
  showMockNotification(preset: DebugNotificationPreset | string): void;
  showMockNotification(options: DebugNotificationOptions): void;
  showMockErrorToast(): void;
  showMockErrorToast(preset: DebugErrorPreset | string): void;
  showMockErrorToast(options: DebugErrorToastOptions): void;
  openPanel(panel: DebugPanelName): void;
  clearToasts(): void;
  logBuildInfo(): string;
  cancelSearch(): Promise<void>;
  clearCache(): Promise<string>;
  clearState(): Promise<string>;
  clearSettings(): Promise<string>;
  clearWorkspace(): Promise<string>;
  clearLogin(): Promise<string>;
  clearQueueState(): Promise<string>;
  clearDeferredState(): Promise<string>;
  resetState(scope?: DebugResetTarget): Promise<string>;
  refreshBackend(): Promise<string>;
  refreshEverything(): Promise<string>;
  refreshPage(): string;
};

type DebugCommandDefinition = {
  command: string;
  description: string;
  example: string;
};

type RegisterDebugControlsOptions = {
  getSettings: () => AppSettings;
  getBuildInfo: () => BuildInfo | null;
  showOnboarding: () => void;
  showReleaseUpdateToast: (status: ReleaseStatus, settings: AppSettings) => void;
  showNotification: (notification: AppNotification) => void;
  pushToast: (toast: Omit<ToastItem, "id"> & { id?: string }) => void;
  clearToasts: () => void;
  openPanel: (panel: DebugPanelName) => void;
  memoryReport: () => string;
  cancelSearch: () => Promise<void>;
  resetState: (scope: DebugResetTarget) => Promise<string>;
  refreshBackend: () => Promise<string>;
  refreshEverything: () => Promise<string>;
  refreshPage: () => string;
};

type DebugToastLevel = ToastItem["level"];
type DebugNotificationLevel = AppNotification["level"];

export type DebugPanelName = "queue" | "login" | "tabs" | "unread";
export type DebugResetTarget = DebugResetScope | "deferred";

export type DebugErrorPreset =
  | "backend-unavailable"
  | "login-failed"
  | "invalid-credentials"
  | "search-failed"
  | "unknown-search-id"
  | "sign-in-required"
  | "member-watch-required"
  | "rate-limit"
  | "rate-limit-exhausted";

export type DebugErrorToastOptions = {
  preset?: DebugErrorPreset;
  message?: string;
  retryAfterMs?: number;
  dedupeKey?: string;
  sticky?: boolean;
  level?: DebugToastLevel;
};

export type DebugNotificationPreset =
  | "rate-limit"
  | "rate-limit-exhausted"
  | "queue-refreshed";

export type DebugNotificationOptions = {
  preset?: DebugNotificationPreset;
  level?: DebugNotificationLevel;
  message?: string;
  scope?: string;
  dedupeKey?: string;
  retryAfterMs?: number;
};

declare global {
  interface Window {
    __inkbunnyDebug?: InkbunnyDebugControls;
    debug?: InkbunnyDebugControls;
  }

  var debug: InkbunnyDebugControls | undefined;
}

const DEBUG_COMMANDS: DebugCommandDefinition[] = [
  {
    command: "debug.help()",
    description: "Show every available frontend debug command with examples.",
    example: "debug.help()",
  },
  {
    command: "debug.memoryReport()",
    description: "Print an estimated memory breakdown for results, queue state, and visible images.",
    example: "debug.memoryReport()",
  },
  {
    command: "debug.showUpdateToast()",
    description: "Display the release update toast using sample release data.",
    example: "debug.showUpdateToast()",
  },
  {
    command: "debug.startGuidedTour()",
    description: "Start the guided tour from the beginning.",
    example: "debug.startGuidedTour()",
  },
  {
    command: "debug.showOnboarding()",
    description: "Alias for starting the guided tour from the beginning.",
    example: "debug.showOnboarding()",
  },
  {
    command: "debug.showMockNotification()",
    description: "Simulate a backend app notification, including rate-limit style notices.",
    example: "debug.showMockNotification('rate-limit')",
  },
  {
    command: "debug.showMockErrorToast()",
    description: "Show a common app error toast. Supports presets and custom messages.",
    example: "debug.showMockErrorToast('login-failed')",
  },
  {
    command: "debug.openPanel(panel)",
    description: "Open a real UI surface such as the login modal, tabs menu, unread tab, or queue panel.",
    example: "debug.openPanel('queue')",
  },
  {
    command: "debug.clearToasts()",
    description: "Dismiss every currently visible toast immediately.",
    example: "debug.clearToasts()",
  },
  {
    command: "debug.logBuildInfo()",
    description: "Print the current build metadata and debug registration status.",
    example: "debug.logBuildInfo()",
  },
  {
    command: "debug.cancelSearch()",
    description: "Trigger the real stop-search path for the active tab.",
    example: "debug.cancelSearch()",
  },
  {
    command: "debug.clearCache()",
    description: "Flush backend caches and active search state without resetting saved settings.",
    example: "debug.clearCache()",
  },
  {
    command: "debug.clearState()",
    description: "Reset persisted workspace and settings back to defaults.",
    example: "debug.clearState()",
  },
  {
    command: "debug.clearSettings()",
    description: "Restore app settings to their defaults while leaving the current login alone.",
    example: "debug.clearSettings()",
  },
  {
    command: "debug.clearWorkspace()",
    description: "Reset saved tabs, search sessions, and workspace layout.",
    example: "debug.clearWorkspace()",
  },
  {
    command: "debug.clearLogin()",
    description: "Drop the local session and reopen the login flow without touching the server.",
    example: "debug.clearLogin()",
  },
  {
    command: "debug.clearQueueState()",
    description: "Reset the download queue, including paused state and tracked jobs.",
    example: "debug.clearQueueState()",
  },
  {
    command: "debug.clearDeferredState()",
    description: "Cancel deferred UI updates such as timers, pending saves, cooldowns, and in-flight guards.",
    example: "debug.clearDeferredState()",
  },
  {
    command: "debug.resetState()",
    description: "Run a broader reset. Supported scopes: cache, state, settings, workspace, login, queue, deferred, all.",
    example: "debug.resetState('all')",
  },
  {
    command: "debug.refreshBackend()",
    description: "Rehydrate the frontend from the current backend session, workspace, queue, and build info.",
    example: "debug.refreshBackend()",
  },
  {
    command: "debug.refreshEverything()",
    description: "Refresh backend state and then reload the page.",
    example: "debug.refreshEverything()",
  },
  {
    command: "debug.refreshPage()",
    description: "Reload the current page immediately.",
    example: "debug.refreshPage()",
  },
];

const SAMPLE_RELEASE_STATUS: ReleaseStatus = {
  currentVersion: "0.1.2",
  currentTag: "v0.1.2",
  latestTag: "v0.1.3",
  releaseURL: "https://github.com/ellypaws/inkbunny-downloader/releases/latest",
  updateAvailable: true,
};

export function registerDebugControls(options: RegisterDebugControlsOptions) {
  const instance = new InkbunnyDebug(options);
  mountDebugGlobal(instance);
  console.info("[DEBUG] Run debug.help() in this console for more info.");

  return () => {
    unmountDebugGlobal(instance);
  };
}

class InkbunnyDebug implements InkbunnyDebugControls {
  private readonly options: RegisterDebugControlsOptions;

  constructor(options: RegisterDebugControlsOptions) {
    this.options = options;
  }

  help() {
    return showDebugCommandHelp();
  }

  memoryReport() {
    return this.options.memoryReport();
  }

  showUpdateToast() {
    this.options.showReleaseUpdateToast(SAMPLE_RELEASE_STATUS, this.options.getSettings());
  }

  startGuidedTour() {
    this.options.showOnboarding();
  }

  showOnboarding() {
    this.options.showOnboarding();
  }

  showMockNotification(): void;
  showMockNotification(preset: DebugNotificationPreset | string): void;
  showMockNotification(options: DebugNotificationOptions): void;
  showMockNotification(arg?: DebugNotificationPreset | string | DebugNotificationOptions) {
    this.options.showNotification(resolveDebugNotification(arg));
  }

  showMockErrorToast(): void;
  showMockErrorToast(preset: DebugErrorPreset | string): void;
  showMockErrorToast(options: DebugErrorToastOptions): void;
  showMockErrorToast(arg?: DebugErrorPreset | string | DebugErrorToastOptions) {
    const toast = resolveDebugErrorToast(arg);
    this.options.pushToast(toast);
  }

  openPanel(panel: DebugPanelName) {
    this.options.openPanel(panel);
  }

  clearToasts() {
    this.options.clearToasts();
  }

  logBuildInfo() {
    const buildInfo = this.options.getBuildInfo();
    const payload = {
      version: buildInfo?.version ?? "",
      commit: buildInfo?.commit ?? "",
      displayVersion: buildInfo?.displayVersion ?? "",
      isDev: buildInfo?.isDev ?? false,
      debugMounted: typeof globalThis.debug !== "undefined",
    };
    console.info("Inkbunny build info:", payload);
    return JSON.stringify(payload, null, 2);
  }

  async cancelSearch() {
    await this.options.cancelSearch();
  }

  async clearCache() {
    return this.options.resetState("cache");
  }

  async clearState() {
    return this.options.resetState("state");
  }

  async clearSettings() {
    return this.options.resetState("settings");
  }

  async clearWorkspace() {
    return this.options.resetState("workspace");
  }

  async clearLogin() {
    return this.options.resetState("login");
  }

  async clearQueueState() {
    return this.options.resetState("queue");
  }

  async clearDeferredState() {
    return this.options.resetState("deferred");
  }

  async resetState(scope: DebugResetTarget = "all") {
    return this.options.resetState(scope);
  }

  async refreshBackend() {
    return this.options.refreshBackend();
  }

  async refreshEverything() {
    return this.options.refreshEverything();
  }

  refreshPage() {
    return this.options.refreshPage();
  }
}

function mountDebugGlobal(instance: InkbunnyDebugControls) {
  window.__inkbunnyDebug = instance;
  Object.defineProperty(globalThis, "debug", {
    value: instance,
    configurable: true,
    writable: true,
  });
}

function unmountDebugGlobal(instance: InkbunnyDebugControls) {
  if (window.__inkbunnyDebug === instance) {
    delete window.__inkbunnyDebug;
  }
  if (globalThis.debug === instance) {
    delete window.debug;
  }
}

function showDebugCommandHelp() {
  const rows = DEBUG_COMMANDS.map((command) => ({
    Command: command.command,
    Description: command.description,
    Example: command.example,
  }));
  if (typeof console.table === "function") {
    console.table(rows);
  }

  const message = [
    "Inkbunny frontend debug commands:",
    ...DEBUG_COMMANDS.flatMap((command) => [
      `- ${command.command}`,
      `  What it does: ${command.description}`,
      `  Example: ${command.example}`,
    ]),
    "Available panels for debug.openPanel(panel):",
    "  queue, login, tabs, unread",
    "Common notification presets:",
    "  rate-limit, rate-limit-exhausted, queue-refreshed",
    "Common error presets:",
    "  backend-unavailable, login-failed, invalid-credentials, search-failed, unknown-search-id, sign-in-required, member-watch-required, rate-limit, rate-limit-exhausted",
    "Extra examples:",
    "  debug.memoryReport()",
    "  debug.showMockNotification('rate-limit')",
    "  debug.showMockNotification({ level: 'info', message: 'Queue refreshed.' })",
    "  debug.showMockErrorToast()",
    "  debug.showMockErrorToast('rate-limit')",
    "  debug.showMockErrorToast({ preset: 'rate-limit', retryAfterMs: 8200 })",
    "  debug.showMockErrorToast('Incorrect username or password.')",
    "  debug.startGuidedTour()",
    "  debug.openPanel('tabs')",
    "  debug.logBuildInfo()",
    "  debug.cancelSearch()",
    "  debug.clearCache()",
    "  debug.clearState()",
    "  debug.clearSettings()",
    "  debug.clearWorkspace()",
    "  debug.clearLogin()",
    "  debug.clearQueueState()",
    "  debug.clearDeferredState()",
    "  debug.resetState('all')",
    "  debug.refreshBackend()",
    "  debug.refreshEverything()",
    "  debug.refreshPage()",
  ].join("\n");
  console.info(message);
  return message;
}

const DEBUG_NOTIFICATION_PRESETS: Record<DebugNotificationPreset, DebugNotificationOptions> = {
  "rate-limit": {
    level: "warning",
    message: "Inkbunny is rate limiting search. Retrying in 8.2s.",
    scope: "search",
    dedupeKey: "rate-limit-search",
    retryAfterMs: 8200,
  },
  "rate-limit-exhausted": {
    level: "error",
    message: "Inkbunny is still rate limiting search. Please try again in a moment.",
    scope: "search",
    dedupeKey: "rate-limit-exhausted-search",
  },
  "queue-refreshed": {
    level: "info",
    message: "Queue refreshed.",
    scope: "queue",
    dedupeKey: "queue-refreshed",
  },
};

const DEBUG_ERROR_PRESETS: Record<DebugErrorPreset, DebugErrorToastOptions> = {
  "backend-unavailable": {
    level: "error",
    message: "Unable to reach the Wails backend.",
    dedupeKey: "backend-unavailable",
  },
  "login-failed": {
    level: "error",
    message: "Login failed.",
    dedupeKey: "login-error",
  },
  "invalid-credentials": {
    level: "error",
    message: "Incorrect username or password.",
    dedupeKey: "login-error",
  },
  "search-failed": {
    level: "error",
    message: "Search failed.",
    dedupeKey: "search-error",
  },
  "unknown-search-id": {
    level: "error",
    message: "unknown search ID: debug-search",
    dedupeKey: "search-error",
  },
  "sign-in-required": {
    level: "error",
    message: "sign in to continue",
    dedupeKey: "auth-required",
  },
  "member-watch-required": {
    level: "error",
    message: "sign in with a member account to use My watches",
    dedupeKey: "my-watches-error",
  },
  "rate-limit": {
    level: "warning",
    message: "Inkbunny is rate limiting search. Retrying in 8.2s.",
    dedupeKey: "rate-limit-search",
    retryAfterMs: 8200,
  },
  "rate-limit-exhausted": {
    level: "error",
    message: "Inkbunny is still rate limiting search. Please try again in a moment.",
    dedupeKey: "rate-limit-exhausted-search",
  },
};

function resolveDebugErrorToast(
  arg?: DebugErrorPreset | string | DebugErrorToastOptions,
): Omit<ToastItem, "id"> & { id?: string } {
  const options =
    typeof arg === "string"
      ? getPresetOptions(arg) ?? { message: arg }
      : arg ?? { preset: "search-failed" };

  const preset = options.preset ? DEBUG_ERROR_PRESETS[options.preset] : undefined;
  const level = options.level ?? preset?.level ?? "error";
  const retryAfterMs = options.retryAfterMs ?? preset?.retryAfterMs;
  const message = options.message?.trim() || preset?.message || "Search failed.";
  const dedupeKey = options.dedupeKey ?? preset?.dedupeKey;
  const sticky = options.sticky ?? false;

  return {
    level,
    message,
    dedupeKey,
    retryAfterMs,
    sticky,
  };
}

function getPresetOptions(value: string) {
  return DEBUG_ERROR_PRESETS[value as DebugErrorPreset];
}

function resolveDebugNotification(
  arg?: DebugNotificationPreset | string | DebugNotificationOptions,
): AppNotification {
  const options =
    typeof arg === "string"
      ? getNotificationPresetOptions(arg) ?? { message: arg }
      : arg ?? { preset: "queue-refreshed" };

  const preset = options.preset ? DEBUG_NOTIFICATION_PRESETS[options.preset] : undefined;
  const level = options.level ?? preset?.level ?? "info";
  const message = options.message?.trim() || preset?.message || "Queue refreshed.";
  const scope = options.scope?.trim() || preset?.scope || "debug";
  const dedupeKey = options.dedupeKey ?? preset?.dedupeKey;
  const retryAfterMs = options.retryAfterMs ?? preset?.retryAfterMs;

  return {
    id: `debug-notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    scope,
    dedupeKey,
    retryAfterMs,
  };
}

function getNotificationPresetOptions(value: string) {
  return DEBUG_NOTIFICATION_PRESETS[value as DebugNotificationPreset];
}
