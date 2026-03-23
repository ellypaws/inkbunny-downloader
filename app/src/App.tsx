import { Bug, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { AccountSidebar } from "./components/AccountSidebar";
import BubbleMenu, { type BubbleMenuItem } from "./components/BubbleMenu";
import { ContextMenu, type ContextMenuSection } from "./components/ContextMenu";
import { DownloadQueuePanel } from "./components/DownloadQueuePanel";
import { LoginModal } from "./components/LoginModal";
import { NavigationPill } from "./components/NavigationPill";
import {
  OnboardingTour,
  type TourStepPresentation,
} from "./components/OnboardingTour";
import { ResultsShowcase } from "./components/ResultsShowcase";
import { SearchWorkspace } from "./components/SearchWorkspace";
import { StarBackground } from "./components/StarBackground";
import { ToastHost, type ToastItem } from "./components/ToastHost";
import {
  DEFAULT_SEARCH,
  DEFAULT_ORDER_BY,
  EMPTY_QUEUE,
  EMPTY_SESSION,
  FAVORITES_DEFAULT_ORDER_BY,
  MAX_CONCURRENT_DOWNLOADS,
  MIN_CONCURRENT_DOWNLOADS,
  normalizeOrderByValue,
  UNREAD_DEFAULT_ORDER_BY,
} from "./lib/constants";
import {
  registerDebugControls,
  type DebugPanelName,
  type DebugResetTarget,
} from "./lib/debugControls";
import {
  denormalizeSubmissionCard,
  denormalizeSubmissionCards,
  getSubmissionArtistStoreStats,
  normalizeSubmissionCard,
  normalizeSubmissionCards,
} from "./lib/submissionMemory";
import type {
  AppNotification,
  AppSettings,
  ArtistValidationState,
  BackendDebugEvent,
  BuildInfo,
  DebugResetResult,
  DownloadJobUpdateEvent,
  KeywordSuggestion,
  QueueSnapshot,
  QueueStateUpdate,
  ReleaseStatus,
  RemoteAccessInfo,
  SavedSearchTab,
  SearchParams,
  SearchResultsHydratedUpdate,
  SessionInfo,
  SessionStateUpdate,
  SettingsStateUpdate,
  SharedSnapshot,
  SearchTabMode,
  SubmissionCard,
  UsernameSuggestion,
  WorkspaceState,
  WorkspaceStateUpdate,
} from "./lib/types";
import { backend, subscribeBackendEvent } from "./lib/wails";
import { GLOBAL_STYLES } from "./styles/globalStyles";

const GUEST_DEFAULT_MAX_DOWNLOADS = 256;
const RELEASE_UPDATE_TOAST_ID = "release-update-toast";
const TOUR_STEP_DELAY_MS = 420;
const UNREAD_POLL_INTERVAL_MS = 60_000;
const AUTO_QUEUE_INTERVAL_MS = 60_000;
const AUTO_QUEUE_TICK_MS = 1_000;
const LOCAL_WORKSPACE_INPUT_PROTECTION_MS = 2_500;
const MAX_RETAINED_COMPLETED_QUEUE_JOBS = 200;
const MAX_RETAINED_CANCELLED_QUEUE_JOBS = 50;
const MAX_RETAINED_COMPLETED_QUEUE_PREVIEWS = 12;

type SearchTabLoadMoreMode = "idle" | "more" | "all";
type AutoQueuePhase = "idle" | "searching" | "queueing";
type SearchTabSearchPhase = "idle" | "searching" | "processing";
type SearchTabSearchActivity = "idle" | "search" | "refresh";

type SearchTabLoadMoreState = {
  mode: SearchTabLoadMoreMode;
  pagesLoaded: number;
};

type SearchTabState = SavedSearchTab & {
  searchLoading: boolean;
  searchPhase: SearchTabSearchPhase;
  searchActivity: SearchTabSearchActivity;
  searchError: string;
  resultsRefreshToken: number;
  loadMoreState: SearchTabLoadMoreState;
  autoQueuePhase: AutoQueuePhase;
};

type TourStepId =
  | "tabs-toggle"
  | "tabs-menu"
  | "search-words"
  | "artist-name"
  | "run-search"
  | "select-images"
  | "queue-images"
  | "queue-panel";

type ShellContextMenuState = {
  x: number;
  y: number;
  confirmReset: boolean;
} | null;

export default function App() {
  const initialTabRef = useRef<SearchTabState | null>(null);
  if (!initialTabRef.current) {
    initialTabRef.current = createSearchTab(
      EMPTY_SESSION,
      EMPTY_SESSION.settings,
    );
  }

  const [session, setSession] = useState<SessionInfo>(EMPTY_SESSION);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);
  const [remoteAccessInfo, setRemoteAccessInfo] =
    useState<RemoteAccessInfo | null>(null);
  const [remoteAccessLoading, setRemoteAccessLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SESSION.settings);
  const [loginOpen, setLoginOpen] = useState(true);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginTeachMe, setLoginTeachMe] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [shellContextMenu, setShellContextMenu] =
    useState<ShellContextMenuState>(null);
  const [tabs, setTabs] = useState<SearchTabState[]>(() => [
    initialTabRef.current!,
  ]);
  const [activeTabId, setActiveTabId] = useState(
    () => initialTabRef.current!.id,
  );
  const [ratingUpdating, setRatingUpdating] = useState(false);
  const [keywordSuggestions, setKeywordSuggestions] = useState<
    KeywordSuggestion[]
  >([]);
  const [artistSuggestions, setArtistSuggestions] = useState<
    UsernameSuggestion[]
  >([]);
  const [favoriteSuggestions, setFavoriteSuggestions] = useState<
    UsernameSuggestion[]
  >([]);
  const [watchingUsers, setWatchingUsers] = useState<
    UsernameSuggestion[] | null
  >(null);
  const [watchingLoading, setWatchingLoading] = useState(false);
  const [queue, setQueue] = useState<QueueSnapshot>(EMPTY_QUEUE);
  const [pendingDownloadSubmissionIds, setPendingDownloadSubmissionIds] =
    useState<string[]>([]);
  const [panelPreviewImages, setPanelPreviewImages] = useState<string[][]>([]);
  const [recentDownloadedImages, setRecentDownloadedImages] = useState<
    string[][]
  >([]);
  const [queueMessage, setQueueMessage] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [apiCooldownUntil, setApiCooldownUntil] = useState(0);
  const [autoQueueClock, setAutoQueueClock] = useState(() => Date.now());
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStepId, setTourStepId] = useState<TourStepId>("tabs-toggle");
  const [tourSearchAttempted, setTourSearchAttempted] = useState(false);
  const [tourAdvancing, setTourAdvancing] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [trackedUnreadBaseline, setTrackedUnreadBaseline] = useState(-1);

  const resultsRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToResultsRef = useRef(false);
  const ratingDebounceRef = useRef<number | null>(null);
  const autoClearTimeoutsRef = useRef<Map<string, number>>(new Map());
  const autoClearPendingSubmissionIdsRef = useRef<Set<string>>(new Set());
  const autoClearRunningRef = useRef(false);
  const pendingRatingsMaskRef = useRef("");
  const toastTimeoutsRef = useRef<Map<string, number>>(new Map());
  const toastsRef = useRef<ToastItem[]>([]);
  const keywordRequestRef = useRef(0);
  const artistRequestRef = useRef(0);
  const favoritesRequestRef = useRef(0);
  const tabsRef = useRef<SearchTabState[]>(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const queueRef = useRef(queue);
  const pendingDownloadSubmissionIdsRef = useRef(pendingDownloadSubmissionIds);
  const sessionRef = useRef(session);
  const settingsRef = useRef(settings);
  const buildInfoRef = useRef<BuildInfo | null>(buildInfo);
  const unreadTotalRef = useRef(unreadTotal);
  const workspaceLoadedRef = useRef(false);
  const workspacePersistTimeoutRef = useRef<number | null>(null);
  const suppressNextWorkspacePersistRef = useRef(false);
  const lastWorkspacePersistSkipKeyRef = useRef("");
  const pendingWorkspaceEchoesRef = useRef<string[]>([]);
  const deferredWorkspaceUpdateRef = useRef<WorkspaceStateUpdate | null>(null);
  const autoQueueRunningRef = useRef(false);
  const tourAdvanceTimeoutRef = useRef<number | null>(null);
  const scheduledTourAdvanceRef = useRef("");
  const loadMoreControllersRef = useRef(
    new Map<string, { runId: number; stopRequested: boolean }>(),
  );
  const searchRequestControllersRef = useRef(
    new Map<string, { runId: number; stopRequested: boolean }>(),
  );
  const pendingHydratedResultsRef = useRef(
    new Map<string, Map<string, SubmissionCard>>(),
  );
  const recentWorkspaceInputEditsRef = useRef<Map<string, number>>(new Map());
  const sessionRevisionRef = useRef(0);
  const settingsRevisionRef = useRef(0);
  const workspaceRevisionRef = useRef(0);
  const queueRevisionRef = useRef(0);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  );
  const completedQueueSubmissionIds = useMemo(
    () => getCompletedQueueSubmissionIds(queue),
    [queue],
  );
  const downloadedSubmissionIds = useMemo(
    () => getDownloadedSubmissionIds(tabs, completedQueueSubmissionIds),
    [completedQueueSubmissionIds, tabs],
  );
  const downloadedSubmissionIdsRef = useRef(downloadedSubmissionIds);
  const unavailableSubmissionIds = useMemo(
    () =>
      getUnavailableSubmissionIds(
        queue,
        pendingDownloadSubmissionIds,
        downloadedSubmissionIds,
      ),
    [downloadedSubmissionIds, pendingDownloadSubmissionIds, queue],
  );
  const unavailableSubmissionIdsRef = useRef(unavailableSubmissionIds);
  const activeSearchParams =
    activeTab?.searchParams ?? buildDefaultSearch(session, settings);
  const activeArtistDraft = activeTab?.artistDraft ?? "";
  const activeSearchResponse = activeTab?.searchResponse ?? null;
  const activeResults = activeTab?.results ?? [];
  const activeSubmissionId = activeTab?.activeSubmissionId ?? "";
  const activeSelectedSubmissionIds = activeTab?.selectedSubmissionIds ?? [];
  const activeSearchLoading = activeTab?.searchLoading ?? false;
  const activeSearchPhase = activeTab?.searchPhase ?? "idle";
  const activeSearchActivity = activeTab?.searchActivity ?? "idle";
  const activeSearchCollapsed = activeTab?.searchCollapsed ?? false;
  const activeSearchError = activeTab?.searchError ?? "";
  const activeResultsRefreshToken = activeTab?.resultsRefreshToken ?? 0;
  const activeLoadMoreState =
    activeTab?.loadMoreState ?? createIdleLoadMoreState();
  const activeSearchBusy =
    activeSearchLoading ||
    activeLoadMoreState.mode !== "idle" ||
    activeTab?.autoQueuePhase === "searching";
  const activeTabQueueing = activeTab?.autoQueuePhase === "queueing";
  const activeTabDownloading = activeTab
    ? hasTrackedQueueActivity(activeTab, queue, pendingDownloadSubmissionIds)
    : false;
  const activeAutoQueueArmed =
    Boolean(activeTab?.autoQueueEnabled) &&
    (activeTab?.autoQueueNextRunAt ?? 0) > 0;
  const hasAutoQueueCountdown = useMemo(
    () =>
      tabs.some((tab) => tab.autoQueueEnabled && tab.autoQueueNextRunAt > 0),
    [tabs],
  );
  const activeSearchButtonMode = activeSearchBusy
    ? "searching"
    : activeTabDownloading || activeTabQueueing
      ? "downloading"
      : activeAutoQueueArmed
        ? "waiting"
        : "default";
  const activeSearchButtonLabel =
    activeSearchButtonMode === "searching"
      ? "Stop Search"
      : activeSearchButtonMode === "downloading"
        ? "Downloading"
        : activeSearchButtonMode === "waiting"
          ? formatAutoQueueCountdown(
              activeTab?.autoQueueNextRunAt ?? 0,
              autoQueueClock,
            )
          : "Search";
  const activeSearchButtonDisabled = activeSearchButtonMode === "downloading";
  const activeDownloadButtonMode = "default";
  const activeDownloadButtonLabel = "Download";
  const activeDownloadButtonDisabled =
    !activeSearchResponse || activeSelectedSubmissionIds.length === 0;
  const unreadModeActive = activeTab?.mode === "unread";
  const folderPreviewImages = useMemo(
    () =>
      dedupePreviewImageSets(
        panelPreviewImages.length > 0
          ? panelPreviewImages
          : recentDownloadedImages,
      ),
    [panelPreviewImages, recentDownloadedImages],
  );
  const newUnreadCount =
    trackedUnreadBaseline < 0
      ? 0
      : Math.max(unreadTotal - trackedUnreadBaseline, 0);
  const hasActiveResult = activeResults.length > 0;
  const hasSelectableActiveResult = activeResults.some(
    (item) => !downloadedSubmissionIds.has(item.submissionId),
  );
  const queueReadyForTour =
    pendingDownloadSubmissionIds.length > 0 || queue.jobs.length > 0;
  const canStopAllDownloads = queue.jobs.some(
    (job) => job.status === "queued" || job.status === "active",
  );
  const canPauseAllDownloads = canStopAllDownloads && !queue.paused;
  const canResumeAllDownloads =
    queue.paused && (queue.queuedCount > 0 || queue.activeCount > 0);
  const canRetryAllDownloads = queue.failedCount > 0;
  const currentTourStep = getTourStepPresentation(tourStepId, {
    tabMenuOpen,
    hasActiveResult,
    hasSelectableActiveResult,
    searchAttempted: tourSearchAttempted,
    selectedCount: activeSelectedSubmissionIds.length,
    queueReady: queueReadyForTour,
  });
  const tourAnchorRefreshKey = [
    tourOpen ? "open" : "closed",
    tourStepId,
    tabMenuOpen ? "tabs-open" : "tabs-closed",
    activeSearchCollapsed ? "search-collapsed" : "search-open",
    activeResults.length,
    activeSelectedSubmissionIds.length,
    queue.jobs.length,
    pendingDownloadSubmissionIds.length,
  ].join(":");
  const allResultsSelected =
    activeResults.some(
      (item) => !downloadedSubmissionIds.has(item.submissionId),
    ) &&
    activeResults
      .filter((item) => !downloadedSubmissionIds.has(item.submissionId))
      .every((item) => activeSelectedSubmissionIds.includes(item.submissionId));
  const sessionMenuItems = useMemo<BubbleMenuItem[]>(
    () =>
      tabs.map((tab, index) => ({
        id: tab.id,
        label: getSearchTabLabel(tab, index),
        subtitle: getSearchTabSubtitle(
          tab,
          queue,
          pendingDownloadSubmissionIds,
          autoQueueClock,
        ),
        active: tab.id === activeTabId,
        showEye: tab.autoQueueEnabled,
        showLoading:
          tab.searchLoading ||
          tab.autoQueuePhase !== "idle" ||
          hasTrackedQueueActivity(tab, queue, pendingDownloadSubmissionIds),
        ariaLabel: `Switch to ${getSearchTabLabel(tab, index)}`,
        hoverStyles:
          tab.mode === "unread"
            ? {
                bgColor: "#f5efb0",
                textColor: "#21400f",
              }
            : undefined,
        activeStyles:
          tab.mode === "unread"
            ? {
                bgColor: "#f5efb0",
                textColor: "#21400f",
              }
            : undefined,
      })),
    [activeTabId, autoQueueClock, pendingDownloadSubmissionIds, queue, tabs],
  );
  const recentCompletedPreviewImages = useMemo(
    () => getRecentCompletedPreviewImages(queue, tabs),
    [queue, tabs],
  );
  const recentCompletedPreviewImagesKey = useMemo(
    () => getPreviewImageSetsKey(recentCompletedPreviewImages),
    [recentCompletedPreviewImages],
  );
  const recentCompletedPreviewImagesRef = useRef(recentCompletedPreviewImages);
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  queueRef.current = queue;
  pendingDownloadSubmissionIdsRef.current = pendingDownloadSubmissionIds;
  sessionRef.current = session;
  settingsRef.current = settings;
  buildInfoRef.current = buildInfo;
  unreadTotalRef.current = unreadTotal;
  downloadedSubmissionIdsRef.current = downloadedSubmissionIds;
  unavailableSubmissionIdsRef.current = unavailableSubmissionIds;
  toastsRef.current = toasts;
  recentCompletedPreviewImagesRef.current = recentCompletedPreviewImages;
  pendingRatingsMaskRef.current = session.ratingsMask;
  const canOpenWebviewDebugConsole =
    typeof (
      window as Window & {
        runtime?: Window["runtime"] & {
          OpenDevToolsWindow?: () => void;
        };
      }
    ).runtime?.OpenDevToolsWindow === "function";
  const shellContextSections: ContextMenuSection[] = [
    {
      id: "refresh",
      label: "App",
      items: [
        {
          id: "refresh-page",
          label: "Refresh page",
          leftSection: <RefreshCw size={14} />,
          onClick: handleShellRefresh,
        },
        {
          id: "clear-cache",
          label: "Clear cache",
          leftSection: <RotateCcw size={14} />,
          onClick: handleShellClearCache,
        },
        {
          id: "reset-data",
          label: shellContextMenu?.confirmReset ? "Reset confirmation" : "Reset data",
          leftSection: shellContextMenu?.confirmReset ? undefined : <Trash2 size={14} />,
          closeOnClick: shellContextMenu?.confirmReset ? false : false,
          customContent: shellContextMenu?.confirmReset ? (
            <div className="flex items-center justify-center gap-12 px-3 py-2 text-sm font-bold">
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShellContextMenu(null);
                  handleShellResetData();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  setShellContextMenu(null);
                  handleShellResetData();
                }}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--theme-danger)_12%,transparent)] px-3 py-1.5 text-[var(--theme-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--theme-danger)_18%,transparent)]"
              >
                <Trash2 size={14} />
                Reset
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setShellContextMenu((current) =>
                    current
                      ? {
                          ...current,
                          confirmReset: false,
                        }
                      : current,
                  );
                  pushToast({
                    level: "info",
                    message: "Reset cancelled.",
                    dedupeKey: "shell-reset-data-cancelled",
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  setShellContextMenu((current) =>
                    current
                      ? {
                          ...current,
                          confirmReset: false,
                        }
                      : current,
                  );
                  pushToast({
                    level: "info",
                    message: "Reset cancelled.",
                    dedupeKey: "shell-reset-data-cancelled",
                  });
                }}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-[var(--theme-title)] transition-colors hover:bg-[var(--theme-hover)]"
              >
                Cancel
              </span>
            </div>
          ) : undefined,
          onClick: () => {
            setShellContextMenu((current) =>
              current
                ? {
                    ...current,
                    confirmReset: true,
                  }
                : current,
            );
            pushToast({
              level: "warning",
              message: "Choose Reset again to confirm, or Cancel. This will log you out and clear all local data.",
              dedupeKey: "shell-reset-data-confirm",
            });
          },
        },
        {
          id: "open-debug-console",
          label: "Debug",
          leftSection: <Bug size={14} />,
          disabled: !canOpenWebviewDebugConsole,
          onClick: handleShellOpenDebug,
        },
      ],
    },
  ];

  function applySession(
    nextSession: SessionInfo,
    nextSettings = nextSession.settings,
  ) {
    sessionRef.current = nextSession;
    settingsRef.current = nextSettings;
    setSession(nextSession);
    setSettings(nextSettings);
    setTabs((previous) =>
      previous.map((tab) => ({
        ...tab,
        searchParams: syncSearchParamsWithSession(
          tab.searchParams,
          nextSession,
          nextSettings,
          tab.mode,
        ),
      })),
    );
  }

  function applySessionWithoutTabSync(
    nextSession: SessionInfo,
    nextSettings = nextSession.settings,
  ) {
    sessionRef.current = nextSession;
    settingsRef.current = nextSettings;
    setSession(nextSession);
    setSettings(nextSettings);
  }

  function updateTab(
    tabId: string,
    updater: (tab: SearchTabState) => SearchTabState,
  ) {
    const nextTabs = tabsRef.current.map((tab) =>
      tab.id === tabId ? updater(tab) : tab,
    );
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
  }

  function markWorkspaceInputEdit(tabId: string) {
    if (!tabId) {
      return;
    }
    recentWorkspaceInputEditsRef.current.set(tabId, Date.now());
  }

  function getProtectedWorkspaceInputTabIds(now = Date.now()) {
    const protectedTabIds = new Set<string>();
    const staleTabIds: string[] = [];
    for (const [
      tabId,
      editedAt,
    ] of recentWorkspaceInputEditsRef.current.entries()) {
      if (now - editedAt <= LOCAL_WORKSPACE_INPUT_PROTECTION_MS) {
        protectedTabIds.add(tabId);
        continue;
      }
      staleTabIds.push(tabId);
    }
    for (const tabId of staleTabIds) {
      recentWorkspaceInputEditsRef.current.delete(tabId);
    }
    if (
      activeTabIdRef.current &&
      (workspacePersistTimeoutRef.current !== null ||
        pendingWorkspaceEchoesRef.current.length > 0)
    ) {
      protectedTabIds.add(activeTabIdRef.current);
    }
    return protectedTabIds;
  }

  function applyArtistResolution(
    targetTabId: string,
    artistName: string,
    resolution: { avatarUrl?: string; validation: ArtistValidationState },
  ) {
    const normalizedArtist = normalizeArtistToken(artistName);
    if (!normalizedArtist) {
      return;
    }

    updateTab(targetTabId, (currentTab) => {
      if (
        !currentTab.searchParams.artistNames.some(
          (item) => normalizeArtistToken(item) === normalizedArtist,
        )
      ) {
        return currentTab;
      }

      const currentValidation = currentTab.artistValidation[normalizedArtist];
      const nextValidation =
        currentValidation === "valid" && resolution.validation !== "valid"
          ? currentValidation
          : resolution.validation;
      const nextArtistAvatars =
        resolution.avatarUrl &&
        currentTab.artistAvatars[normalizedArtist] !== resolution.avatarUrl
          ? {
              ...currentTab.artistAvatars,
              [normalizedArtist]: resolution.avatarUrl,
            }
          : currentTab.artistAvatars;
      const nextArtistValidation =
        currentValidation !== nextValidation
          ? {
              ...currentTab.artistValidation,
              [normalizedArtist]: nextValidation,
            }
          : currentTab.artistValidation;

      if (
        nextArtistAvatars === currentTab.artistAvatars &&
        nextArtistValidation === currentTab.artistValidation
      ) {
        return currentTab;
      }

      return {
        ...currentTab,
        artistAvatars: nextArtistAvatars,
        artistValidation: nextArtistValidation,
      };
    });
  }

  function resolveArtistIdentity(
    targetTabId: string,
    artistName: string,
    seedSuggestions: UsernameSuggestion[] = [],
  ) {
    const normalizedArtist = normalizeArtistToken(artistName);
    if (!normalizedArtist) {
      return;
    }

    const seededMatch = findExactUsernameSuggestion(
      artistName,
      seedSuggestions,
    );
    if (seededMatch) {
      applyArtistResolution(targetTabId, artistName, {
        avatarUrl: seededMatch.avatarUrl || "",
        validation: "valid",
      });
      return;
    }

    void backend
      .getUsernameSuggestions(artistName)
      .then((suggestions) => {
        const exactMatch = findExactUsernameSuggestion(artistName, suggestions);
        applyArtistResolution(targetTabId, artistName, {
          avatarUrl: exactMatch?.avatarUrl || "",
          validation: exactMatch ? "valid" : "invalid",
        });
      })
      .catch(() => undefined);
  }

  function startLoadMoreRun(tabId: string) {
    const current = loadMoreControllersRef.current.get(tabId);
    const runId = (current?.runId ?? 0) + 1;
    loadMoreControllersRef.current.set(tabId, {
      runId,
      stopRequested: false,
    });
    return runId;
  }

  function isLoadMoreRunActive(tabId: string, runId: number) {
    return loadMoreControllersRef.current.get(tabId)?.runId === runId;
  }

  function isLoadMoreStopRequested(tabId: string, runId: number) {
    const controller = loadMoreControllersRef.current.get(tabId);
    return (
      !controller || controller.runId !== runId || controller.stopRequested
    );
  }

  function stopLoadMore(tabId: string) {
    const controller = loadMoreControllersRef.current.get(tabId);
    if (!controller) {
      return;
    }
    controller.stopRequested = true;
  }

  function cancelLoadMore(tabId: string) {
    const current = loadMoreControllersRef.current.get(tabId);
    loadMoreControllersRef.current.set(tabId, {
      runId: (current?.runId ?? 0) + 1,
      stopRequested: true,
    });
    updateTab(tabId, (tab) =>
      tab.loadMoreState.mode === "idle"
        ? tab
        : {
            ...tab,
            loadMoreState: createIdleLoadMoreState(),
          },
    );
  }

  function startSearchRequestRun(tabId: string) {
    const current = searchRequestControllersRef.current.get(tabId);
    const runId = (current?.runId ?? 0) + 1;
    searchRequestControllersRef.current.set(tabId, {
      runId,
      stopRequested: false,
    });
    return runId;
  }

  function isSearchRequestRunActive(tabId: string, runId: number) {
    return searchRequestControllersRef.current.get(tabId)?.runId === runId;
  }

  function isSearchRequestStopRequested(tabId: string, runId: number) {
    const controller = searchRequestControllersRef.current.get(tabId);
    return (
      !controller || controller.runId !== runId || controller.stopRequested
    );
  }

  function stopSearchRequest(tabId: string) {
    const controller = searchRequestControllersRef.current.get(tabId);
    if (!controller) {
      return;
    }
    controller.stopRequested = true;
  }

  async function stopActiveSearch(targetTabId = activeTabIdRef.current) {
    stopSearchRequest(targetTabId);
    stopLoadMore(targetTabId);
    cancelLoadMore(targetTabId);
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      searchLoading: false,
      searchPhase: "idle",
      searchActivity: "idle",
      autoQueuePhase: "idle",
    }));
    if (!targetTabId) {
      return;
    }
    try {
      await backend.cancelSearchRequests(targetTabId);
    } catch {
      // Ignore stop failures and let the local stop guard prevent stale updates.
    }
  }

  function dismissToast(id: string) {
    const timeoutId = toastTimeoutsRef.current.get(id);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(id);
    }
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }

  function pushToast(toast: Omit<ToastItem, "id"> & { id?: string }) {
    const existing = toast.dedupeKey
      ? toastsRef.current.find((item) => item.dedupeKey === toast.dedupeKey)
      : undefined;
    const id =
      existing?.id ??
      toast.id ??
      `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((previous) => {
      if (existing) {
        return previous.map((item) =>
          item.id === existing.id
            ? { ...item, ...toast, id: existing.id }
            : item,
        );
      }
      return [...previous, { ...toast, id }];
    });
    const currentTimeout = toastTimeoutsRef.current.get(id);
    if (currentTimeout !== undefined) {
      window.clearTimeout(currentTimeout);
      toastTimeoutsRef.current.delete(id);
    }
    if (toast.sticky) {
      return;
    }
    toastTimeoutsRef.current.set(
      id,
      window.setTimeout(
        () => dismissToast(id),
        getToastDuration(toast.level, toast.retryAfterMs),
      ),
    );
  }

  function pushErrorToast(message: string, dedupeKey?: string) {
    if (!isRateLimitMessage(message)) {
      pushToast({ level: "error", message, dedupeKey });
    }
  }

  function updateQueueMessage(
    message: string,
    level?: ToastItem["level"],
    dedupeKey?: string,
  ) {
    setQueueMessage(message);
    if (level) {
      pushToast({ level, message, dedupeKey });
    }
  }

  function clearAllToasts() {
    for (const timeoutId of toastTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    toastTimeoutsRef.current.clear();
    toastsRef.current = [];
    setToasts([]);
  }

  function handleAppNotification(event: AppNotification) {
    if (event.retryAfterMs && event.retryAfterMs > 0) {
      setApiCooldownUntil(Date.now() + event.retryAfterMs);
    }
    pushToast({
      id: event.id,
      level: event.level,
      message: event.message,
      dedupeKey: event.dedupeKey,
      retryAfterMs: event.retryAfterMs,
    });
  }

  function openDebugPanel(panel: DebugPanelName) {
    if (panel === "login") {
      setTabMenuOpen(false);
      setLoginOpen(true);
      return;
    }
    if (panel === "tabs") {
      setLoginOpen(false);
      setTabMenuOpen(true);
      return;
    }
    if (panel === "unread") {
      setLoginOpen(false);
      setTabMenuOpen(false);
      void handleOpenUnreadTab();
      return;
    }

    setLoginOpen(false);
    setTabMenuOpen(false);
    window.setTimeout(() => {
      document
        .querySelector('[data-tour-anchor="queue-panel"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function syncSettings(nextSettings: AppSettings) {
    applySession(
      {
        ...sessionRef.current,
        settings: nextSettings,
        effectiveTheme: nextSettings.darkMode ? "dark" : "light",
      },
      nextSettings,
    );
  }

  function applyQueueSnapshot(snapshot: QueueSnapshot | null | undefined) {
    setQueue((current) =>
      compactQueueSnapshot(normalizeQueueSnapshot(snapshot), current),
    );
  }

  function writeFrontendSearchLog(
    message: string,
    fields?: Record<string, unknown>,
  ) {
    if (!isFrontendSearchLoggingEnabled()) {
      return;
    }
    console.info(`[frontend][search] ${message}`, fields ?? "");
  }

  function applyWorkspaceSnapshot(
    workspace: WorkspaceState,
    nextSession = sessionRef.current,
    nextSettings = settingsRef.current,
  ) {
    const restoredTabs = restoreWorkspaceTabs(
      workspace,
      nextSession,
      nextSettings,
    );
    const protectedTabIds = getProtectedWorkspaceInputTabIds();
    const mergedTabs = mergeWorkspaceTabsWithTransientState(
      restoredTabs,
      tabsRef.current,
      protectedTabIds,
    );
    const nextActiveTabId = resolveActiveWorkspaceTabId(
      workspace,
      mergedTabs,
      activeTabIdRef.current,
      protectedTabIds,
    );
    const hydratedTabs = flushPendingHydratedResultsIntoTabs(mergedTabs);
    pendingWorkspaceEchoesRef.current = [];
    tabsRef.current = hydratedTabs;
    activeTabIdRef.current = nextActiveTabId;
    setTabs(hydratedTabs);
    setActiveTabId(nextActiveTabId);
  }

  async function clearDeferredDebugState() {
    const toastCount = toastsRef.current.length;
    const pendingDownloadCount = pendingDownloadSubmissionIdsRef.current.length;
    const autoClearTimerCount = autoClearTimeoutsRef.current.size;

    clearAllToasts();
    clearScheduledTourAdvance();

    if (workspacePersistTimeoutRef.current !== null) {
      window.clearTimeout(workspacePersistTimeoutRef.current);
      workspacePersistTimeoutRef.current = null;
    }
    if (ratingDebounceRef.current !== null) {
      window.clearTimeout(ratingDebounceRef.current);
      ratingDebounceRef.current = null;
    }
    for (const timeoutId of autoClearTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    autoClearTimeoutsRef.current.clear();
    autoClearPendingSubmissionIdsRef.current.clear();
    autoClearRunningRef.current = false;
    autoQueueRunningRef.current = false;
    shouldScrollToResultsRef.current = false;
    pendingRatingsMaskRef.current = sessionRef.current.ratingsMask;
    keywordRequestRef.current += 1;
    artistRequestRef.current += 1;
    favoritesRequestRef.current += 1;
    loadMoreControllersRef.current = new Map();
    searchRequestControllersRef.current = new Map();
    pendingWorkspaceEchoesRef.current = [];
    deferredWorkspaceUpdateRef.current = null;
    pendingHydratedResultsRef.current = new Map();

    setAuthLoading(false);
    setAuthError("");
    setWatchingLoading(false);
    setWatchingUsers(null);
    setKeywordSuggestions([]);
    setArtistSuggestions([]);
    setFavoriteSuggestions([]);
    setPendingDownloadSubmissionIds([]);
    setPanelPreviewImages([]);
    setRecentDownloadedImages([]);
    setQueueMessage("");
    setApiCooldownUntil(0);
    setTourOpen(false);
    setTourStepId("tabs-toggle");
    setTourSearchAttempted(false);
    setTourAdvancing(false);
    setTabs((previous) =>
      previous.map((tab) => ({
        ...tab,
        searchLoading: false,
        searchPhase: "idle",
        searchActivity: "idle",
        searchError: "",
        loadMoreState: createIdleLoadMoreState(),
        autoQueuePhase: "idle",
        autoQueueNextRunAt: 0,
        trackedDownloadSubmissionIds: [],
      })),
    );

    await backend.cancelSearchRequests("").catch(() => undefined);

    return `Cleared deferred state (${toastCount} toasts, ${autoClearTimerCount} timers, ${pendingDownloadCount} pending downloads).`;
  }

  function formatDebugResetMessage(
    scope: DebugResetTarget,
    result?: DebugResetResult,
  ) {
    switch (scope) {
      case "cache":
        return "Cleared cache and active search.";
      case "state":
        return "Reset persisted settings and workspace state.";
      case "settings":
        return "Reset persisted settings to defaults.";
      case "workspace":
        return "Reset saved workspace tabs and search sessions.";
      case "login":
        return "Cleared the local login session.";
      case "queue":
        return result
          ? `Reset the download queue (${result.queue.jobs.length} jobs remaining).`
          : "Reset the download queue.";
      case "deferred":
        return "Cleared deferred frontend state.";
      case "all":
      default:
        return "Reset caches, persisted state, login, queue, and deferred frontend state.";
    }
  }

  async function runDebugStateReset(scope: DebugResetTarget) {
    const deferredMessage = await clearDeferredDebugState();
    if (scope === "deferred") {
      console.info("Inkbunny debug reset:", {
        scope,
        deferred: deferredMessage,
      });
      return deferredMessage;
    }

    const result = await backend.debugResetState(scope);
    result.queue = normalizeQueueSnapshot(result.queue);
    applySession(result.session, result.settings);

    if (scope === "state" || scope === "workspace" || scope === "all") {
      applyWorkspaceSnapshot(result.workspace, result.session, result.settings);
    }

    if (scope === "queue" || scope === "all") {
      applyQueueSnapshot(result.queue);
    }

    if (scope === "login" || scope === "state" || scope === "all") {
      setLoginUsername("");
      setLoginPassword("");
      setLoginTeachMe(!result.settings.hasLoggedInBefore);
    }
    if (scope === "login" || scope === "all") {
      setLoginOpen(true);
      setUnreadTotal(0);
      setTrackedUnreadBaseline(-1);
    }

    const message = formatDebugResetMessage(scope, result);
    console.info("Inkbunny debug reset:", {
      scope,
      deferred: deferredMessage,
      backend: result,
    });
    return message;
  }

  async function fetchAppSnapshotFromBackend() {
    const [
      nextBuildInfo,
      nextSession,
      workspace,
      snapshot,
      nextRemoteAccessInfo,
    ] = await Promise.all([
      backend.getBuildInfo(),
      backend.getSession(),
      backend.getWorkspaceState(),
      backend.getQueueSnapshot(),
      backend.getRemoteAccessInfo(),
    ]);

    return {
      buildInfo: nextBuildInfo,
      remoteAccessInfo: nextRemoteAccessInfo,
      session: nextSession,
      workspace,
      queue: normalizeQueueSnapshot(snapshot),
    };
  }

  function applyBackendSnapshot(
    snapshot: Awaited<ReturnType<typeof fetchAppSnapshotFromBackend>>,
  ) {
    setBuildInfo(snapshot.buildInfo);
    setRemoteAccessInfo(snapshot.remoteAccessInfo);
    applySession(snapshot.session);
    applyWorkspaceSnapshot(
      snapshot.workspace,
      snapshot.session,
      snapshot.session.settings,
    );
    applyQueueSnapshot(snapshot.queue);
    setLoginOpen(!snapshot.session.hasSession);
    setAuthError("");
    workspaceLoadedRef.current = true;

    if (!snapshot.session.hasSession) {
      setUnreadTotal(0);
      setTrackedUnreadBaseline(-1);
    }

    void backend
      .getReleaseStatus()
      .then((status) => {
        showReleaseUpdateToast(status, snapshot.session.settings);
      })
      .catch(() => undefined);
  }

  function applySharedSnapshot(snapshot: SharedSnapshot) {
    sessionRevisionRef.current = snapshot.sessionRevision;
    settingsRevisionRef.current = snapshot.settingsRevision;
    workspaceRevisionRef.current = snapshot.workspaceRevision;
    queueRevisionRef.current = snapshot.queueRevision;
    setBuildInfo(snapshot.buildInfo);
    applySession(snapshot.session, snapshot.settings);
    if (
      !areWorkspaceStatesEqual(
        buildWorkspaceState(tabsRef.current, activeTabIdRef.current),
        snapshot.workspace,
      )
    ) {
      suppressNextWorkspacePersistRef.current = true;
      applyWorkspaceSnapshot(
        snapshot.workspace,
        snapshot.session,
        snapshot.settings,
      );
    }
    applyQueueSnapshot(snapshot.queue);
    workspaceLoadedRef.current = true;
  }

  function handleSessionStateUpdate(update: SessionStateUpdate) {
    if (update.revision <= sessionRevisionRef.current) {
      return;
    }
    sessionRevisionRef.current = update.revision;
    applySession(update.session);
    if (!update.session.hasSession) {
      setLoginOpen(true);
      setUnreadTotal(0);
      setTrackedUnreadBaseline(-1);
    }
  }

  function handleSettingsStateUpdate(update: SettingsStateUpdate) {
    if (update.revision <= settingsRevisionRef.current) {
      return;
    }
    settingsRevisionRef.current = update.revision;
    syncSettings(update.settings);
  }

  function handleSearchResultsHydrated(update: SearchResultsHydratedUpdate) {
    if (!update.searchId || update.results.length === 0) {
      return;
    }
    const normalizedResults = normalizeSubmissionCards(update.results);
    const normalizedUpdate =
      normalizedResults === update.results
        ? update
        : { ...update, results: normalizedResults };
    if (!areHydratedResultsMounted(normalizedUpdate)) {
      rememberPendingHydratedResults(normalizedUpdate);
    }
    startTransition(() => {
      setTabs((previous) =>
        mergeHydratedSearchResults(previous, normalizedUpdate),
      );
    });
  }

  function rememberPendingHydratedResults(update: SearchResultsHydratedUpdate) {
    const existing =
      pendingHydratedResultsRef.current.get(update.searchId) ?? new Map();
    for (const result of update.results) {
      existing.set(result.submissionId, result);
    }
    pendingHydratedResultsRef.current.set(update.searchId, existing);
  }

  function applyPendingHydratedResults(
    searchId: string,
    results: SubmissionCard[],
  ) {
    const normalizedResults = normalizeSubmissionCards(results);
    const merged = mergePendingHydratedResults(searchId, normalizedResults);
    if (merged.matchedSubmissionIds.length === 0) {
      return normalizedResults;
    }
    clearPendingHydratedResults(searchId, merged.matchedSubmissionIds);
    return merged.results;
  }

  function mergePendingHydratedResults(
    searchId: string,
    results: SubmissionCard[],
  ) {
    const pending = pendingHydratedResultsRef.current.get(searchId);
    if (!pending || pending.size === 0 || results.length === 0) {
      return {
        results,
        matchedSubmissionIds: [] as string[],
      };
    }

    let changed = false;
    const matchedSubmissionIds: string[] = [];
    const nextResults = results.map((result) => {
      const hydrated = pending.get(result.submissionId);
      if (!hydrated) {
        return result;
      }
      matchedSubmissionIds.push(result.submissionId);
      if (areSubmissionCardsEqual(result, hydrated)) {
        return result;
      }
      changed = true;
      return hydrated;
    });

    return {
      results: changed ? nextResults : results,
      matchedSubmissionIds,
    };
  }

  function clearPendingHydratedResults(
    searchId: string,
    submissionIds: string[],
  ) {
    if (!searchId || submissionIds.length === 0) {
      return;
    }
    const pending = pendingHydratedResultsRef.current.get(searchId);
    if (!pending || pending.size === 0) {
      return;
    }
    for (const submissionId of submissionIds) {
      pending.delete(submissionId);
    }
    if (pending.size === 0) {
      pendingHydratedResultsRef.current.delete(searchId);
    }
  }

  function flushPendingHydratedResultsIntoTabs(tabs: SearchTabState[]) {
    if (pendingHydratedResultsRef.current.size === 0) {
      return tabs;
    }

    let changed = false;
    const matchedBySearchId = new Map<string, Set<string>>();
    const nextTabs = tabs.map((tab) => {
      const searchId = tab.searchResponse?.searchId ?? "";
      if (!searchId) {
        return tab;
      }

      const mergedTabResults = mergePendingHydratedResults(
        searchId,
        tab.results,
      );
      const mergedSearchResponseResults = mergePendingHydratedResults(
        searchId,
        tab.searchResponse?.results ?? [],
      );

      if (mergedTabResults.matchedSubmissionIds.length > 0) {
        const matched = matchedBySearchId.get(searchId) ?? new Set<string>();
        for (const submissionId of mergedTabResults.matchedSubmissionIds) {
          matched.add(submissionId);
        }
        matchedBySearchId.set(searchId, matched);
      }
      if (mergedSearchResponseResults.matchedSubmissionIds.length > 0) {
        const matched = matchedBySearchId.get(searchId) ?? new Set<string>();
        for (const submissionId of mergedSearchResponseResults.matchedSubmissionIds) {
          matched.add(submissionId);
        }
        matchedBySearchId.set(searchId, matched);
      }

      if (
        mergedTabResults.results === tab.results &&
        mergedSearchResponseResults.results === tab.searchResponse?.results
      ) {
        return tab;
      }

      changed = true;
      return {
        ...tab,
        results: mergedTabResults.results,
        searchResponse: tab.searchResponse
          ? {
              ...tab.searchResponse,
              results: mergedSearchResponseResults.results,
            }
          : tab.searchResponse,
      };
    });

    for (const [searchId, submissionIds] of matchedBySearchId.entries()) {
      clearPendingHydratedResults(searchId, [...submissionIds]);
    }

    return changed ? nextTabs : tabs;
  }

  function areHydratedResultsMounted(update: SearchResultsHydratedUpdate) {
    const resultIds = new Set(
      update.results.map((result) => result.submissionId),
    );
    if (resultIds.size === 0) {
      return true;
    }

    return tabsRef.current.some((tab) => {
      if (tab.searchResponse?.searchId !== update.searchId) {
        return false;
      }
      const tabResultIds = new Set(
        tab.results.map((result) => result.submissionId),
      );
      for (const submissionId of resultIds) {
        if (!tabResultIds.has(submissionId)) {
          return false;
        }
      }
      return true;
    });
  }

  function handleWorkspaceStateUpdate(update: WorkspaceStateUpdate) {
    if (update.revision <= workspaceRevisionRef.current) {
      writeFrontendSearchLog("ignored workspace update", {
        reason: "stale-revision",
        revision: update.revision,
        currentRevision: workspaceRevisionRef.current,
      });
      return;
    }
    workspaceRevisionRef.current = update.revision;
    if (describeTransientWorkspaceState(tabsRef.current) !== null) {
      deferredWorkspaceUpdateRef.current = update;
      writeFrontendSearchLog("deferred workspace update", {
        reason: "transient-search-state",
        revision: update.revision,
        activeTabId: activeTabIdRef.current,
      });
      return;
    }
    applyIncomingWorkspaceUpdate(update);
  }

  function applyIncomingWorkspaceUpdate(update: WorkspaceStateUpdate) {
    const currentWorkspace = buildWorkspaceState(
      tabsRef.current,
      activeTabIdRef.current,
    );
    if (areWorkspaceStatesEqual(currentWorkspace, update.workspace)) {
      acknowledgePendingWorkspaceEcho(
        pendingWorkspaceEchoesRef,
        update.workspace,
      );
      writeFrontendSearchLog("ignored workspace update", {
        reason: "matches-current",
        revision: update.revision,
      });
      return;
    }
    if (
      acknowledgePendingWorkspaceEcho(
        pendingWorkspaceEchoesRef,
        update.workspace,
      )
    ) {
      writeFrontendSearchLog("ignored workspace update", {
        reason: "matched-pending-echo",
        revision: update.revision,
      });
      return;
    }
    writeFrontendSearchLog("applying workspace update", {
      revision: update.revision,
      activeTabId: activeTabIdRef.current,
      currentTabCount: tabsRef.current.length,
      nextTabCount: update.workspace.tabs.length,
    });
    suppressNextWorkspacePersistRef.current = true;
    applyWorkspaceSnapshot(update.workspace);
  }

  function handleQueueStateUpdate(update: QueueStateUpdate) {
    if (update.revision <= queueRevisionRef.current) {
      return;
    }
    queueRevisionRef.current = update.revision;
    applyQueueSnapshot(update.queue);
  }

  function handleQueueJobUpdated(update: DownloadJobUpdateEvent) {
    const nextJob = update?.job;
    if (!nextJob?.id) {
      return;
    }
    setQueue((current) =>
      applyQueueJobUpdate(current, compactQueueJob(nextJob, true)),
    );
  }

  async function handleEnableRemoteAccess() {
    setRemoteAccessLoading(true);
    try {
      setRemoteAccessInfo(await backend.enableRemoteAccess());
    } finally {
      setRemoteAccessLoading(false);
    }
  }

  async function handleDisableRemoteAccess() {
    setRemoteAccessLoading(true);
    try {
      setRemoteAccessInfo(await backend.disableRemoteAccess());
    } finally {
      setRemoteAccessLoading(false);
    }
  }

  async function handleSelectRemoteAccessHost(host: string) {
    setRemoteAccessLoading(true);
    try {
      setRemoteAccessInfo(await backend.selectRemoteAccessHost(host));
    } finally {
      setRemoteAccessLoading(false);
    }
  }

  function reloadDebugPage() {
    window.location.reload();
    return "Reloading page.";
  }

  function handleShellRefresh() {
    pushToast({
      level: "info",
      message: "Reloading page.",
      dedupeKey: "shell-refresh-page",
    });
    window.setTimeout(() => {
      reloadDebugPage();
    }, 90);
  }

  function handleShellClearCache() {
    pushToast({
      level: "info",
      message: "Clearing cache.",
      dedupeKey: "shell-clear-cache-start",
    });
    void runDebugStateReset("cache")
      .then((message) => {
        pushToast({
          level: "success",
          message,
          dedupeKey: "debug-clear-cache-success",
        });
      })
      .catch((error: unknown) => {
        pushErrorToast(
          getErrorMessage(error, "Could not clear the cache."),
          "debug-clear-cache-error",
        );
      });
  }

  function handleShellResetData() {
    pushToast({
      level: "warning",
      message: "Resetting app data.",
      dedupeKey: "shell-reset-data-start",
    });
    void runDebugStateReset("all")
      .then((message) => {
        pushToast({
          level: "success",
          message,
          dedupeKey: "debug-reset-data-success",
        });
      })
      .catch((error: unknown) => {
        pushErrorToast(
          getErrorMessage(error, "Could not reset the app data."),
          "debug-reset-data-error",
        );
      });
  }

  function handleShellOpenDebug() {
    if (!canOpenWebviewDebugConsole) {
      pushErrorToast(
        "Webview devtools are not exposed by this build.",
        "open-webview-console-error",
      );
      return;
    }
    pushToast({
      level: "info",
      message: "Opening debug tools.",
      dedupeKey: "shell-open-debug",
    });
    openWebviewDebugConsole();
  }

  function buildMemoryReport() {
    const allResults = tabsRef.current.flatMap((tab) => tab.results);
    const submissionStats = getSubmissionArtistStoreStats(allResults);
    const queueSnapshot = queueRef.current;
    const queueEstimatedBytes = estimateValueBytes(queueSnapshot.jobs);
    const visibleImageBytes = estimateVisibleImageBytes();
    const queuePreviewCount = queueSnapshot.jobs.filter((job) =>
      Boolean(job.previewUrl),
    ).length;
    const hiddenCompletedJobs = Math.max(
      0,
      queueSnapshot.completedCount -
        queueSnapshot.jobs.filter((job) => job.status === "completed").length,
    );
    const hiddenCancelledJobs = Math.max(
      0,
      queueSnapshot.cancelledCount -
        queueSnapshot.jobs.filter((job) => job.status === "cancelled").length,
    );
    const browserMemory = getBrowserMemoryStats();
    const report = {
      browser: browserMemory,
      tabs: {
        tabCount: tabsRef.current.length,
        totalResults: allResults.length,
        activeTabResults:
          tabsRef.current.find((tab) => tab.id === activeTabIdRef.current)
            ?.results.length ?? 0,
      },
      results: {
        count: submissionStats.resultCount,
        uniqueArtists: submissionStats.uniqueArtistCount,
        normalizedBytes: submissionStats.normalizedResultBytes,
        normalizedLabel: formatMemoryBytes(
          submissionStats.normalizedResultBytes,
        ),
        uniqueArtistBytes: submissionStats.uniqueArtistBytes,
        uniqueArtistLabel: formatMemoryBytes(submissionStats.uniqueArtistBytes),
        denormalizedBytes: submissionStats.denormalizedResultBytes,
        denormalizedLabel: formatMemoryBytes(
          submissionStats.denormalizedResultBytes,
        ),
        savedBytes: submissionStats.savedBytes,
        savedLabel: formatMemoryBytes(submissionStats.savedBytes),
      },
      queue: {
        retainedJobs: queueSnapshot.jobs.length,
        estimatedBytes: queueEstimatedBytes,
        estimatedLabel: formatMemoryBytes(queueEstimatedBytes),
        totalQueued: queueSnapshot.queuedCount,
        totalActive: queueSnapshot.activeCount,
        totalCompleted: queueSnapshot.completedCount,
        totalFailed: queueSnapshot.failedCount,
        totalCancelled: queueSnapshot.cancelledCount,
        hiddenCompletedJobs,
        hiddenCancelledJobs,
        retainedPreviewUrls: queuePreviewCount,
      },
      images: {
        domImageCount:
          typeof document === "undefined" ? 0 : document.images.length,
        visibleDecodedBytes: visibleImageBytes,
        visibleDecodedLabel: formatMemoryBytes(visibleImageBytes),
      },
      likelyDriver: summarizeLikelyMemoryDriver(
        submissionStats.normalizedResultBytes +
          submissionStats.uniqueArtistBytes,
        queueEstimatedBytes,
        visibleImageBytes,
      ),
    };

    console.info("Inkbunny memory report:", report);
    return JSON.stringify(report, null, 2);
  }

  async function runDebugBackendRefresh() {
    const deferredMessage = await clearDeferredDebugState();
    applyBackendSnapshot(await fetchAppSnapshotFromBackend());
    console.info("Inkbunny debug refresh:", {
      scope: "backend",
      deferred: deferredMessage,
    });
    return "Refreshed frontend from backend state.";
  }

  async function runDebugFullRefresh() {
    await runDebugBackendRefresh();
    return reloadDebugPage();
  }

  function showReleaseUpdateToast(
    status: ReleaseStatus,
    currentSettings: AppSettings,
  ) {
    if (
      !status.updateAvailable ||
      !status.latestTag ||
      status.latestTag === currentSettings.skippedReleaseTag
    ) {
      return;
    }

    pushToast({
      id: RELEASE_UPDATE_TOAST_ID,
      dedupeKey: RELEASE_UPDATE_TOAST_ID,
      level: "info",
      message: "New version is available.",
      sticky: true,
      primaryAction: {
        label: `Update to ${status.latestTag}`,
        onClick: () => {
          void backend
            .openExternalURL(status.releaseURL)
            .then(() => dismissToast(RELEASE_UPDATE_TOAST_ID))
            .catch((error: unknown) => {
              pushErrorToast(
                getErrorMessage(error, "Could not open the release page."),
                "release-open-error",
              );
            });
        },
      },
      secondaryAction: {
        label: "Defer update",
        variant: "secondary",
        onClick: () => {
          void backend
            .skipReleaseTag(status.latestTag)
            .then((savedSettings) => {
              syncSettings(savedSettings);
              dismissToast(RELEASE_UPDATE_TOAST_ID);
            })
            .catch((error: unknown) => {
              pushErrorToast(
                getErrorMessage(
                  error,
                  "Could not save the release preference.",
                ),
                "release-skip-error",
              );
            });
        },
      },
    });
  }

  function handleAddTab() {
    const nextTab = createSearchTab(sessionRef.current, settingsRef.current);
    setTabs((previous) => [...previous, nextTab]);
    setActiveTabId(nextTab.id);
  }

  function handleClearSearchForm(targetTabId = activeTabIdRef.current) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab) {
      return;
    }
    markWorkspaceInputEdit(targetTabId);
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      searchParams: normalizeSearchParamsForMode(
        buildDefaultSearch(sessionRef.current, settingsRef.current),
        currentTab.mode,
        sessionRef.current,
        settingsRef.current,
      ),
      artistDraft: "",
      artistAvatars: {},
      artistValidation: {},
    }));
  }

  function openWebviewDebugConsole() {
    const runtimeWindow = window as Window & {
      runtime?: Window["runtime"] & {
        OpenDevToolsWindow?: () => void;
      };
    };

    if (typeof runtimeWindow.runtime?.OpenDevToolsWindow === "function") {
      runtimeWindow.runtime.OpenDevToolsWindow();
      return;
    }

    console.info("Debug console is not exposed by this build.");
  }

  function handleToggleAutoQueue(
    enabled: boolean,
    targetTabId = activeTabIdRef.current,
  ) {
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      autoQueueEnabled: enabled,
      autoQueuePhase: "idle",
      autoQueueNextRunAt: 0,
      trackedDownloadSubmissionIds: enabled
        ? currentTab.trackedDownloadSubmissionIds
        : [],
    }));
  }

  async function resetUnreadBaseline() {
    if (!sessionRef.current.hasSession || sessionRef.current.isGuest) {
      setUnreadTotal(0);
      setTrackedUnreadBaseline(-1);
      return;
    }

    try {
      const total = await backend.getUnreadSubmissionCount();
      setUnreadTotal(total);
      setTrackedUnreadBaseline(total);
    } catch {
      setTrackedUnreadBaseline(unreadTotalRef.current);
    }
  }

  async function handleOpenUnreadTab() {
    if (!sessionRef.current.hasSession || sessionRef.current.isGuest) {
      return;
    }

    const currentTabs = tabsRef.current;
    const currentTab =
      currentTabs.find((tab) => tab.id === activeTabIdRef.current) ?? null;
    const reuseCurrentTab =
      currentTab !== null &&
      isSearchTabUntouched(currentTab, sessionRef.current, settingsRef.current);
    const targetTab = reuseCurrentTab
      ? switchSearchTabToUnread(
          currentTab!,
          sessionRef.current,
          settingsRef.current,
        )
      : createUnreadSearchTab(sessionRef.current, settingsRef.current);
    const nextTabs = reuseCurrentTab
      ? currentTabs.map((tab) => (tab.id === targetTab.id ? targetTab : tab))
      : [...currentTabs, targetTab];

    tabsRef.current = nextTabs;
    activeTabIdRef.current = targetTab.id;
    setTabs(nextTabs);
    setActiveTabId(targetTab.id);
    await resetUnreadBaseline();
    void handleSearch(1, targetTab.id);
  }

  async function handleDisableUnreadMode(targetTabId = activeTabIdRef.current) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab || tab.mode !== "unread") {
      return;
    }

    markWorkspaceInputEdit(targetTabId);
    updateTab(targetTabId, (currentTab) =>
      currentTab.mode !== "unread"
        ? currentTab
        : {
            ...currentTab,
            mode: "default",
            searchParams: normalizeSearchParamsForMode(
              currentTab.searchParams,
              "default",
              sessionRef.current,
              settingsRef.current,
            ),
          },
    );
    await handleSearchAction(targetTabId);
  }

  function handleCloseTab(tabId: string) {
    const currentTabs = tabsRef.current;
    const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) {
      return;
    }
    if (currentTabs.length === 1) {
      setTabs((previous) =>
        previous.map((tab) =>
          tab.id === tabId
            ? resetSearchTab(tab, sessionRef.current, settingsRef.current)
            : tab,
        ),
      );
      setActiveTabId(tabId);
      return;
    }
    const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
    const nextActiveId =
      activeTabIdRef.current === tabId
        ? (nextTabs[Math.max(0, closingIndex - 1)]?.id ?? nextTabs[0]?.id ?? "")
        : activeTabIdRef.current;
    setTabs(nextTabs);
    if (nextActiveId) {
      setActiveTabId(nextActiveId);
    }
  }

  useEffect(() => {
    writeFrontendSearchLog("active tab state", {
      tabId: activeTab?.id ?? "",
      mode: activeTab?.mode ?? "",
      searchLoading: activeSearchLoading,
      searchPhase: activeSearchPhase,
      searchActivity: activeSearchActivity,
      loadMoreMode: activeLoadMoreState.mode,
      autoQueuePhase: activeTab?.autoQueuePhase ?? "idle",
      searchId: activeSearchResponse?.searchId ?? "",
      resultsCount: activeSearchResponse?.resultsCount ?? 0,
      visibleResults: activeResults.length,
    });
  }, [
    activeLoadMoreState.mode,
    activeResults.length,
    activeSearchLoading,
    activeSearchPhase,
    activeSearchActivity,
    activeSearchResponse?.resultsCount,
    activeSearchResponse?.searchId,
    activeTab?.autoQueuePhase,
    activeTab?.id,
    activeTab?.mode,
  ]);
  useEffect(() => {
    if (!hasAutoQueueCountdown) {
      return;
    }
    setAutoQueueClock(Date.now());
    const intervalId = window.setInterval(
      () => setAutoQueueClock(Date.now()),
      AUTO_QUEUE_TICK_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [hasAutoQueueCountdown]);
  useEffect(() => {
    setWatchingUsers(null);
    setWatchingLoading(false);
  }, [session.hasSession, session.isGuest, session.username]);
  useEffect(() => {
    if (!session.hasSession || session.isGuest) {
      setUnreadTotal(0);
      setTrackedUnreadBaseline(-1);
      return;
    }

    let cancelled = false;

    const pollUnreadCount = async () => {
      if (apiCooldownUntil > Date.now()) {
        return;
      }
      try {
        const total = await backend.getUnreadSubmissionCount();
        if (cancelled) {
          return;
        }
        setUnreadTotal(total);
        setTrackedUnreadBaseline((previous) =>
          previous < 0 ? total : previous,
        );
      } catch {
        return;
      }
    };

    void pollUnreadCount();
    const intervalId = window.setInterval(() => {
      void pollUnreadCount();
    }, UNREAD_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiCooldownUntil, session.hasSession, session.isGuest, session.username]);
  useEffect(() => {
    if (!activeTab && tabs[0]) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTab, tabs]);
  useEffect(() => {
    if (!loginOpen) {
      return;
    }
    if (tourOpen) {
      clearScheduledTourAdvance();
      setTourOpen(false);
      setTourStepId("tabs-toggle");
      setTourSearchAttempted(false);
      setTourAdvancing(false);
      setTabMenuOpen(false);
    }
    setLoginTeachMe(!settings.hasLoggedInBefore);
  }, [loginOpen, settings.hasLoggedInBefore, tourOpen]);

  useEffect(() => {
    if (!tourOpen) {
      return;
    }
    if (
      activeTab &&
      activeSearchCollapsed &&
      (tourStepId === "search-words" ||
        tourStepId === "artist-name" ||
        tourStepId === "run-search")
    ) {
      updateTab(activeTab.id, (currentTab) => ({
        ...currentTab,
        searchCollapsed: false,
      }));
    }
  }, [activeSearchCollapsed, activeTab, tourOpen, tourStepId]);

  useEffect(() => {
    if (!tourOpen || tourAdvancing) {
      return;
    }

    if (tourStepId === "tabs-toggle" && tabMenuOpen) {
      scheduleTourAdvance("tabs-menu");
      return;
    }
    if (tourStepId === "tabs-menu" && !tabMenuOpen) {
      scheduleTourAdvance("search-words");
      return;
    }
    if (
      tourStepId === "run-search" &&
      hasActiveResult &&
      !activeSearchLoading
    ) {
      scheduleTourAdvance("select-images");
      return;
    }
    if (
      tourStepId === "select-images" &&
      activeSelectedSubmissionIds.length > 0
    ) {
      scheduleTourAdvance("queue-images");
      return;
    }
    if (tourStepId === "queue-images" && queueReadyForTour) {
      scheduleTourAdvance("queue-panel");
    }
  }, [
    activeSearchLoading,
    hasActiveResult,
    activeSelectedSubmissionIds.length,
    hasSelectableActiveResult,
    queueReadyForTour,
    tabMenuOpen,
    tourAdvancing,
    tourOpen,
    tourStepId,
  ]);

  useEffect(() => {
    return registerDebugControls({
      getSettings: () => settingsRef.current,
      getBuildInfo: () => buildInfoRef.current,
      showNotification: handleAppNotification,
      pushToast,
      clearToasts: clearAllToasts,
      openPanel: openDebugPanel,
      memoryReport: buildMemoryReport,
      cancelSearch: () => stopActiveSearch(),
      resetState: runDebugStateReset,
      refreshBackend: runDebugBackendRefresh,
      refreshEverything: runDebugFullRefresh,
      refreshPage: reloadDebugPage,
      showOnboarding: () => {
        setLoginOpen(false);
        startTutorial();
      },
      showReleaseUpdateToast,
    });
  }, []);

  useEffect(
    () => () => {
      for (const timeoutId of toastTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      toastTimeoutsRef.current.clear();
      for (const timeoutId of autoClearTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      autoClearTimeoutsRef.current.clear();
      autoClearPendingSubmissionIdsRef.current.clear();
      clearScheduledTourAdvance();
      if (workspacePersistTimeoutRef.current !== null) {
        window.clearTimeout(workspacePersistTimeoutRef.current);
        workspacePersistTimeoutRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (apiCooldownUntil <= Date.now()) {
      return;
    }
    const timeout = window.setTimeout(
      () => setApiCooldownUntil(0),
      apiCooldownUntil - Date.now(),
    );
    return () => window.clearTimeout(timeout);
  }, [apiCooldownUntil]);

  useEffect(() => {
    let mounted = true;
    fetchAppSnapshotFromBackend()
      .then((snapshot) => {
        if (!mounted) {
          return;
        }
        applyBackendSnapshot(snapshot);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Unable to reach the Wails backend.";
        setAuthError(message);
        pushErrorToast(message, "backend-unavailable");
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribeSnapshot = subscribeBackendEvent(
      "snapshot.initial",
      (snapshot) => {
        applySharedSnapshot(snapshot);
      },
    );
    const unsubscribeSession = subscribeBackendEvent(
      "session.updated",
      (update) => {
        handleSessionStateUpdate(update);
      },
    );
    const unsubscribeSettings = subscribeBackendEvent(
      "settings.updated",
      (update) => {
        handleSettingsStateUpdate(update);
      },
    );
    const unsubscribeWorkspace = subscribeBackendEvent(
      "workspace.updated",
      (update) => {
        handleWorkspaceStateUpdate(update);
      },
    );
    const unsubscribeQueue = subscribeBackendEvent(
      "queue.updated",
      (update) => {
        handleQueueStateUpdate(update);
      },
    );
    const unsubscribeQueueJobUpdated = subscribeBackendEvent(
      "download.jobUpdated",
      (update) => {
        handleQueueJobUpdated(update);
      },
    );
    const unsubscribeHydratedResults = subscribeBackendEvent(
      "search.resultsHydrated",
      (update) => {
        handleSearchResultsHydrated(update);
      },
    );
    const unsubscribeDebugLogs = subscribeBackendEvent("debug", (event) => {
      writeBackendDebugEvent(event);
    });
    const unsubscribeNotifications = subscribeBackendEvent(
      "notification",
      (event) => {
        handleAppNotification(event);
      },
    );
    return () => {
      unsubscribeSnapshot();
      unsubscribeSession();
      unsubscribeSettings();
      unsubscribeWorkspace();
      unsubscribeQueue();
      unsubscribeQueueJobUpdated();
      unsubscribeHydratedResults();
      unsubscribeDebugLogs();
      unsubscribeNotifications();
    };
  }, []);

  useEffect(() => {
    const activeSubmissionIds = getTrackedSubmissionIdsInFlight(
      queue,
      pendingDownloadSubmissionIds,
    );
    setTabs((previous) => {
      let changed = false;
      const nextTabs = previous.map((tab) => {
        const nextTracked = tab.trackedDownloadSubmissionIds.filter(
          (submissionId) => activeSubmissionIds.has(submissionId),
        );
        if (
          areStringArraysEqual(nextTracked, tab.trackedDownloadSubmissionIds)
        ) {
          return tab;
        }
        changed = true;
        return {
          ...tab,
          trackedDownloadSubmissionIds: nextTracked,
        };
      });
      return changed ? nextTabs : previous;
    });
  }, [pendingDownloadSubmissionIds, queue]);

  useEffect(() => {
    if (!workspaceLoadedRef.current) {
      return;
    }
    if (suppressNextWorkspacePersistRef.current) {
      suppressNextWorkspacePersistRef.current = false;
      lastWorkspacePersistSkipKeyRef.current = "";
      return;
    }
    const transientWorkspaceState = describeTransientWorkspaceState(
      tabsRef.current,
    );
    if (transientWorkspaceState !== null) {
      if (
        lastWorkspacePersistSkipKeyRef.current !== transientWorkspaceState.key
      ) {
        lastWorkspacePersistSkipKeyRef.current = transientWorkspaceState.key;
        writeFrontendSearchLog("skipping workspace persist", {
          reason: "transient-search-state",
          tabCount: tabsRef.current.length,
          transientTabCount: transientWorkspaceState.count,
        });
      }
      return;
    }
    lastWorkspacePersistSkipKeyRef.current = "";
    if (workspacePersistTimeoutRef.current !== null) {
      window.clearTimeout(workspacePersistTimeoutRef.current);
    }
    workspacePersistTimeoutRef.current = window.setTimeout(() => {
      workspacePersistTimeoutRef.current = null;
      const workspaceState = buildWorkspaceState(
        tabsRef.current,
        activeTabIdRef.current,
      );
      rememberPendingWorkspaceEcho(pendingWorkspaceEchoesRef, workspaceState);
      void backend
        .saveWorkspaceState(workspaceState)
        .catch((error: unknown) => {
          acknowledgePendingWorkspaceEcho(
            pendingWorkspaceEchoesRef,
            workspaceState,
          );
          pushErrorToast(
            getErrorMessage(error, "Unable to save tab workspace."),
            "save-workspace-error",
          );
        });
    }, 150);
    return () => {
      if (workspacePersistTimeoutRef.current !== null) {
        window.clearTimeout(workspacePersistTimeoutRef.current);
        workspacePersistTimeoutRef.current = null;
      }
    };
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (describeTransientWorkspaceState(tabsRef.current) !== null) {
      return;
    }
    const deferredUpdate = deferredWorkspaceUpdateRef.current;
    if (!deferredUpdate) {
      return;
    }
    deferredWorkspaceUpdateRef.current = null;
    applyIncomingWorkspaceUpdate(deferredUpdate);
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (!session.hasSession) {
      return;
    }
    if (
      autoQueueRunningRef.current ||
      tabs.some(
        (tab) =>
          tab.searchLoading ||
          tab.loadMoreState.mode !== "idle" ||
          tab.autoQueuePhase !== "idle",
      )
    ) {
      return;
    }
    for (const tab of tabs) {
      if (
        !shouldRunAutoQueue(
          tab,
          queue,
          pendingDownloadSubmissionIds,
          autoQueueClock,
        )
      ) {
        continue;
      }
      autoQueueRunningRef.current = true;
      void runAutoQueue(tab.id).finally(() => {
        autoQueueRunningRef.current = false;
      });
      break;
    }
  }, [
    autoQueueClock,
    pendingDownloadSubmissionIds,
    queue,
    session.hasSession,
    tabs,
  ]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.darkMode
      ? "dark"
      : "light";
  }, [settings.darkMode]);

  useEffect(() => {
    const timeouts = autoClearTimeoutsRef.current;

    if (!settings.autoClearCompleted) {
      for (const timeoutId of timeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      timeouts.clear();
      autoClearPendingSubmissionIdsRef.current.clear();
      autoClearRunningRef.current = false;
      return;
    }

    for (const submissionId of completedQueueSubmissionIds) {
      scheduleAutoClearSubmission(submissionId);
    }

    for (const [submissionId, timeoutId] of timeouts.entries()) {
      if (completedQueueSubmissionIds.has(submissionId)) {
        continue;
      }
      window.clearTimeout(timeoutId);
      timeouts.delete(submissionId);
      autoClearPendingSubmissionIdsRef.current.delete(submissionId);
    }
  }, [completedQueueSubmissionIds, settings.autoClearCompleted]);

  useEffect(
    () => () => {
      if (ratingDebounceRef.current !== null) {
        window.clearTimeout(ratingDebounceRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!shouldScrollToResultsRef.current || !resultsRef.current) {
      return;
    }
    shouldScrollToResultsRef.current = false;
    resultsRef.current.scrollIntoView({
      behavior: settings.motionEnabled ? "smooth" : "auto",
      block: "start",
    });
  }, [
    activeResults.length,
    activeSearchResponse?.searchId,
    activeTabId,
    settings.motionEnabled,
  ]);

  useEffect(() => {
    if (completedQueueSubmissionIds.size === 0) {
      return;
    }
    setTabs((previous) => {
      const nextDownloadedSubmissionIds = getDownloadedSubmissionIds(
        previous,
        completedQueueSubmissionIds,
      );
      let changed = false;
      const nextTabs = previous.map((tab) => {
        let tabChanged = false;
        const nextResults = tab.results.map((result) => {
          if (
            !completedQueueSubmissionIds.has(result.submissionId) ||
            result.downloaded
          ) {
            return result;
          }
          tabChanged = true;
          return normalizeSubmissionCard({
            ...denormalizeSubmissionCard(result),
            downloaded: true,
          });
        });
        const nextSelectedSubmissionIds = tab.selectedSubmissionIds.filter(
          (submissionId) => !nextDownloadedSubmissionIds.has(submissionId),
        );
        if (
          nextSelectedSubmissionIds.length !== tab.selectedSubmissionIds.length
        ) {
          tabChanged = true;
        }
        if (!tabChanged) {
          return tab;
        }
        changed = true;
        return {
          ...tab,
          results: nextResults,
          selectedSubmissionIds: nextSelectedSubmissionIds,
        };
      });
      return changed ? nextTabs : previous;
    });
  }, [completedQueueSubmissionIds]);

  useEffect(() => {
    const completedPreviewImages = recentCompletedPreviewImagesRef.current;
    if (completedPreviewImages.length === 0) {
      return;
    }
    setRecentDownloadedImages((current) => {
      const nextImages = dedupePreviewImageSets([
        ...completedPreviewImages,
        ...current,
      ]).slice(0, 3);
      return arePreviewImageSetsEqual(nextImages, current)
        ? current
        : nextImages;
    });
  }, [recentCompletedPreviewImagesKey]);

  useEffect(() => {
    const requestId = ++keywordRequestRef.current;
    const timeout = window.setTimeout(() => {
      if (apiCooldownUntil > Date.now()) {
        setKeywordSuggestions([]);
        return;
      }
      const suggestionQuery = getSuggestionQuery(activeSearchParams.query);
      if (!suggestionQuery) {
        setKeywordSuggestions([]);
        return;
      }
      backend
        .getKeywordSuggestions(suggestionQuery)
        .then((suggestions) => {
          if (requestId === keywordRequestRef.current) {
            setKeywordSuggestions(suggestions);
          }
        })
        .catch(() => {
          if (requestId === keywordRequestRef.current) {
            setKeywordSuggestions([]);
          }
        });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [activeSearchParams.query, apiCooldownUntil]);

  useEffect(() => {
    const requestId = ++artistRequestRef.current;
    const timeout = window.setTimeout(() => {
      if (apiCooldownUntil > Date.now()) {
        setArtistSuggestions([]);
        return;
      }
      if (activeSearchParams.useWatchingArtists || !activeArtistDraft.trim()) {
        setArtistSuggestions([]);
        return;
      }
      backend
        .getUsernameSuggestions(activeArtistDraft)
        .then((suggestions) => {
          if (requestId === artistRequestRef.current) {
            setArtistSuggestions(suggestions);
          }
        })
        .catch(() => {
          if (requestId === artistRequestRef.current) {
            setArtistSuggestions([]);
          }
        });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [
    activeArtistDraft,
    activeSearchParams.useWatchingArtists,
    apiCooldownUntil,
  ]);

  useEffect(() => {
    const requestId = ++favoritesRequestRef.current;
    const timeout = window.setTimeout(() => {
      if (apiCooldownUntil > Date.now()) {
        setFavoriteSuggestions([]);
        return;
      }
      if (!activeSearchParams.favoritesBy.trim()) {
        setFavoriteSuggestions([]);
        return;
      }
      backend
        .getUsernameSuggestions(activeSearchParams.favoritesBy)
        .then((suggestions) => {
          if (requestId === favoritesRequestRef.current) {
            setFavoriteSuggestions(suggestions);
          }
        })
        .catch(() => {
          if (requestId === favoritesRequestRef.current) {
            setFavoriteSuggestions([]);
          }
        });
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [activeSearchParams.favoritesBy, apiCooldownUntil]);

  async function persistSettings(partial: Partial<AppSettings>) {
    const next = { ...settingsRef.current, ...partial };
    syncSettings(next);
    try {
      syncSettings(await backend.updateSettings(next));
    } catch (error) {
      updateQueueMessage(
        getErrorMessage(error, "Unable to save settings."),
        "error",
        "save-settings-error",
      );
    }
  }

  function clearScheduledTourAdvance() {
    if (tourAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(tourAdvanceTimeoutRef.current);
      tourAdvanceTimeoutRef.current = null;
    }
    scheduledTourAdvanceRef.current = "";
  }

  function applyTourStep(nextStep: TourStepId | "stop") {
    if (nextStep === "stop") {
      clearScheduledTourAdvance();
      setTourOpen(false);
      setTourStepId("tabs-toggle");
      setTourSearchAttempted(false);
      setTourAdvancing(false);
      setTabMenuOpen(false);
      return;
    }
    if (nextStep === "tabs-menu") {
      setTabMenuOpen(true);
    }
    if (nextStep === "search-words") {
      setTabMenuOpen(false);
    }
    if (nextStep === "run-search") {
      setTourSearchAttempted(false);
    }
    setTourStepId(nextStep);
  }

  function scheduleTourAdvance(nextStep: TourStepId | "stop") {
    const key = `${tourStepId}:${nextStep}`;
    if (
      scheduledTourAdvanceRef.current === key &&
      tourAdvanceTimeoutRef.current !== null
    ) {
      return;
    }

    clearScheduledTourAdvance();
    scheduledTourAdvanceRef.current = key;
    setTourAdvancing(true);
    tourAdvanceTimeoutRef.current = window.setTimeout(() => {
      tourAdvanceTimeoutRef.current = null;
      scheduledTourAdvanceRef.current = "";
      setTourAdvancing(false);
      applyTourStep(nextStep);
    }, TOUR_STEP_DELAY_MS);
  }

  function startTutorial() {
    clearScheduledTourAdvance();
    setTourSearchAttempted(false);
    setTourAdvancing(false);
    setTourStepId("tabs-toggle");
    setTabMenuOpen(false);
    setTourOpen(true);
  }

  function stopTutorial() {
    applyTourStep("stop");
  }

  function handleTourAdvance() {
    if (tourAdvancing || !currentTourStep.canAdvance) {
      return;
    }
    const nextStep = getNextTourStep(tourStepId);
    scheduleTourAdvance(nextStep ?? "stop");
  }

  function scheduleAutoClearSubmission(submissionId: string) {
    if (!submissionId || autoClearTimeoutsRef.current.has(submissionId)) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      autoClearTimeoutsRef.current.delete(submissionId);
      autoClearPendingSubmissionIdsRef.current.add(submissionId);
      void flushAutoClearCompletedSubmissions();
    }, 3000);
    autoClearTimeoutsRef.current.set(submissionId, timeoutId);
  }

  async function flushAutoClearCompletedSubmissions() {
    if (autoClearRunningRef.current) {
      return;
    }

    const submissionIds = [...autoClearPendingSubmissionIdsRef.current];
    if (submissionIds.length === 0) {
      return;
    }

    autoClearRunningRef.current = true;
    autoClearPendingSubmissionIdsRef.current.clear();
    let cleared = false;

    try {
      const snapshot = await backend.clearCompletedSubmissions(submissionIds);
      applyQueueSnapshot(snapshot);
      cleared = true;
      updateQueueMessage(
        `${formatCountLabel(submissionIds.length, "submission")} cleared automatically.`,
        "success",
        "queue-auto-clear-completed",
      );
    } catch (error) {
      for (const submissionId of submissionIds) {
        autoClearPendingSubmissionIdsRef.current.delete(submissionId);
        scheduleAutoClearSubmission(submissionId);
      }
      const message = getErrorMessage(
        error,
        "Could not clear completed submissions automatically.",
      );
      updateQueueMessage(message);
      pushErrorToast(message, "queue-auto-clear-completed-error");
    } finally {
      autoClearRunningRef.current = false;
      if (cleared && autoClearPendingSubmissionIdsRef.current.size > 0) {
        void flushAutoClearCompletedSubmissions();
      }
    }
  }

  async function handleClearCompleted(auto = false) {
    try {
      const snapshot = await backend.clearCompletedDownloads();
      applyQueueSnapshot(snapshot);
      if (auto) {
        updateQueueMessage(
          "Completed downloads cleared automatically.",
          "success",
          "queue-auto-clear-completed",
        );
        return;
      }
      updateQueueMessage(
        "Completed downloads cleared.",
        "success",
        "queue-clear-completed",
      );
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Could not clear completed downloads.",
      );
      updateQueueMessage(message);
      pushErrorToast(
        message,
        auto
          ? "queue-auto-clear-completed-error"
          : "queue-clear-completed-error",
      );
    }
  }

  async function handleLogin() {
    const shouldStartTutorial = loginTeachMe;
    setAuthLoading(true);
    setAuthError("");
    try {
      const nextSession = await backend.login(loginUsername, loginPassword);
      applySession(nextSession);
      setLoginOpen(false);
      setLoginPassword("");
      setLoginTeachMe(!nextSession.settings.hasLoggedInBefore);
      pushToast({
        level: "success",
        message: `Signed in as ${nextSession.username}.`,
        dedupeKey: "login-success",
      });
      if (shouldStartTutorial) {
        window.setTimeout(() => startTutorial(), 120);
      }
    } catch (error) {
      const message = getErrorMessage(error, "Login failed.");
      setAuthError(message);
      pushErrorToast(message, "login-error");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    try {
      stopTutorial();
      applySession(await backend.logout());
      setLoginOpen(true);
      pushToast({
        level: "success",
        message: "Signed out.",
        dedupeKey: "logout-success",
      });
    } catch (error) {
      updateQueueMessage(
        getErrorMessage(error, "Logout failed."),
        "error",
        "logout-error",
      );
    }
  }

  async function handleToggleWatchingArtists(
    targetTabId = activeTabIdRef.current,
  ) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab) {
      return;
    }
    if (watchingLoading) {
      return;
    }
    if (tab.searchParams.useWatchingArtists) {
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        searchParams: {
          ...currentTab.searchParams,
          useWatchingArtists: false,
        },
      }));
      return;
    }
    if (!sessionRef.current.hasSession || sessionRef.current.isGuest) {
      const message = "Sign in with a member account to use My watches.";
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        searchError: message,
      }));
      pushToast({ level: "warning", message, dedupeKey: "my-watches-sign-in" });
      return;
    }

    try {
      if (watchingUsers === null) {
        setWatchingLoading(true);
        setWatchingUsers(await backend.getWatching());
      }
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        searchError: "",
        searchParams: {
          ...currentTab.searchParams,
          useWatchingArtists: true,
        },
      }));
    } catch (error) {
      const message = getErrorMessage(error, "Could not load your watch list.");
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        searchError: message,
      }));
      pushErrorToast(message, "my-watches-error");
    } finally {
      setWatchingLoading(false);
    }
  }

  async function handleSearch(page = 1, targetTabId = activeTabIdRef.current) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab) {
      return;
    }
    if (page === 1) {
      cancelLoadMore(targetTabId);
    }
    if (!sessionRef.current.hasSession) {
      const message = "Sign in to search.";
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        searchError: message,
      }));
      setLoginOpen(true);
      pushToast({ level: "warning", message, dedupeKey: "search-sign-in" });
      return;
    }
    if (page > 1 && !tab.searchResponse) {
      return;
    }
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      searchLoading: true,
      searchPhase: "searching",
      searchActivity: "search",
      searchError: "",
    }));
    const runId = startSearchRequestRun(targetTabId);
    let clearSearchLoadingInFinally = true;
    try {
      const committedArtistName = getCommittedArtistDraftName(
        tab.searchParams,
        tab.artistDraft,
      );
      const committedArtistSuggestion =
        committedArtistName && targetTabId === activeTabIdRef.current
          ? findExactUsernameSuggestion(committedArtistName, artistSuggestions)
          : undefined;
      if (committedArtistName && !committedArtistSuggestion) {
        resolveArtistIdentity(targetTabId, committedArtistName);
      }
      const normalizedParams = normalizeSearchParamsForMode(
        finalizeArtistDraft(tab.searchParams, tab.artistDraft),
        tab.mode,
        sessionRef.current,
        settingsRef.current,
      );
      writeFrontendSearchLog("search request started", {
        tabId: targetTabId,
        runId,
        page,
        mode: tab.mode,
        unreadSubmissions: normalizedParams.unreadSubmissions,
        query: normalizedParams.query,
        artistCount: normalizedParams.artistNames.length,
        previousSearchId: tab.searchResponse?.searchId ?? "",
      });
      const response =
        page === 1
          ? await backend.search({
              ...normalizedParams,
              page,
              maxActive: settingsRef.current.maxActive,
              clientOperationId: targetTabId,
            })
          : await backend.loadMoreResults(
              tab.searchResponse!.searchId,
              page,
              targetTabId,
            );
      if (isSearchRequestStopRequested(targetTabId, runId)) {
        writeFrontendSearchLog("search response ignored", {
          tabId: targetTabId,
          runId,
          page,
          reason: "stop-requested",
          searchId: response.searchId,
        });
        return undefined;
      }
      writeFrontendSearchLog("search response received", {
        tabId: targetTabId,
        runId,
        page,
        mode: tab.mode,
        searchId: response.searchId,
        resultsCount: response.resultsCount,
        returnedResults: response.results.length,
        pagesCount: response.pagesCount,
        firstSubmissionId: response.results[0]?.submissionId ?? "",
      });
      if (tourOpen && tourStepId === "run-search" && page === 1) {
        setTourSearchAttempted(true);
      }
      applySessionWithoutTabSync(response.session);
      const hydratedResults = applyPendingHydratedResults(
        response.searchId,
        normalizeSubmissionCards(response.results),
      );
      const hydratedResponse =
        hydratedResults === response.results
          ? response
          : { ...response, results: hydratedResults };
      if (page === 1 && activeTabIdRef.current === targetTabId) {
        shouldScrollToResultsRef.current = true;
      }
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        searchPhase: "processing",
      }));
      clearSearchLoadingInFinally = false;
      updateTab(targetTabId, (currentTab) => {
        if (page === 1) {
          const nextTab = committedArtistName
            ? commitArtistSelection(currentTab, committedArtistName, {
                avatarUrl: committedArtistSuggestion?.avatarUrl || "",
                validation: committedArtistSuggestion ? "valid" : "pending",
              })
            : currentTab;
          return {
            ...nextTab,
            searchParams: normalizedParams,
            artistDraft: "",
            searchLoading: false,
            searchPhase: "idle",
            searchActivity: "idle",
            searchResponse: hydratedResponse,
            results: hydratedResponse.results,
            selectedSubmissionIds: getAutoSelectedSubmissionIds(
              hydratedResponse.results,
              mergeDownloadedSubmissionIds(
                downloadedSubmissionIdsRef.current,
                hydratedResponse.results,
              ),
            ),
            activeSubmissionId: hydratedResponse.results[0]?.submissionId ?? "",
            searchError: "",
          };
        }
        return {
          ...currentTab,
          searchLoading: false,
          searchPhase: "idle",
          searchActivity: "idle",
          searchResponse: hydratedResponse,
          results: [...currentTab.results, ...hydratedResponse.results],
          activeSubmissionId:
            currentTab.activeSubmissionId ||
            hydratedResponse.results[0]?.submissionId ||
            "",
          searchError: "",
        };
      });
      writeFrontendSearchLog("search response applied to tab state", {
        tabId: targetTabId,
        runId,
        page,
        searchId: response.searchId,
        returnedResults: response.results.length,
      });
      return hydratedResponse;
    } catch (error) {
      if (
        isSearchRequestStopRequested(targetTabId, runId) ||
        isSearchCancellationError(error)
      ) {
        return undefined;
      }
      if (page > 1 && isUnknownSearchIDError(error)) {
        return handleSearch(1, targetTabId);
      }
      const message = getErrorMessage(error, "Search failed.");
      writeFrontendSearchLog("search request failed", {
        tabId: targetTabId,
        runId,
        page,
        error: message,
      });
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        searchError: message,
      }));
      pushErrorToast(message, page === 1 ? "search-error" : "load-more-error");
      return undefined;
    } finally {
      if (
        clearSearchLoadingInFinally &&
        isSearchRequestRunActive(targetTabId, runId)
      ) {
        writeFrontendSearchLog("search loading cleared in finally", {
          tabId: targetTabId,
          runId,
          page,
        });
        updateTab(targetTabId, (currentTab) => ({
          ...currentTab,
          searchLoading: false,
          searchPhase: "idle",
          searchActivity: "idle",
        }));
      }
    }
  }

  async function handleRefreshSearch(targetTabId?: string) {
    const resolvedTabId =
      typeof targetTabId === "string" ? targetTabId : activeTabIdRef.current;
    const tab = tabsRef.current.find((item) => item.id === resolvedTabId);
    if (!tab?.searchResponse) {
      return;
    }
    cancelLoadMore(resolvedTabId);
    updateTab(resolvedTabId, (currentTab) => ({
      ...currentTab,
      searchLoading: true,
      searchPhase: "searching",
      searchActivity: "refresh",
      searchError: "",
    }));
    const runId = startSearchRequestRun(resolvedTabId);
    let clearSearchLoadingInFinally = true;
    try {
      const [response, queueSnapshot] = await Promise.all([
        backend.refreshSearch(tab.searchResponse.searchId, resolvedTabId),
        backend.getQueueSnapshot(),
      ]);
      if (isSearchRequestStopRequested(resolvedTabId, runId)) {
        return;
      }
      applyQueueSnapshot(queueSnapshot);
      const refreshedTabs = tabsRef.current.map((currentTab) =>
        currentTab.id === resolvedTabId
          ? {
              ...currentTab,
              results: response.results,
              searchResponse: {
                ...response,
                results: response.results,
              },
            }
          : currentTab,
      );
      const refreshedDownloadedSubmissionIds = getDownloadedSubmissionIds(
        refreshedTabs,
        getCompletedQueueSubmissionIds(queueSnapshot),
      );
      applySessionWithoutTabSync(response.session);
      const hydratedResults = applyPendingHydratedResults(
        response.searchId,
        response.results,
      );
      const hydratedResponse =
        hydratedResults === response.results
          ? response
          : { ...response, results: hydratedResults };
      updateTab(resolvedTabId, (currentTab) => ({
        ...currentTab,
        searchPhase: "processing",
      }));
      clearSearchLoadingInFinally = false;
      updateTab(resolvedTabId, (currentTab) => ({
        ...currentTab,
        searchLoading: false,
        searchPhase: "idle",
        searchActivity: "idle",
        searchResponse: hydratedResponse,
        results: hydratedResponse.results,
        selectedSubmissionIds: getAutoSelectedSubmissionIds(
          hydratedResponse.results,
          mergeDownloadedSubmissionIds(
            refreshedDownloadedSubmissionIds,
            hydratedResponse.results,
          ),
        ),
        activeSubmissionId: hydratedResponse.results[0]?.submissionId ?? "",
        resultsRefreshToken: currentTab.resultsRefreshToken + 1,
      }));
    } catch (error) {
      if (
        isSearchRequestStopRequested(resolvedTabId, runId) ||
        isSearchCancellationError(error)
      ) {
        return;
      }
      if (isUnknownSearchIDError(error)) {
        await handleSearch(1, resolvedTabId);
        return;
      }
      const message = getErrorMessage(error, "Refresh failed.");
      updateTab(resolvedTabId, (currentTab) => ({
        ...currentTab,
        searchError: message,
      }));
      pushErrorToast(message, "refresh-search-error");
    } finally {
      if (
        clearSearchLoadingInFinally &&
        isSearchRequestRunActive(resolvedTabId, runId)
      ) {
        updateTab(resolvedTabId, (currentTab) => ({
          ...currentTab,
          searchLoading: false,
          searchPhase: "idle",
          searchActivity: "idle",
        }));
      }
    }
  }

  async function handleLoadMore(
    mode: Exclude<SearchTabLoadMoreMode, "idle">,
    targetTabId = activeTabIdRef.current,
  ) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (
      !tab?.searchResponse ||
      tab.searchLoading ||
      tab.loadMoreState.mode !== "idle" ||
      tab.searchResponse.page >= tab.searchResponse.pagesCount
    ) {
      return;
    }

    const runId = startLoadMoreRun(targetTabId);
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      searchError: "",
      loadMoreState: {
        mode,
        pagesLoaded: 0,
      },
    }));

    try {
      let nextPage = tab.searchResponse.page + 1;
      while (true) {
        const currentTab = tabsRef.current.find(
          (item) => item.id === targetTabId,
        );
        if (
          !currentTab?.searchResponse ||
          nextPage > currentTab.searchResponse.pagesCount
        ) {
          return;
        }

        const response = await handleSearch(nextPage, targetTabId);
        if (!response) {
          return;
        }

        updateTab(targetTabId, (latestTab) => ({
          ...latestTab,
          loadMoreState:
            latestTab.loadMoreState.mode === "idle"
              ? latestTab.loadMoreState
              : {
                  ...latestTab.loadMoreState,
                  pagesLoaded: latestTab.loadMoreState.pagesLoaded + 1,
                },
        }));

        if (isLoadMoreStopRequested(targetTabId, runId)) {
          return;
        }

        if (mode === "more" || response.page >= response.pagesCount) {
          return;
        }

        nextPage = response.page + 1;
        if (isLoadMoreStopRequested(targetTabId, runId)) {
          return;
        }
      }
    } finally {
      if (isLoadMoreRunActive(targetTabId, runId)) {
        updateTab(targetTabId, (currentTab) => ({
          ...currentTab,
          loadMoreState: createIdleLoadMoreState(),
        }));
      }
    }
  }

  function handleStopLoadMore(targetTabId = activeTabIdRef.current) {
    void stopActiveSearch(targetTabId);
  }

  async function handleQueueDownloads(targetTabId = activeTabIdRef.current) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab) {
      return;
    }
    await handleDownloadSubmissions(tab.selectedSubmissionIds, targetTabId);
  }

  async function handleSearchAction(targetTabId = activeTabIdRef.current) {
    if (!tabsRef.current.some((item) => item.id === targetTabId)) {
      return;
    }

    const response = await handleSearch(1, targetTabId);
    const currentTab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!response || !currentTab?.autoQueueEnabled) {
      return;
    }

    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      autoQueuePhase: "queueing",
      autoQueueNextRunAt: Date.now() + AUTO_QUEUE_INTERVAL_MS,
    }));

    const submissionIds = response.results
      .map((result) => result.submissionId)
      .filter(
        (submissionId) =>
          !unavailableSubmissionIdsRef.current.has(submissionId),
      );

    if (submissionIds.length > 0) {
      await handleDownloadSubmissions(submissionIds, targetTabId);
    }

    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      autoQueuePhase: "idle",
      autoQueueNextRunAt: Date.now() + AUTO_QUEUE_INTERVAL_MS,
    }));
  }

  async function openSearchTab(nextTab: SearchTabState) {
    const nextTabs = [...tabsRef.current, nextTab];

    tabsRef.current = nextTabs;
    activeTabIdRef.current = nextTab.id;
    setTabs(nextTabs);
    setActiveTabId(nextTab.id);

    await handleSearchAction(nextTab.id);
  }

  async function handleKeywordSearch(keywordId: string, keywordName: string) {
    const normalizedKeywordId = keywordId.trim();
    const normalizedKeywordName = keywordName.trim();
    if (!normalizedKeywordId) {
      return;
    }

    await openSearchTab({
      ...createSearchTab(sessionRef.current, settingsRef.current),
      searchParams: normalizeSearchParamsForMode(
        {
          ...buildDefaultSearch(sessionRef.current, settingsRef.current),
          query: normalizedKeywordName,
          keywordId: normalizedKeywordId,
          searchInKeywords: true,
          page: 1,
        },
        "default",
        sessionRef.current,
        settingsRef.current,
      ),
    });
  }

  async function handleArtistSearch(username: string, avatarUrl = "") {
    const normalizedUsername = normalizeArtistToken(username);
    if (!normalizedUsername) {
      return;
    }

    const nextTab = commitArtistSelection(
      createSearchTab(sessionRef.current, settingsRef.current),
      username.trim(),
      {
        avatarUrl,
        validation: "valid",
      },
    );

    await openSearchTab({
      ...nextTab,
      searchParams: normalizeSearchParamsForMode(
        {
          ...nextTab.searchParams,
          page: 1,
        },
        "default",
        sessionRef.current,
        settingsRef.current,
      ),
    });
  }

  async function handleFavoritesSearch(username: string) {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      return;
    }
    const baseSearch = buildDefaultSearch(sessionRef.current, settingsRef.current);

    await openSearchTab({
      ...createSearchTab(sessionRef.current, settingsRef.current),
      searchParams: normalizeSearchParamsForMode(
        applyFavoriteSearchDefaultOrder(
          baseSearch,
          {
            ...baseSearch,
          favoritesBy: normalizedUsername,
          page: 1,
          },
          "default",
        ),
        "default",
        sessionRef.current,
        settingsRef.current,
      ),
    });
  }

  async function handleDownloadSubmissions(
    submissionIds: string[],
    targetTabId = activeTabIdRef.current,
  ) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab?.searchResponse || submissionIds.length === 0) {
      return [];
    }
    const eligibleSubmissionIds = submissionIds.filter(
      (submissionId) => !unavailableSubmissionIdsRef.current.has(submissionId),
    );
    if (eligibleSubmissionIds.length === 0) {
      updateQueueMessage(
        "Those submissions are already downloading or downloaded.",
        "warning",
        "queue-no-eligible-results",
      );
      return [];
    }
    setQueueMessage("");
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      trackedDownloadSubmissionIds: mergeSubmissionIds(
        currentTab.trackedDownloadSubmissionIds,
        eligibleSubmissionIds,
      ),
    }));
    setPendingDownloadSubmissionIds((previous) =>
      mergeSubmissionIds(previous, eligibleSubmissionIds),
    );
    try {
      const snapshot = await backend.enqueueDownloads(
        tab.searchResponse.searchId,
        {
          submissions: eligibleSubmissionIds.map((submissionId) => ({
            submissionId,
          })),
        },
        {
          saveKeywords: tab.searchParams.saveKeywords,
          maxActive: settingsRef.current.maxActive,
          downloadDirectory: settingsRef.current.downloadDirectory,
          downloadPattern: settingsRef.current.downloadPattern,
        },
      );
      applyQueueSnapshot(snapshot);
      updateQueueMessage(
        `Queued ${eligibleSubmissionIds.length} submission${eligibleSubmissionIds.length === 1 ? "" : "s"}.`,
        "success",
        "queue-downloads-success",
      );
      return eligibleSubmissionIds;
    } catch (error) {
      const message = getErrorMessage(error, "Failed to queue downloads.");
      updateQueueMessage(message);
      pushErrorToast(message, "queue-downloads-error");
      return [];
    } finally {
      setPendingDownloadSubmissionIds((previous) =>
        previous.filter(
          (submissionId) => !eligibleSubmissionIds.includes(submissionId),
        ),
      );
    }
  }

  async function handleForceRedownloadSubmission(
    submissionId: string,
    targetTabId = activeTabIdRef.current,
  ) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab?.searchResponse || !submissionId) {
      return false;
    }

    const alreadyDownloading =
      pendingDownloadSubmissionIdsRef.current.includes(submissionId) ||
      queueRef.current.jobs.some(
        (job) =>
          job.submissionId === submissionId &&
          (job.status === "queued" || job.status === "active"),
      );
    if (alreadyDownloading) {
      updateQueueMessage(
        "This submission is already downloading.",
        "warning",
        "redownload-submission-busy",
      );
      return false;
    }

    setQueueMessage("");
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      trackedDownloadSubmissionIds: mergeSubmissionIds(
        currentTab.trackedDownloadSubmissionIds,
        [submissionId],
      ),
    }));
    setPendingDownloadSubmissionIds((previous) =>
      mergeSubmissionIds(previous, [submissionId]),
    );

    try {
      const snapshot = await backend.enqueueDownloads(
        tab.searchResponse.searchId,
        {
          submissions: [{ submissionId }],
        },
        {
          saveKeywords: tab.searchParams.saveKeywords,
          maxActive: settingsRef.current.maxActive,
          downloadDirectory: settingsRef.current.downloadDirectory,
          downloadPattern: settingsRef.current.downloadPattern,
          forceRedownload: true,
        },
      );
      applyQueueSnapshot(snapshot);
      updateQueueMessage(
        "Redownloading submission files.",
        "success",
        "redownload-submission-success",
      );
      return true;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to redownload the submission.",
      );
      updateQueueMessage(message);
      pushErrorToast(message, "redownload-submission-error");
      return false;
    } finally {
      setPendingDownloadSubmissionIds((previous) =>
        previous.filter((currentId) => currentId !== submissionId),
      );
    }
  }

  async function runAutoQueue(targetTabId: string) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab || !tab.autoQueueEnabled || tab.autoQueuePhase !== "idle") {
      return;
    }
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      autoQueuePhase: "searching",
      autoQueueNextRunAt: Date.now() + AUTO_QUEUE_INTERVAL_MS,
    }));
    const response = await handleSearch(1, targetTabId);
    if (!response) {
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        autoQueuePhase: "idle",
      }));
      return;
    }

    const submissionIds = response.results
      .map((result) => result.submissionId)
      .filter(
        (submissionId) =>
          !unavailableSubmissionIdsRef.current.has(submissionId),
      );
    if (submissionIds.length === 0) {
      updateTab(targetTabId, (currentTab) => ({
        ...currentTab,
        autoQueuePhase: "idle",
      }));
      return;
    }

    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      autoQueuePhase: "queueing",
    }));
    await handleDownloadSubmissions(submissionIds, targetTabId);
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      autoQueuePhase: "idle",
      autoQueueNextRunAt: Date.now() + AUTO_QUEUE_INTERVAL_MS,
    }));
  }

  async function handleCancelSubmission(submissionId: string) {
    if (!submissionId) {
      return;
    }
    setPendingDownloadSubmissionIds((previous) =>
      previous.filter((value) => value !== submissionId),
    );
    try {
      applyQueueSnapshot(
        cancelSubmissionInQueueSnapshot(queueRef.current, submissionId),
      );
      applyQueueSnapshot(await backend.cancelSubmission(submissionId));
    } catch (error) {
      const message = getErrorMessage(error, "Failed to cancel download.");
      updateQueueMessage(message);
      pushErrorToast(message, "cancel-submission-error");
    }
  }

  async function handleRetryDownload(jobId: string) {
    if (!jobId) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.retryDownload(jobId));
      updateQueueMessage(
        "Retrying failed download.",
        "success",
        "retry-download-success",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Failed to retry download.");
      updateQueueMessage(message);
      pushErrorToast(message, "retry-download-error");
    }
  }

  async function handleRetrySubmission(submissionId: string) {
    if (!submissionId) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.retrySubmission(submissionId));
      updateQueueMessage(
        "Retrying failed submission.",
        "success",
        "retry-submission-success",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Failed to retry submission.");
      updateQueueMessage(message);
      pushErrorToast(message, "retry-submission-error");
    }
  }

  async function handleCancelDownload(jobId: string) {
    if (!jobId) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.cancelDownload(jobId));
      updateQueueMessage(
        "Stopped file download.",
        "success",
        "cancel-download-success",
      );
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to stop the file download.",
      );
      updateQueueMessage(message);
      pushErrorToast(message, "cancel-download-error");
    }
  }

  async function handleOpenQueuedJobInFolder(jobId: string) {
    if (!jobId) {
      return;
    }
    try {
      await backend.openJobInFolder(jobId);
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Could not open the downloaded file.",
      );
      updateQueueMessage(message);
      pushErrorToast(message, "open-queued-job-folder-error");
    }
  }

  async function handleRedownloadJob(jobId: string) {
    if (!jobId) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.redownloadJob(jobId));
      updateQueueMessage(
        "Redownloading file.",
        "success",
        "redownload-job-success",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Failed to redownload the file.");
      updateQueueMessage(message);
      pushErrorToast(message, "redownload-job-error");
    }
  }

  async function handleRedownloadSubmission(submissionId: string) {
    if (!submissionId) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.redownloadSubmission(submissionId));
      updateQueueMessage(
        "Redownloading submission files.",
        "success",
        "redownload-submission-success",
      );
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to redownload the submission.",
      );
      if (
        message.includes("submission jobs not found") &&
        (await handleForceRedownloadSubmission(submissionId))
      ) {
        return;
      }
      updateQueueMessage(message);
      pushErrorToast(message, "redownload-submission-error");
    }
  }

  async function handleDeleteQueuedJob(jobId: string) {
    if (!jobId) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.deleteJob(jobId));
      updateQueueMessage(
        "Deleted queue item.",
        "success",
        "delete-queue-job-success",
      );
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to delete the queue item.",
      );
      updateQueueMessage(message);
      pushErrorToast(message, "delete-queue-job-error");
    }
  }

  async function handleDeleteQueuedSubmission(submissionId: string) {
    if (!submissionId) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.deleteSubmissionJobs(submissionId));
      updateQueueMessage(
        "Deleted submission jobs.",
        "success",
        "delete-queue-submission-success",
      );
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to delete the submission jobs.",
      );
      updateQueueMessage(message);
      pushErrorToast(message, "delete-queue-submission-error");
    }
  }

  async function handleRetryAllDownloads() {
    if (!canRetryAllDownloads) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.retryAllDownloads());
      updateQueueMessage(
        "Retrying all failed downloads.",
        "success",
        "retry-all-downloads-success",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Failed to retry all downloads.");
      updateQueueMessage(message);
      pushErrorToast(message, "retry-all-downloads-error");
    }
  }

  async function handlePauseAllDownloads() {
    if (!canPauseAllDownloads) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.pauseAllDownloads());
      updateQueueMessage(
        "Pausing queued and active downloads.",
        "success",
        "pause-all-downloads-success",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Failed to pause downloads.");
      updateQueueMessage(message);
      pushErrorToast(message, "pause-all-downloads-error");
    }
  }

  async function handleResumeAllDownloads() {
    if (!canResumeAllDownloads) {
      return;
    }
    try {
      applyQueueSnapshot(await backend.resumeAllDownloads());
      updateQueueMessage(
        "Resuming queued downloads.",
        "success",
        "resume-all-downloads-success",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Failed to resume downloads.");
      updateQueueMessage(message);
      pushErrorToast(message, "resume-all-downloads-error");
    }
  }

  async function handleStopAllDownloads() {
    if (!canStopAllDownloads) {
      return;
    }
    setPendingDownloadSubmissionIds([]);
    try {
      applyQueueSnapshot(cancelAllInQueueSnapshot(queueRef.current));
      applyQueueSnapshot(await backend.stopAllDownloads());
      updateQueueMessage(
        "Stopping all active and queued downloads.",
        "success",
        "queue-stop-all",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Failed to stop downloads.");
      updateQueueMessage(message);
      pushErrorToast(message, "stop-all-downloads-error");
    }
  }

  function handleMaxActiveChange(maxActive: number) {
    const nextMaxActive = clampConcurrentDownloads(maxActive);
    if (nextMaxActive === settingsRef.current.maxActive) {
      return;
    }
    void persistSettings({ maxActive: nextMaxActive });
  }

  function handleToggleRating(index: number) {
    if (!sessionRef.current.hasSession) {
      return;
    }
    const nextMask = toggleRatingMask(sessionRef.current.ratingsMask, index);
    if (nextMask === sessionRef.current.ratingsMask) {
      return;
    }
    const targetTabId = activeTabIdRef.current;
    const optimisticSession = { ...sessionRef.current, ratingsMask: nextMask };
    sessionRef.current = optimisticSession;
    setSession(optimisticSession);
    updateTab(targetTabId, (currentTab) => ({
      ...currentTab,
      searchError: "",
    }));
    pendingRatingsMaskRef.current = nextMask;
    if (ratingDebounceRef.current !== null) {
      window.clearTimeout(ratingDebounceRef.current);
    }
    ratingDebounceRef.current = window.setTimeout(() => {
      const targetMask = pendingRatingsMaskRef.current;
      setRatingUpdating(true);
      backend
        .updateRatings(targetMask)
        .then((nextSession) => {
          applySession(nextSession);
          pendingRatingsMaskRef.current = nextSession.ratingsMask;
        })
        .catch((error: unknown) => {
          const message = getErrorMessage(error, "Unable to update ratings.");
          updateTab(targetTabId, (currentTab) => ({
            ...currentTab,
            searchError: message,
          }));
          pushErrorToast(message, "ratings-error");
          backend
            .getSession()
            .then((currentSession) => {
              applySession(currentSession);
              pendingRatingsMaskRef.current = currentSession.ratingsMask;
            })
            .catch(() => undefined);
        })
        .finally(() => {
          setRatingUpdating(false);
          ratingDebounceRef.current = null;
        });
    }, 350);
  }

  function handleUpdateSelection(
    mode: "all" | "none" | "invert",
    targetTabId?: string,
  ) {
    const resolvedTabId =
      typeof targetTabId === "string" ? targetTabId : activeTabIdRef.current;
    const tab = tabsRef.current.find((item) => item.id === resolvedTabId);
    if (!tab || tab.results.length === 0) {
      return;
    }
    const selectableResultIds = tab.results
      .map((item) => item.submissionId)
      .filter((submissionId) => !downloadedSubmissionIds.has(submissionId));
    const allSelected =
      selectableResultIds.length > 0 &&
      selectableResultIds.every((submissionId) =>
        tab.selectedSubmissionIds.includes(submissionId),
      );

    const nextSelectedSubmissionIds =
      mode === "all"
        ? selectableResultIds
        : mode === "none"
          ? []
          : selectableResultIds.filter(
              (submissionId) =>
                !tab.selectedSubmissionIds.includes(submissionId),
            );

    updateTab(resolvedTabId, (currentTab) => ({
      ...currentTab,
      selectedSubmissionIds:
        mode === "all" && allSelected
          ? currentTab.selectedSubmissionIds
          : nextSelectedSubmissionIds,
    }));
  }

  function handleToggleSelectAll(targetTabId?: string) {
    const resolvedTabId =
      typeof targetTabId === "string" ? targetTabId : activeTabIdRef.current;
    const tab = tabsRef.current.find((item) => item.id === resolvedTabId);
    if (!tab || tab.results.length === 0) {
      return;
    }
    const selectableResultIds = tab.results
      .map((item) => item.submissionId)
      .filter((submissionId) => !downloadedSubmissionIds.has(submissionId));
    const allSelected =
      selectableResultIds.length > 0 &&
      selectableResultIds.every((submissionId) =>
        tab.selectedSubmissionIds.includes(submissionId),
      );

    handleUpdateSelection(allSelected ? "none" : "all", resolvedTabId);
  }

  return (
    <div
      className={`theme-switch min-h-screen transition-colors duration-300 mobile-zoom ${settings.darkMode ? "dark theme-dark" : "theme-light"} ${!settings.motionEnabled ? "motion-reduced" : ""}`}
    >
      <style>{GLOBAL_STYLES}</style>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <StarBackground
        darkMode={settings.darkMode}
        motionEnabled={settings.motionEnabled}
      />
      <div
        className="theme-shell min-h-screen overflow-x-hidden font-sans text-[var(--theme-text)] selection:bg-[var(--theme-accent)] selection:text-white transition-colors duration-300"
        onContextMenu={(event) => {
          event.preventDefault();
          setShellContextMenu({
            x: event.clientX,
            y: event.clientY,
            confirmReset: false,
          });
        }}
      >
        <NavigationPill
          darkMode={settings.darkMode}
          motionEnabled={settings.motionEnabled}
          tabsOpen={tabMenuOpen}
          session={session}
          unreadTotal={unreadTotal}
          newUnreadCount={newUnreadCount}
          unreadActive={unreadModeActive}
          onToggleDarkMode={() =>
            void persistSettings({ darkMode: !settings.darkMode })
          }
          onToggleMotion={() =>
            void persistSettings({ motionEnabled: !settings.motionEnabled })
          }
          onToggleTabs={() => setTabMenuOpen((current) => !current)}
          onOpenUnread={() => void handleOpenUnreadTab()}
          onOpenLogin={() => setLoginOpen(true)}
          onLogout={() => void handleLogout()}
        />
        <BubbleMenu
          open={tabMenuOpen}
          items={sessionMenuItems}
          onSelect={(tabId) => {
            setActiveTabId(tabId);
            setTabMenuOpen(false);
          }}
          onClose={handleCloseTab}
          onAdd={handleAddTab}
          onOpenChange={setTabMenuOpen}
        />
        <OnboardingTour
          open={tourOpen}
          step={currentTourStep}
          motionEnabled={settings.motionEnabled}
          anchorRefreshKey={tourAnchorRefreshKey}
          isAdvancing={tourAdvancing}
          onAdvance={handleTourAdvance}
          onSkip={stopTutorial}
        />
        <LoginModal
          open={loginOpen}
          session={session}
          username={loginUsername}
          password={loginPassword}
          loading={authLoading}
          error={authError}
          teachMeChecked={loginTeachMe}
          onChangeUsername={setLoginUsername}
          onChangePassword={setLoginPassword}
          onChangeTeachMe={setLoginTeachMe}
          onClose={() => setLoginOpen(false)}
          onSubmit={() => void handleLogin()}
        />
        <main className="relative z-10 pt-8 md:pt-32 max-w-[1560px] mx-auto pb-20 px-4 md:px-8 space-y-8">
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SearchWorkspace
              session={session}
              searchParams={activeSearchParams}
              artistDraft={activeArtistDraft}
              artistAvatarUrls={activeTab?.artistAvatars ?? {}}
              artistValidation={activeTab?.artistValidation ?? {}}
              mode={activeTab?.mode ?? "default"}
              keywordSuggestions={keywordSuggestions}
              artistSuggestions={artistSuggestions}
              favoriteSuggestions={favoriteSuggestions}
              watchingCount={watchingUsers?.length ?? 0}
              watchingLoading={watchingLoading}
              loading={activeSearchBusy}
              searchButtonMode={activeSearchButtonMode}
              searchButtonLabel={activeSearchButtonLabel}
              searchButtonDisabled={activeSearchButtonDisabled}
              autoQueueEnabled={activeTab?.autoQueueEnabled ?? false}
              ratingUpdating={ratingUpdating}
              collapsed={activeSearchCollapsed}
              error={activeSearchError}
              onChange={(updater) => {
                if (!activeTab) {
                  return;
                }
                markWorkspaceInputEdit(activeTab.id);
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  searchParams: normalizeSearchParamsForMode(
                    applyFavoriteSearchDefaultOrder(
                      currentTab.searchParams,
                      clearKeywordSearchSelectionOnQueryChange(
                        currentTab.searchParams,
                        updater(currentTab.searchParams),
                      ),
                      currentTab.mode,
                    ),
                    currentTab.mode,
                    sessionRef.current,
                    settingsRef.current,
                  ),
                }));
              }}
              onArtistDraftChange={(value) => {
                if (!activeTab) {
                  return;
                }
                markWorkspaceInputEdit(activeTab.id);
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  artistDraft: value,
                }));
              }}
              onAddArtist={(value) => {
                if (!activeTab) {
                  return;
                }
                const matchedSuggestion =
                  typeof value === "string"
                    ? findExactUsernameSuggestion(value, artistSuggestions)
                    : value;
                const artistName =
                  typeof value === "string"
                    ? value
                    : value.username || value.value;
                if (!normalizeArtistToken(artistName)) {
                  return;
                }
                markWorkspaceInputEdit(activeTab.id);
                updateTab(activeTab.id, (currentTab) =>
                  commitArtistSelection(currentTab, artistName, {
                    avatarUrl: matchedSuggestion?.avatarUrl || "",
                    validation: matchedSuggestion ? "valid" : "pending",
                  }),
                );
                if (typeof value === "string" && !matchedSuggestion) {
                  resolveArtistIdentity(activeTab.id, artistName);
                }
              }}
              onRemoveArtist={(value) => {
                if (!activeTab) {
                  return;
                }
                markWorkspaceInputEdit(activeTab.id);
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  searchParams: {
                    ...currentTab.searchParams,
                    artistNames: currentTab.searchParams.artistNames.filter(
                      (artist) =>
                        normalizeArtistToken(artist) !==
                        normalizeArtistToken(value),
                    ),
                  },
                  artistAvatars: Object.fromEntries(
                    Object.entries(currentTab.artistAvatars).filter(
                      ([artist]) => artist !== normalizeArtistToken(value),
                    ),
                  ),
                  artistValidation: Object.fromEntries(
                    Object.entries(currentTab.artistValidation).filter(
                      ([artist]) => artist !== normalizeArtistToken(value),
                    ),
                  ),
                }));
              }}
              onToggleMyWatches={() => void handleToggleWatchingArtists()}
              onSearch={() => void handleSearchAction()}
              onStopSearch={() => void stopActiveSearch()}
              onDisableUnreadMode={() => void handleDisableUnreadMode()}
              onClearForm={() => handleClearSearchForm()}
              onNewTab={handleAddTab}
              onToggleAutoQueue={(enabled) => handleToggleAutoQueue(enabled)}
              onToggleCollapse={() => {
                if (!activeTab) {
                  return;
                }
                markWorkspaceInputEdit(activeTab.id);
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  searchCollapsed: !currentTab.searchCollapsed,
                }));
              }}
              onToggleRating={(index) => void handleToggleRating(index)}
            />
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${activeSearchCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}
            >
              <div
                className={
                  activeSearchCollapsed ? "overflow-hidden" : "overflow-visible"
                }
              >
                <AccountSidebar
                  session={session}
                  settings={settings}
                  capabilities={backend.capabilities}
                  remoteAccessInfo={remoteAccessInfo}
                  remoteAccessLoading={remoteAccessLoading}
                  canOpenDownloadFolder={backend.capabilities.openLocalPaths}
                  folderPreviewImages={folderPreviewImages}
                  searchParams={activeSearchParams}
                  onNotify={pushToast}
                  onLogout={() => void handleLogout()}
                  onEnableRemoteAccess={() => void handleEnableRemoteAccess()}
                  onDisableRemoteAccess={() => void handleDisableRemoteAccess()}
                  onSelectRemoteAccessHost={(host) =>
                    void handleSelectRemoteAccessHost(host)
                  }
                  onPickDirectory={() =>
                    void backend
                      .pickDownloadDirectory()
                      .then((directory) => {
                        if (!directory) {
                          return;
                        }
                        void persistSettings({ downloadDirectory: directory });
                        pushToast({
                          level: "success",
                          message: `Download folder set to ${directory}.`,
                          dedupeKey: "download-folder-success",
                        });
                      })
                      .catch((error: unknown) => {
                        const message = getErrorMessage(
                          error,
                          "Could not open folder picker.",
                        );
                        updateQueueMessage(message);
                        pushErrorToast(message, "download-folder-picker-error");
                      })
                  }
                  onOpenDownloadFolder={() => {
                    backend.openDownloadDirectory().catch((error: unknown) => {
                      const message = getErrorMessage(
                        error,
                        "Could not open the download folder.",
                      );
                      updateQueueMessage(message);
                      pushErrorToast(message, "open-download-folder-error");
                    });
                  }}
                  onToggleSaveKeywords={(checked) => {
                    if (!activeTab) {
                      return;
                    }
                    markWorkspaceInputEdit(activeTab.id);
                    updateTab(activeTab.id, (currentTab) => ({
                      ...currentTab,
                      searchParams: {
                        ...currentTab.searchParams,
                        saveKeywords: checked,
                      },
                    }));
                  }}
                  onDownloadPatternCommit={(downloadPattern) => {
                    void persistSettings({ downloadPattern });
                  }}
                />
              </div>
            </div>
          </div>
          <div ref={resultsRef}>
            <ResultsShowcase
              searchResponse={activeSearchResponse}
              results={activeResults}
              unreadModeActive={unreadModeActive}
              activeSubmissionId={activeSubmissionId}
              selectedSubmissionIds={activeSelectedSubmissionIds}
              showCustomThumbnails={activeTab?.showCustomThumbnails ?? true}
              showSubmissionDetails={activeTab?.showSubmissionDetails ?? true}
              showEngagementStats
              allSelected={allResultsSelected}
              loading={activeSearchBusy}
              searchPhase={activeSearchPhase}
              searchActivity={activeSearchActivity}
              loadMoreState={activeLoadMoreState}
              resultsRefreshToken={activeResultsRefreshToken}
              queue={queue}
              canStopAll={canStopAllDownloads}
              downloadedSubmissionIds={downloadedSubmissionIds}
              pendingDownloadSubmissionIds={pendingDownloadSubmissionIds}
              downloadButtonMode={activeDownloadButtonMode}
              downloadButtonLabel={activeDownloadButtonLabel}
              downloadButtonDisabled={activeDownloadButtonDisabled}
              onPanelPreviewImagesChange={setPanelPreviewImages}
              onSelectActive={(submissionId) => {
                if (!activeTab) {
                  return;
                }
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  activeSubmissionId: submissionId,
                }));
              }}
              onSelectAll={() => handleUpdateSelection("all")}
              onDeselectAll={() => handleUpdateSelection("none")}
              onInvertSelection={() => handleUpdateSelection("invert")}
              onToggleSelection={(submissionId) => {
                if (!activeTab) {
                  return;
                }
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  selectedSubmissionIds:
                    currentTab.selectedSubmissionIds.includes(submissionId)
                      ? currentTab.selectedSubmissionIds.filter(
                          (value) => value !== submissionId,
                        )
                      : [...currentTab.selectedSubmissionIds, submissionId],
                }));
              }}
              onShowCustomThumbnailsChange={(enabled) => {
                if (!activeTab) {
                  return;
                }
                markWorkspaceInputEdit(activeTab.id);
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  showCustomThumbnails: enabled,
                }));
              }}
              onShowSubmissionDetailsChange={(enabled) => {
                if (!activeTab) {
                  return;
                }
                markWorkspaceInputEdit(activeTab.id);
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  showSubmissionDetails: enabled,
                }));
              }}
              onDownloadSubmission={(submissionId) =>
                void handleDownloadSubmissions([submissionId])
              }
              onCancelSubmission={(submissionId) =>
                void handleCancelSubmission(submissionId)
              }
              onRetrySubmission={(submissionId) =>
                void handleRetrySubmission(submissionId)
              }
              onRedownloadSubmission={(submissionId) =>
                void handleRedownloadSubmission(submissionId)
              }
              onStopAll={() => void handleStopAllDownloads()}
              onRefresh={() => void handleRefreshSearch()}
              onStopSearch={() => void stopActiveSearch()}
              onDisableUnreadMode={() => void handleDisableUnreadMode()}
              onStartNewSearch={handleAddTab}
              onDownloadAction={() => void handleQueueDownloads()}
              onLoadMore={() => void handleLoadMore("more")}
              onLoadAll={() => void handleLoadMore("all")}
              onStopLoadMore={() => void handleStopLoadMore()}
              onSearchArtist={(username, avatarUrl) =>
                void handleArtistSearch(username, avatarUrl)
              }
              onSearchFavoritesBy={(username) =>
                void handleFavoritesSearch(username)
              }
              onSearchKeyword={(keywordId, keywordName) =>
                void handleKeywordSearch(keywordId, keywordName)
              }
              onOpenJobInFolder={(jobId) =>
                void handleOpenQueuedJobInFolder(jobId)
              }
            />
          </div>
          <DownloadQueuePanel
            queue={queue}
            message={queueMessage}
            maxActive={settings.maxActive}
            selectedCount={activeSelectedSubmissionIds.length}
            canQueueDownloads={
              Boolean(activeSearchResponse) &&
              activeSelectedSubmissionIds.length > 0
            }
            canStopAll={canStopAllDownloads}
            canPauseAll={canPauseAllDownloads}
            canResumeAll={canResumeAllDownloads}
            canRetryAll={canRetryAllDownloads}
            allSelected={allResultsSelected}
            autoClearCompleted={settings.autoClearCompleted}
            canOpenDownloadFolder={backend.capabilities.openLocalPaths}
            canManageQueueJobs={backend.isDesktopRuntime}
            folderPreviewImages={folderPreviewImages}
            onOpenDownloadFolder={() => {
              backend.openDownloadDirectory().catch((error: unknown) => {
                const message = getErrorMessage(
                  error,
                  "Could not open the download folder.",
                );
                updateQueueMessage(message);
                pushErrorToast(message, "open-download-folder-error");
              });
            }}
            onClearQueue={() => {
              backend
                .clearQueue()
                .then((snapshot) => {
                  applyQueueSnapshot(snapshot);
                  setPendingDownloadSubmissionIds([]);
                  updateQueueMessage(
                    "Queue cleared.",
                    "success",
                    "queue-cleared",
                  );
                })
                .catch((error: unknown) => {
                  const message = getErrorMessage(
                    error,
                    "Could not clear the queue.",
                  );
                  updateQueueMessage(message);
                  pushErrorToast(message, "queue-clear-error");
                });
            }}
            onClearCompleted={() => void handleClearCompleted()}
            onQueueDownloads={() => void handleQueueDownloads()}
            onRetryAll={() => void handleRetryAllDownloads()}
            onPauseAll={() => void handlePauseAllDownloads()}
            onResumeAll={() => void handleResumeAllDownloads()}
            onStopAll={() => void handleStopAllDownloads()}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleAutoClearCompleted={(enabled) =>
              void persistSettings({ autoClearCompleted: enabled })
            }
            onMaxActiveChange={handleMaxActiveChange}
            onOpenJobInFolder={(jobId) =>
              void handleOpenQueuedJobInFolder(jobId)
            }
            onCancel={(jobId) => void handleCancelDownload(jobId)}
            onCancelSubmission={(submissionId) =>
              void handleCancelSubmission(submissionId)
            }
            onRetry={(jobId) => void handleRetryDownload(jobId)}
            onRedownloadJob={(jobId) => void handleRedownloadJob(jobId)}
            onRedownloadSubmission={(submissionId) =>
              void handleRedownloadSubmission(submissionId)
            }
            onDeleteJob={(jobId) => void handleDeleteQueuedJob(jobId)}
            onDeleteSubmission={(submissionId) =>
              void handleDeleteQueuedSubmission(submissionId)
            }
            onSearchArtist={(username) => void handleArtistSearch(username)}
            onSearchFavoritesBy={(username) =>
              void handleFavoritesSearch(username)
            }
          />
        </main>
        <ContextMenu
          opened={shellContextMenu !== null}
          position={shellContextMenu}
          sections={shellContextSections}
          onClose={() => setShellContextMenu(null)}
        />
      </div>
    </div>
  );
}

function getToastDuration(level: ToastItem["level"], retryAfterMs?: number) {
  const base =
    level === "error"
      ? 6500
      : level === "warning"
        ? 5500
        : level === "success"
          ? 3500
          : 4000;
  return Math.max(base, (retryAfterMs ?? 0) + 1200);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string") {
    return error.trim() || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (error && typeof error === "object") {
    const withMessage = error as { message?: unknown; error?: unknown };
    if (typeof withMessage.message === "string" && withMessage.message.trim()) {
      return withMessage.message.trim();
    }
    if (typeof withMessage.error === "string" && withMessage.error.trim()) {
      return withMessage.error.trim();
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // ignore serialization errors
    }
  }
  return fallback;
}

function isRateLimitMessage(message: string) {
  const value = message.toLowerCase();
  return (
    value.includes("rate limiting") ||
    (value.includes("429") && value.includes("inkbunny"))
  );
}

function isSearchCancellationError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return (
    message === "context canceled" ||
    message.includes("context canceled") ||
    message.includes("operation was canceled")
  );
}

function clampConcurrentDownloads(value: number) {
  return Math.min(
    MAX_CONCURRENT_DOWNLOADS,
    Math.max(MIN_CONCURRENT_DOWNLOADS, Math.round(value)),
  );
}

function getSuggestionQuery(query: string) {
  const trimmed = query.trimEnd();
  if (!trimmed) {
    return "";
  }
  const token = trimmed.split(/\s+/).pop() ?? "";
  return token.startsWith("-") ? token.slice(1) : token;
}

function toggleRatingMask(mask: string, index: number) {
  const characters = normalizeRatingsMask(mask).split("");
  characters[index] = characters[index] === "1" ? "0" : "1";
  if (!characters.includes("1")) {
    characters[index] = "1";
  }
  return characters.join("");
}

function normalizeRatingsMask(mask: string) {
  const base = mask.padEnd(5, "0").slice(0, 5);
  return base.includes("1") ? base : "10000";
}

function mergeSubmissionIds(existing: string[], next: string[]) {
  return [...new Set([...existing, ...next])];
}

function mergeHydratedSearchResults(
  tabs: SearchTabState[],
  update: SearchResultsHydratedUpdate,
) {
  const hydratedResultsById = new Map(
    update.results.map((result) => [result.submissionId, result]),
  );
  if (hydratedResultsById.size === 0) {
    return tabs;
  }

  let changed = false;
  const nextTabs = tabs.map((tab) => {
    if (tab.searchResponse?.searchId !== update.searchId) {
      return tab;
    }

    let tabChanged = false;
    const nextResults = tab.results.map((result) => {
      const hydrated = hydratedResultsById.get(result.submissionId);
      if (!hydrated || areSubmissionCardsEqual(result, hydrated)) {
        return result;
      }
      tabChanged = true;
      return hydrated;
    });

    if (!tabChanged) {
      return tab;
    }

    changed = true;
    return {
      ...tab,
      results: nextResults,
      searchResponse: tab.searchResponse
        ? {
            ...tab.searchResponse,
            results: mergeHydratedResultsIntoSearchResponse(
              tab.searchResponse.results,
              hydratedResultsById,
            ),
          }
        : tab.searchResponse,
    };
  });

  return changed ? nextTabs : tabs;
}

function mergeHydratedResultsIntoSearchResponse(
  results: SubmissionCard[],
  hydratedResultsById: ReadonlyMap<string, SubmissionCard>,
) {
  let changed = false;
  const nextResults = results.map((result) => {
    const hydrated = hydratedResultsById.get(result.submissionId);
    if (!hydrated || areSubmissionCardsEqual(result, hydrated)) {
      return result;
    }
    changed = true;
    return hydrated;
  });
  return changed ? nextResults : results;
}

function areSubmissionCardsEqual(left: SubmissionCard, right: SubmissionCard) {
  return (
    JSON.stringify(denormalizeSubmissionCard(left)) ===
    JSON.stringify(denormalizeSubmissionCard(right))
  );
}

function getAutoSelectedSubmissionIds(
  results: SubmissionCard[],
  downloadedSubmissionIds: Set<string>,
  autoSelectAll = false,
) {
  if (!autoSelectAll) {
    return [];
  }
  return results
    .map((item) => item.submissionId)
    .filter((submissionId) => !downloadedSubmissionIds.has(submissionId));
}

function getCompletedQueueSubmissionIds(queue: QueueSnapshot) {
  const completedBySubmission = new Map<string, boolean>();
  for (const job of queue.jobs) {
    if (!job.submissionId) {
      continue;
    }
    const current = completedBySubmission.get(job.submissionId);
    if (job.status === "completed" && job.fileExists) {
      completedBySubmission.set(job.submissionId, current ?? true);
      continue;
    }
    completedBySubmission.set(job.submissionId, false);
  }
  return new Set(
    [...completedBySubmission.entries()]
      .filter(([, completed]) => completed)
      .map(([submissionId]) => submissionId),
  );
}

function formatCountLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function getUnavailableSubmissionIds(
  queue: QueueSnapshot,
  pendingDownloadSubmissionIds: string[],
  downloadedSubmissionIds: Set<string>,
) {
  const unavailable = new Set([
    ...pendingDownloadSubmissionIds,
    ...downloadedSubmissionIds,
  ]);
  for (const job of queue.jobs) {
    if (!job.submissionId) {
      continue;
    }
    if (
      job.status === "queued" ||
      job.status === "active" ||
      (job.status === "completed" && job.fileExists)
    ) {
      unavailable.add(job.submissionId);
    }
  }
  return unavailable;
}

function getDownloadedSubmissionIds(
  tabs: SearchTabState[],
  completedQueueSubmissionIds: Set<string>,
) {
  const downloaded = new Set(completedQueueSubmissionIds);
  for (const tab of tabs) {
    for (const result of tab.results) {
      if (result.downloaded) {
        downloaded.add(result.submissionId);
      }
    }
  }
  return downloaded;
}

function getRecentCompletedPreviewImages(
  queue: QueueSnapshot,
  tabs: SearchTabState[],
) {
  const previewBySubmission = buildSubmissionPreviewMap(tabs);
  const sortedCompletedJobs = [...queue.jobs]
    .filter((job) => job.status === "completed" && job.fileExists)
    .sort((left, right) => compareIsoDates(right.updatedAt, left.updatedAt));

  const previews: string[][] = [];
  for (const job of sortedCompletedJobs) {
    const previewSources = dedupePreviewSources([
      ...(job.previewUrl ? [job.previewUrl] : []),
      ...(previewBySubmission.get(job.submissionId) ?? []),
    ]);
    if (previewSources.length === 0) {
      continue;
    }
    previews.push(previewSources);
  }

  return dedupePreviewImageSets(previews).slice(0, 3);
}

function buildSubmissionPreviewMap(tabs: SearchTabState[]) {
  const previewBySubmission = new Map<string, string[]>();
  for (const tab of tabs) {
    for (const result of tab.results) {
      if (previewBySubmission.has(result.submissionId)) {
        continue;
      }
      const previewSources = getSubmissionPreviewSources(result);
      if (previewSources.length === 0) {
        continue;
      }
      previewBySubmission.set(result.submissionId, previewSources);
    }
  }
  return previewBySubmission;
}

function getSubmissionPreviewSources(submission: SubmissionCard) {
  return dedupePreviewSources([
    submission.thumbnailUrlHuge || "",
    submission.thumbnailUrlLarge || "",
    submission.thumbnailUrlMedium || "",
    submission.thumbnailUrlHugeNonCustom || "",
    submission.thumbnailUrlLargeNonCustom || "",
    submission.thumbnailUrlMediumNonCustom || "",
    submission.thumbnailUrl || "",
    submission.latestThumbnailUrl || "",
  ]);
}

function compareIsoDates(left: string, right: string) {
  return Date.parse(left || "") - Date.parse(right || "");
}

function dedupePreviewSources(sources: unknown) {
  if (!Array.isArray(sources)) {
    return typeof sources === "string" && sources ? [sources] : [];
  }

  return [
    ...new Set(
      sources.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  ];
}

function dedupePreviewImageSets(imageSets: unknown) {
  if (!Array.isArray(imageSets)) {
    return [];
  }

  const seen = new Set<string>();
  const unique: string[][] = [];
  const legacyFlatSources: string[] = [];

  for (const imageSet of imageSets) {
    if (typeof imageSet === "string") {
      legacyFlatSources.push(imageSet);
      continue;
    }

    const normalized = dedupePreviewSources(imageSet);
    if (normalized.length === 0) {
      continue;
    }
    const key = normalized.join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
  }

  const normalizedLegacySet = dedupePreviewSources(legacyFlatSources);
  if (normalizedLegacySet.length > 0) {
    const legacyKey = normalizedLegacySet.join("|");
    if (!seen.has(legacyKey)) {
      unique.push(normalizedLegacySet);
    }
  }

  return unique;
}

function getPreviewImageSetsKey(imageSets: string[][]) {
  return JSON.stringify(imageSets);
}

function arePreviewImageSetsEqual(left: string[][], right: string[][]) {
  return (
    left.length === right.length &&
    left.every((value, index) =>
      areStringArraysEqual(value, right[index] ?? []),
    )
  );
}

function writeBackendDebugEvent(event: BackendDebugEvent) {
  const prefix = `[backend][${event.scope}] ${event.timestamp} ${event.message}`;
  const fields =
    event.fields && Object.keys(event.fields).length > 0
      ? event.fields
      : undefined;
  if (event.level === "error") {
    console.error(prefix, fields ?? "");
    return;
  }
  if (event.level === "warn") {
    console.warn(prefix, fields ?? "");
    return;
  }
  if (event.level === "info") {
    console.info(prefix, fields ?? "");
    return;
  }
  console.debug(prefix, fields ?? "");
}

function mergeDownloadedSubmissionIds(
  existing: Set<string>,
  results: SubmissionCard[],
) {
  const merged = new Set(existing);
  for (const result of results) {
    if (result.downloaded) {
      merged.add(result.submissionId);
    }
  }
  return merged;
}

function normalizeArtistToken(value: string) {
  return value.trim().toLowerCase();
}

function findExactUsernameSuggestion(
  value: string,
  suggestions: UsernameSuggestion[],
) {
  const normalizedValue = normalizeArtistToken(value);
  if (!normalizedValue) {
    return undefined;
  }
  return suggestions.find(
    (suggestion) =>
      normalizeArtistToken(suggestion.username || suggestion.value) ===
      normalizedValue,
  );
}

function commitArtistSelection(
  tab: SearchTabState,
  artistName: string,
  options: {
    avatarUrl?: string;
    validation?: ArtistValidationState;
  } = {},
): SearchTabState {
  const normalizedArtist = normalizeArtistToken(artistName);
  if (!normalizedArtist) {
    return tab;
  }

  const currentValidation = tab.artistValidation[normalizedArtist];
  const nextValidation =
    options.validation === undefined
      ? currentValidation
      : currentValidation === "valid" && options.validation !== "valid"
        ? currentValidation
        : options.validation;

  return {
    ...tab,
    artistDraft: "",
    searchParams: {
      ...tab.searchParams,
      artistNames: appendArtistNames(tab.searchParams.artistNames, artistName),
      useWatchingArtists: false,
    },
    artistAvatars:
      options.avatarUrl &&
      tab.artistAvatars[normalizedArtist] !== options.avatarUrl
        ? {
            ...tab.artistAvatars,
            [normalizedArtist]: options.avatarUrl,
          }
        : tab.artistAvatars,
    artistValidation:
      nextValidation && currentValidation !== nextValidation
        ? {
            ...tab.artistValidation,
            [normalizedArtist]: nextValidation,
          }
        : tab.artistValidation,
  };
}

function appendArtistNames(existing: string[], rawValue: string) {
  const tokens = rawValue
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return existing;
  }

  const seen = new Set(existing.map(normalizeArtistToken));
  const next = [...existing];
  for (const token of tokens) {
    const normalized = normalizeArtistToken(token);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(token);
  }
  return next;
}

function getCommittedArtistDraftName(
  searchParams: SearchParams,
  artistDraft: string,
) {
  if (searchParams.useWatchingArtists) {
    return "";
  }
  return artistDraft.trim();
}

function finalizeArtistDraft(searchParams: SearchParams, artistDraft: string) {
  const committedArtistName = getCommittedArtistDraftName(
    searchParams,
    artistDraft,
  );
  if (!committedArtistName) {
    return searchParams;
  }
  return {
    ...searchParams,
    artistNames: appendArtistNames(
      searchParams.artistNames,
      committedArtistName,
    ),
  };
}

function clearKeywordSearchSelectionOnQueryChange(
  previous: SearchParams,
  next: SearchParams,
) {
  if (previous.query === next.query) {
    return next;
  }
  return {
    ...next,
    keywordId: "",
  };
}

function formatArtistFilterLabel(artistNames: string[]) {
  if (artistNames.length === 0) {
    return "";
  }
  if (artistNames.length === 1) {
    return `@${truncateLabel(artistNames[0], 22)}`;
  }
  return `@${truncateLabel(artistNames[0], 14)} +${artistNames.length - 1}`;
}

function buildDefaultSearch(session: SessionInfo, settings: AppSettings) {
  return {
    ...DEFAULT_SEARCH,
    submissionTypes: [...DEFAULT_SEARCH.submissionTypes],
    unreadSubmissions: false,
    maxActive: settings.maxActive || DEFAULT_SEARCH.maxActive,
    maxDownloads: session.isGuest ? GUEST_DEFAULT_MAX_DOWNLOADS : 0,
  };
}

function buildUnreadSearch(session: SessionInfo, settings: AppSettings) {
  return {
    ...buildDefaultSearch(session, settings),
    unreadSubmissions: true,
  };
}

function cloneSearchParams(searchParams: SearchParams): SearchParams {
  return {
    ...searchParams,
    artistNames: [...searchParams.artistNames],
    submissionTypes: [...searchParams.submissionTypes],
  };
}

function syncSearchParamsWithSession(
  searchParams: SearchParams,
  session: SessionInfo,
  settings: AppSettings,
  mode: SearchTabMode = "default",
) {
  return normalizeSearchParamsForMode(
    {
      ...cloneSearchParams(searchParams),
      maxActive:
        settings.maxActive ||
        searchParams.maxActive ||
        DEFAULT_SEARCH.maxActive,
      maxDownloads:
        session.isGuest && searchParams.maxDownloads <= 0
          ? GUEST_DEFAULT_MAX_DOWNLOADS
          : searchParams.maxDownloads,
    },
    mode,
    session,
    settings,
  );
}

function normalizeSearchParamsForMode(
  searchParams: SearchParams,
  mode: SearchTabMode,
  session: SessionInfo,
  settings: AppSettings,
) {
  const normalizedPerPage = normalizeSearchPerPage(searchParams.perPage);
  return {
    ...cloneSearchParams(searchParams),
    orderBy: normalizeOrderByValue(
      searchParams.orderBy,
      searchParams.favoritesBy,
      mode === "unread",
    ),
    unreadSubmissions: mode === "unread",
    perPage: normalizedPerPage,
    maxActive:
      settings.maxActive || searchParams.maxActive || DEFAULT_SEARCH.maxActive,
    maxDownloads:
      session.isGuest && searchParams.maxDownloads <= 0
        ? GUEST_DEFAULT_MAX_DOWNLOADS
        : searchParams.maxDownloads,
  };
}

function applyFavoriteSearchDefaultOrder(
  previous: SearchParams,
  next: SearchParams,
  mode: SearchTabMode,
) {
  const previousFavoritesBy = previous.favoritesBy.trim();
  const nextFavoritesBy = next.favoritesBy.trim();
  if (previousFavoritesBy || !nextFavoritesBy) {
    return next;
  }

  const defaultOrderBy =
    mode === "unread" ? UNREAD_DEFAULT_ORDER_BY : DEFAULT_ORDER_BY;
  if (next.orderBy !== defaultOrderBy) {
    return next;
  }

  return {
    ...next,
    orderBy: FAVORITES_DEFAULT_ORDER_BY,
  };
}

function createSearchTab(
  session: SessionInfo,
  settings: AppSettings,
): SearchTabState {
  return {
    id: createTabId(),
    mode: "default",
    searchParams: buildDefaultSearch(session, settings),
    artistDraft: "",
    artistAvatars: {},
    artistValidation: {},
    searchResponse: null,
    results: [],
    activeSubmissionId: "",
    selectedSubmissionIds: [],
    showCustomThumbnails: true,
    showSubmissionDetails: true,
    autoQueueEnabled: false,
    trackedDownloadSubmissionIds: [],
    autoQueueNextRunAt: 0,
    searchLoading: false,
    searchPhase: "idle",
    searchActivity: "idle",
    searchCollapsed: false,
    searchError: "",
    resultsRefreshToken: 0,
    loadMoreState: createIdleLoadMoreState(),
    autoQueuePhase: "idle",
  };
}

function createUnreadSearchTab(
  session: SessionInfo,
  settings: AppSettings,
): SearchTabState {
  return {
    ...createSearchTab(session, settings),
    mode: "unread",
    searchParams: buildUnreadSearch(session, settings),
    searchCollapsed: true,
  };
}

function switchSearchTabToUnread(
  tab: SearchTabState,
  session: SessionInfo,
  settings: AppSettings,
): SearchTabState {
  return {
    ...createUnreadSearchTab(session, settings),
    id: tab.id,
  };
}

function resetSearchTab(
  tab: SearchTabState,
  session: SessionInfo,
  settings: AppSettings,
): SearchTabState {
  return { ...createSearchTab(session, settings), id: tab.id };
}

function createTabId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createIdleLoadMoreState(): SearchTabLoadMoreState {
  return {
    mode: "idle",
    pagesLoaded: 0,
  };
}

function normalizeQueueSnapshot(
  snapshot: QueueSnapshot | null | undefined,
): QueueSnapshot {
  const input: Record<string, unknown> = isRecord(snapshot) ? snapshot : {};
  const jobs = Array.isArray(input.jobs) ? input.jobs : EMPTY_QUEUE.jobs;

  return {
    jobs,
    paused: Boolean(input.paused),
    queuedCount: normalizeQueueCount(input.queuedCount, jobs, "queued"),
    activeCount: normalizeQueueCount(input.activeCount, jobs, "active"),
    completedCount: normalizeQueueCount(
      input.completedCount,
      jobs,
      "completed",
    ),
    failedCount: normalizeQueueCount(input.failedCount, jobs, "failed"),
    cancelledCount: normalizeQueueCount(
      input.cancelledCount,
      jobs,
      "cancelled",
    ),
  };
}

function normalizeQueueCount(
  value: unknown,
  jobs: QueueSnapshot["jobs"],
  status: string,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : jobs.filter((job) => job?.status === status).length;
}

function compactQueueSnapshot(
  snapshot: QueueSnapshot,
  previousSnapshot: QueueSnapshot = EMPTY_QUEUE,
): QueueSnapshot {
  const previousJobsByID = new Map(
    previousSnapshot.jobs.map((job) => [job.id, job]),
  );
  const retainedJobs: QueueSnapshot["jobs"] = [];
  let retainedCompleted = 0;
  let retainedCancelled = 0;
  let retainedCompletedPreviews = 0;

  for (const inputJob of snapshot.jobs) {
    if (!inputJob || typeof inputJob !== "object") {
      continue;
    }
    const status = inputJob.status;
    const keepCompleted =
      status === "completed" &&
      retainedCompleted < MAX_RETAINED_COMPLETED_QUEUE_JOBS;
    const keepCancelled =
      status === "cancelled" &&
      retainedCancelled < MAX_RETAINED_CANCELLED_QUEUE_JOBS;
    const keepJob =
      status === "queued" ||
      status === "active" ||
      status === "failed" ||
      keepCompleted ||
      keepCancelled;

    if (!keepJob) {
      continue;
    }

    if (status === "completed") {
      retainedCompleted++;
    } else if (status === "cancelled") {
      retainedCancelled++;
    }

    const shouldKeepPreview =
      status === "queued" ||
      status === "active" ||
      status === "failed" ||
      (status === "completed" &&
        retainedCompletedPreviews < MAX_RETAINED_COMPLETED_QUEUE_PREVIEWS);

    if (shouldKeepPreview && status === "completed" && inputJob.previewUrl) {
      retainedCompletedPreviews++;
    }

    const compactedJob = compactQueueJob(inputJob, shouldKeepPreview);
    const previousJob = previousJobsByID.get(compactedJob.id);
    retainedJobs.push(
      previousJob && areQueueJobsEqual(previousJob, compactedJob)
        ? previousJob
        : compactedJob,
    );
  }

  return {
    ...snapshot,
    jobs: retainedJobs,
  };
}

function compactQueueJob(
  job: QueueSnapshot["jobs"][number],
  keepPreview: boolean,
) {
  const previewUrl = keepPreview ? internString(job.previewUrl) : undefined;
  return {
    ...job,
    id: internString(job.id) ?? "",
    submissionId: internString(job.submissionId) ?? "",
    fileId: internString(job.fileId) ?? "",
    title: internString(job.title) ?? "",
    username: internString(job.username) ?? "",
    fileName: internString(job.fileName) ?? "",
    previewUrl,
    status: internString(job.status) ?? "",
    error: internString(job.error),
    createdAt: internString(job.createdAt) ?? "",
    updatedAt: internString(job.updatedAt) ?? "",
  };
}

function areQueueJobsEqual(
  left: QueueSnapshot["jobs"][number],
  right: QueueSnapshot["jobs"][number],
) {
  return (
    left.id === right.id &&
    left.submissionId === right.submissionId &&
    left.fileId === right.fileId &&
    left.title === right.title &&
    left.username === right.username &&
    left.fileName === right.fileName &&
    left.previewUrl === right.previewUrl &&
    left.fileExists === right.fileExists &&
    left.status === right.status &&
    left.bytesWritten === right.bytesWritten &&
    left.totalBytes === right.totalBytes &&
    left.progress === right.progress &&
    left.error === right.error &&
    left.attempt === right.attempt &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

const internedStringPool = new Map<string, string>();

function isFrontendSearchLoggingEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  const debugWindow = window as Window & {
    __inkbunnySearchDebug?: boolean;
  };
  if (debugWindow.__inkbunnySearchDebug === true) {
    return true;
  }

  try {
    return window.localStorage.getItem("inkbunny.debug.search") === "1";
  } catch {
    return false;
  }
}

function cancelSubmissionInQueueSnapshot(
  snapshot: QueueSnapshot,
  submissionId: string,
) {
  return updateQueueSnapshotJobs(snapshot, (job) =>
    job.submissionId === submissionId &&
    (job.status === "queued" || job.status === "active")
      ? {
          ...job,
          status: "cancelled",
          error: "",
          updatedAt: new Date().toISOString(),
        }
      : job,
  );
}

function cancelAllInQueueSnapshot(snapshot: QueueSnapshot) {
  return updateQueueSnapshotJobs(snapshot, (job) =>
    job.status === "queued" || job.status === "active"
      ? {
          ...job,
          status: "cancelled",
          error: "",
          updatedAt: new Date().toISOString(),
        }
      : job,
  );
}

function applyQueueJobUpdate(
  snapshot: QueueSnapshot,
  updatedJob: QueueSnapshot["jobs"][number],
) {
  let changed = false;
  const jobs = snapshot.jobs.map((job) => {
    if (job.id !== updatedJob.id) {
      return job;
    }
    if (areQueueJobsEqual(job, updatedJob)) {
      return job;
    }
    changed = true;
    return updatedJob;
  });

  if (!changed) {
    return snapshot;
  }

  return {
    ...snapshot,
    jobs,
  };
}

function updateQueueSnapshotJobs(
  snapshot: QueueSnapshot,
  updateJob: (
    job: QueueSnapshot["jobs"][number],
  ) => QueueSnapshot["jobs"][number],
) {
  let changed = false;
  const jobs = snapshot.jobs.map((job) => {
    const nextJob = updateJob(job);
    if (nextJob !== job) {
      changed = true;
    }
    return nextJob;
  });

  if (!changed) {
    return snapshot;
  }

  return normalizeQueueSnapshot({
    ...snapshot,
    jobs,
  });
}

function internString(value?: string) {
  if (!value) {
    return value;
  }
  const current = internedStringPool.get(value);
  if (current) {
    return current;
  }
  internedStringPool.set(value, value);
  return value;
}

function estimateVisibleImageBytes() {
  if (typeof document === "undefined") {
    return 0;
  }
  return Array.from(document.images).reduce((total, image) => {
    const width = image.naturalWidth || 0;
    const height = image.naturalHeight || 0;
    return total + width * height * 4;
  }, 0);
}

function getBrowserMemoryStats() {
  const performanceWithMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };
  if (
    typeof performance === "undefined" ||
    !("memory" in performanceWithMemory) ||
    !performanceWithMemory.memory
  ) {
    return null;
  }

  return {
    usedJSHeapSize: performanceWithMemory.memory.usedJSHeapSize,
    usedJSHeapLabel: formatMemoryBytes(
      performanceWithMemory.memory.usedJSHeapSize,
    ),
    totalJSHeapSize: performanceWithMemory.memory.totalJSHeapSize,
    totalJSHeapLabel: formatMemoryBytes(
      performanceWithMemory.memory.totalJSHeapSize,
    ),
    jsHeapSizeLimit: performanceWithMemory.memory.jsHeapSizeLimit,
    jsHeapSizeLimitLabel: formatMemoryBytes(
      performanceWithMemory.memory.jsHeapSizeLimit,
    ),
  };
}

function summarizeLikelyMemoryDriver(
  resultBytes: number,
  queueBytes: number,
  visibleImageBytes: number,
) {
  const buckets = [
    { key: "results", bytes: resultBytes },
    { key: "queue", bytes: queueBytes },
    { key: "visible-images", bytes: visibleImageBytes },
  ].sort((left, right) => right.bytes - left.bytes);

  return {
    bucket: buckets[0]?.key ?? "unknown",
    bucketBytes: buckets[0]?.bytes ?? 0,
    bucketLabel: formatMemoryBytes(buckets[0]?.bytes ?? 0),
  };
}

function estimateValueBytes(value: unknown): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length * 2;
  }
  if (typeof value === "number") {
    return 8;
  }
  if (typeof value === "boolean") {
    return 4;
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + estimateValueBytes(item), 0);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (total, item) => total + estimateValueBytes(item),
      0,
    );
  }
  return 0;
}

function formatMemoryBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let current = value;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex++;
  }
  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function getStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const next: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      next[key] = item;
    }
  }
  return next;
}

function isArtistValidationState(
  value: unknown,
): value is ArtistValidationState {
  return value === "pending" || value === "valid" || value === "invalid";
}

function getArtistValidationRecord(
  value: unknown,
): Record<string, ArtistValidationState> {
  if (!isRecord(value)) {
    return {};
  }
  const next: Record<string, ArtistValidationState> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isArtistValidationState(item)) {
      next[key] = item;
    }
  }
  return next;
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSearchPerPage(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_SEARCH.perPage;
  }
  return Math.min(Math.trunc(value), 100);
}

function normalizeSavedSearchParams(
  input: unknown,
  mode: SearchTabMode,
  session: SessionInfo,
  settings: AppSettings,
) {
  const value = isRecord(input) ? input : {};
  const base = {
    ...buildDefaultSearch(session, settings),
    ...value,
    keywordId: typeof value.keywordId === "string" ? value.keywordId : "",
    randomize: getBoolean(
      value.randomize,
      buildDefaultSearch(session, settings).randomize,
    ),
    artistNames: getStringArray(value.artistNames),
    submissionTypes: Array.isArray(value.submissionTypes)
      ? value.submissionTypes.filter(
          (item): item is number =>
            typeof item === "number" && Number.isFinite(item),
        )
      : [],
  };
  if (
    typeof value.orderBy !== "string" &&
    typeof value.favoritesBy === "string" &&
    value.favoritesBy.trim()
  ) {
    base.orderBy = FAVORITES_DEFAULT_ORDER_BY;
  }
  return syncSearchParamsWithSession(base, session, settings, mode);
}

function normalizeSavedSearchResponse(input: unknown, session: SessionInfo) {
  if (
    !isRecord(input) ||
    typeof input.searchId !== "string" ||
    !input.searchId.trim()
  ) {
    return null;
  }
  const results = normalizeSubmissionCards(
    Array.isArray(input.results) ? [...input.results] : [],
  );
  return {
    searchId: input.searchId,
    page: getNumber(input.page, 1),
    pagesCount: Math.max(getNumber(input.pagesCount, 1), 1),
    resultsCount: Math.max(
      getNumber(input.resultsCount, results.length),
      results.length,
    ),
    results,
    session,
  };
}

function getSearchTabLabel(tab: SearchTabState, index: number) {
  if (tab.mode === "unread") {
    return "Unread";
  }
  const { query, artistNames, useWatchingArtists, favoritesBy, poolId } =
    tab.searchParams;
  if (query.trim()) {
    return truncateLabel(query.trim(), 26);
  }
  if (useWatchingArtists) {
    return "My watches";
  }
  if (artistNames.length > 0) {
    return formatArtistFilterLabel(artistNames);
  }
  if (favoritesBy.trim()) {
    return `Fav ${truncateLabel(favoritesBy.trim(), 18)}`;
  }
  if (poolId > 0) {
    return `Pool ${poolId}`;
  }
  if (tab.searchResponse?.resultsCount) {
    return `${tab.searchResponse.resultsCount} results`;
  }
  return `Tab ${index + 1}`;
}

function getSearchTabSubtitle(
  tab: SearchTabState,
  queue: QueueSnapshot,
  pendingDownloadSubmissionIds: string[],
  autoQueueClock: number,
) {
  if (tab.autoQueueEnabled) {
    if (tab.searchLoading || tab.autoQueuePhase === "searching") {
      return "searching";
    }
    if (tab.autoQueuePhase === "queueing") {
      return "queueing";
    }
    if (hasTrackedQueueActivity(tab, queue, pendingDownloadSubmissionIds)) {
      return "downloading";
    }
    if (tab.autoQueueNextRunAt <= 0) {
      return "auto ready";
    }
    return `auto ${formatAutoQueueCountdown(tab.autoQueueNextRunAt, autoQueueClock)}`;
  }
  if (tab.mode === "unread") {
    return "new submissions";
  }
  if (tab.searchParams.useWatchingArtists) {
    return "watch list";
  }
  if (tab.searchParams.artistNames.length > 0) {
    return "artist search";
  }
  if (tab.searchParams.favoritesBy.trim()) {
    return "favorites";
  }
  if (tab.searchParams.poolId > 0) {
    return "pool";
  }
  if (tab.searchParams.query.trim()) {
    return "keywords";
  }
  if (tab.results.length > 0) {
    return `${tab.results.length} loaded`;
  }
  return "new search";
}

function buildWorkspaceState(
  tabs: SearchTabState[],
  activeTabId: string,
): WorkspaceState {
  return {
    activeTabId,
    tabs: tabs.map(toSavedSearchTab),
  };
}

function areWorkspaceStatesEqual(
  left: WorkspaceState | null | undefined,
  right: WorkspaceState | null | undefined,
) {
  return serializeWorkspaceState(left) === serializeWorkspaceState(right);
}

function serializeWorkspaceState(workspace: WorkspaceState | null | undefined) {
  return JSON.stringify(workspace ?? null);
}

function describeTransientWorkspaceState(tabs: SearchTabState[]) {
  const transientTabIds = tabs
    .filter((tab) => hasTransientWorkspaceSearchState(tab))
    .map((tab) => tab.id)
    .sort();
  if (transientTabIds.length === 0) {
    return null;
  }
  return {
    key: transientTabIds.join("|"),
    count: transientTabIds.length,
  };
}

function parseSearchSequence(searchId: string | null | undefined) {
  const trimmed = typeof searchId === "string" ? searchId.trim() : "";
  if (!trimmed) {
    return 0;
  }
  const match = /^search-(\d+)$/.exec(trimmed);
  if (!match) {
    return 0;
  }
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : 0;
}

function rememberPendingWorkspaceEcho(
  pendingRef: { current: string[] },
  workspace: WorkspaceState,
) {
  const serialized = serializeWorkspaceState(workspace);
  const nextPending = [...pendingRef.current, serialized];
  pendingRef.current =
    nextPending.length > 12
      ? nextPending.slice(nextPending.length - 12)
      : nextPending;
}

function acknowledgePendingWorkspaceEcho(
  pendingRef: { current: string[] },
  workspace: WorkspaceState,
) {
  const serialized = serializeWorkspaceState(workspace);
  const index = pendingRef.current.indexOf(serialized);
  if (index < 0) {
    return false;
  }
  pendingRef.current = pendingRef.current.filter(
    (_, currentIndex) => currentIndex !== index,
  );
  return true;
}

function toSavedSearchTab(tab: SearchTabState): SavedSearchTab {
  return {
    id: tab.id,
    mode: tab.mode,
    searchParams: cloneSearchParams(tab.searchParams),
    artistDraft: tab.artistDraft,
    artistAvatars: { ...tab.artistAvatars },
    artistValidation: { ...tab.artistValidation },
    searchResponse: tab.searchResponse
      ? {
          ...tab.searchResponse,
          results: [],
        }
      : null,
    results: denormalizeSubmissionCards(tab.results),
    activeSubmissionId: tab.activeSubmissionId,
    selectedSubmissionIds: [...tab.selectedSubmissionIds],
    searchCollapsed: tab.searchCollapsed,
    showCustomThumbnails: tab.showCustomThumbnails,
    showSubmissionDetails: tab.showSubmissionDetails,
    autoQueueEnabled: tab.autoQueueEnabled,
    trackedDownloadSubmissionIds: [...tab.trackedDownloadSubmissionIds],
    autoQueueNextRunAt: tab.autoQueueNextRunAt,
  };
}

function restoreWorkspaceTabs(
  workspace: WorkspaceState | null | undefined,
  session: SessionInfo,
  settings: AppSettings,
) {
  const restoredTabs = (workspace?.tabs ?? [])
    .map((tab) => restoreSavedSearchTab(tab, session, settings))
    .filter((tab): tab is SearchTabState => tab !== null);
  return restoredTabs.length > 0
    ? restoredTabs
    : [createSearchTab(session, settings)];
}

function mergeWorkspaceTabsWithTransientState(
  restoredTabs: SearchTabState[],
  currentTabs: SearchTabState[],
  protectedTabIds: Set<string> = new Set(),
) {
  const currentTabsById = new Map(currentTabs.map((tab) => [tab.id, tab]));
  const restoredTabIds = new Set(restoredTabs.map((tab) => tab.id));
  const mergedTabs = restoredTabs.map((restoredTab) => {
    const currentTab = currentTabsById.get(restoredTab.id);
    if (!currentTab) {
      return restoredTab;
    }

    const preserveLocalInputDraft =
      protectedTabIds.has(restoredTab.id) &&
      currentTab.mode === restoredTab.mode;
    const preserveCurrentSearchState =
      hasTransientWorkspaceSearchState(currentTab) ||
      parseSearchSequence(currentTab.searchResponse?.searchId) >
        parseSearchSequence(restoredTab.searchResponse?.searchId) ||
      (currentTab.searchResponse !== null &&
        restoredTab.searchResponse === null) ||
      (currentTab.results.length > 0 && restoredTab.results.length === 0);

    return {
      ...restoredTab,
      ...(preserveLocalInputDraft
        ? {
            searchParams: cloneSearchParams(currentTab.searchParams),
            artistDraft: currentTab.artistDraft,
            searchCollapsed: currentTab.searchCollapsed,
            showCustomThumbnails: currentTab.showCustomThumbnails,
            showSubmissionDetails: currentTab.showSubmissionDetails,
          }
        : {}),
      searchLoading: currentTab.searchLoading,
      searchError: currentTab.searchError,
      resultsRefreshToken: currentTab.resultsRefreshToken,
      loadMoreState: currentTab.loadMoreState,
      autoQueuePhase: currentTab.autoQueuePhase,
      trackedDownloadSubmissionIds: currentTab.trackedDownloadSubmissionIds,
      autoQueueNextRunAt:
        currentTab.autoQueuePhase !== "idle"
          ? currentTab.autoQueueNextRunAt
          : restoredTab.autoQueueNextRunAt,
      ...(preserveCurrentSearchState
        ? {
            searchResponse: currentTab.searchResponse,
            results: currentTab.results,
            activeSubmissionId: currentTab.activeSubmissionId,
            selectedSubmissionIds: currentTab.selectedSubmissionIds,
          }
        : {}),
    };
  });

  for (const currentTab of currentTabs) {
    if (
      !restoredTabIds.has(currentTab.id) &&
      (protectedTabIds.has(currentTab.id) ||
        hasTransientWorkspaceSearchState(currentTab))
    ) {
      mergedTabs.push(currentTab);
    }
  }

  return mergedTabs;
}

function hasTransientWorkspaceSearchState(tab: SearchTabState) {
  return (
    tab.searchLoading ||
    tab.loadMoreState.mode !== "idle" ||
    tab.autoQueuePhase === "searching"
  );
}

function resolveActiveWorkspaceTabId(
  workspace: WorkspaceState | null | undefined,
  restoredTabs: SearchTabState[],
  currentActiveTabId = "",
  protectedTabIds: Set<string> = new Set(),
) {
  const requestedId = workspace?.activeTabId ?? "";
  return restoredTabs.some((tab) => tab.id === requestedId)
    ? requestedId
    : protectedTabIds.has(currentActiveTabId) &&
        restoredTabs.some((tab) => tab.id === currentActiveTabId)
      ? currentActiveTabId
      : (restoredTabs[0]?.id ?? "");
}

function restoreSavedSearchTab(
  savedTab: SavedSearchTab,
  session: SessionInfo,
  settings: AppSettings,
): SearchTabState | null {
  const source: Record<string, unknown> = isRecord(savedTab) ? savedTab : {};
  const id = typeof source.id === "string" ? source.id.trim() : "";
  if (!id) {
    return null;
  }
  const mode: SearchTabMode = source.mode === "unread" ? "unread" : "default";
  const searchParams = normalizeSavedSearchParams(
    source.searchParams,
    mode,
    session,
    settings,
  );
  const results = normalizeSubmissionCards(
    Array.isArray(source.results) ? [...source.results] : [],
  );
  const searchResponse = normalizeSavedSearchResponse(
    source.searchResponse,
    session,
  );
  const activeSubmissionId =
    (typeof source.activeSubmissionId === "string"
      ? source.activeSubmissionId
      : "") ||
    results[0]?.submissionId ||
    "";

  return {
    id,
    mode,
    searchParams,
    artistDraft:
      typeof source.artistDraft === "string" ? source.artistDraft : "",
    artistAvatars: getStringRecord(source.artistAvatars),
    artistValidation: getArtistValidationRecord(source.artistValidation),
    searchResponse,
    results,
    activeSubmissionId,
    selectedSubmissionIds: getStringArray(source.selectedSubmissionIds),
    searchLoading: false,
    searchPhase: "idle",
    searchActivity: "idle",
    searchCollapsed: getBoolean(source.searchCollapsed, false),
    showCustomThumbnails: getBoolean(source.showCustomThumbnails, true),
    showSubmissionDetails: getBoolean(source.showSubmissionDetails, true),
    searchError: "",
    resultsRefreshToken: 0,
    loadMoreState: createIdleLoadMoreState(),
    autoQueueEnabled: getBoolean(source.autoQueueEnabled, false),
    trackedDownloadSubmissionIds: getStringArray(
      source.trackedDownloadSubmissionIds,
    ),
    autoQueueNextRunAt:
      getBoolean(source.autoQueueEnabled, false) &&
      getNumber(source.autoQueueNextRunAt, 0) > 0
        ? getNumber(source.autoQueueNextRunAt, 0)
        : 0,
    autoQueuePhase: "idle",
  };
}

function getTrackedSubmissionIdsInFlight(
  queue: QueueSnapshot,
  pendingDownloadSubmissionIds: string[],
) {
  const trackedSubmissionIds = new Set(pendingDownloadSubmissionIds);
  for (const job of queue.jobs) {
    if (
      job.submissionId &&
      (job.status === "queued" || job.status === "active")
    ) {
      trackedSubmissionIds.add(job.submissionId);
    }
  }
  return trackedSubmissionIds;
}

function getTrackedActiveSubmissionIds(
  tab: SearchTabState,
  queue: QueueSnapshot,
  pendingDownloadSubmissionIds: string[],
) {
  const inFlight = getTrackedSubmissionIdsInFlight(
    queue,
    pendingDownloadSubmissionIds,
  );
  return tab.trackedDownloadSubmissionIds.filter((submissionId) =>
    inFlight.has(submissionId),
  );
}

function hasTrackedQueueActivity(
  tab: SearchTabState,
  queue: QueueSnapshot,
  pendingDownloadSubmissionIds: string[],
) {
  return (
    getTrackedActiveSubmissionIds(tab, queue, pendingDownloadSubmissionIds)
      .length > 0
  );
}

function shouldRunAutoQueue(
  tab: SearchTabState,
  queue: QueueSnapshot,
  pendingDownloadSubmissionIds: string[],
  autoQueueClock: number,
) {
  return (
    tab.autoQueueEnabled &&
    tab.autoQueuePhase === "idle" &&
    !tab.searchLoading &&
    tab.loadMoreState.mode === "idle" &&
    queue.activeCount === 0 &&
    pendingDownloadSubmissionIds.length === 0 &&
    !hasTrackedQueueActivity(tab, queue, pendingDownloadSubmissionIds) &&
    tab.autoQueueNextRunAt > 0 &&
    autoQueueClock >= tab.autoQueueNextRunAt
  );
}

function formatAutoQueueCountdown(nextRunAt: number, autoQueueClock: number) {
  const remainingMs = Math.max(0, nextRunAt - autoQueueClock);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function isUnknownSearchIDError(error: unknown) {
  return getErrorMessage(error, "").toLowerCase().includes("unknown search id");
}

function isSearchTabUntouched(
  tab: SearchTabState,
  session: SessionInfo,
  settings: AppSettings,
) {
  return (
    tab.mode === "default" &&
    areSearchParamsEqual(
      tab.searchParams,
      buildDefaultSearch(session, settings),
    ) &&
    tab.artistDraft === "" &&
    Object.keys(tab.artistAvatars).length === 0 &&
    Object.keys(tab.artistValidation).length === 0 &&
    tab.searchResponse === null &&
    tab.results.length === 0 &&
    tab.activeSubmissionId === "" &&
    tab.selectedSubmissionIds.length === 0 &&
    tab.showCustomThumbnails &&
    !tab.autoQueueEnabled &&
    tab.trackedDownloadSubmissionIds.length === 0 &&
    tab.autoQueueNextRunAt === 0 &&
    !tab.searchLoading &&
    tab.searchError === ""
  );
}

function areSearchParamsEqual(left: SearchParams, right: SearchParams) {
  return (
    left.query === right.query &&
    (left.keywordId ?? "") === (right.keywordId ?? "") &&
    left.joinType === right.joinType &&
    left.searchInKeywords === right.searchInKeywords &&
    left.searchInTitle === right.searchInTitle &&
    left.searchInDescription === right.searchInDescription &&
    left.searchInMD5 === right.searchInMD5 &&
    left.unreadSubmissions === right.unreadSubmissions &&
    left.useWatchingArtists === right.useWatchingArtists &&
    left.favoritesBy === right.favoritesBy &&
    left.poolId === right.poolId &&
    left.scraps === right.scraps &&
    left.timeRangeDays === right.timeRangeDays &&
    left.orderBy === right.orderBy &&
    left.randomize === right.randomize &&
    left.page === right.page &&
    left.perPage === right.perPage &&
    left.maxDownloads === right.maxDownloads &&
    left.maxActive === right.maxActive &&
    left.saveKeywords === right.saveKeywords &&
    left.artistNames.length === right.artistNames.length &&
    left.artistNames.every(
      (value, index) => value === right.artistNames[index],
    ) &&
    left.submissionTypes.length === right.submissionTypes.length &&
    left.submissionTypes.every(
      (value, index) => value === right.submissionTypes[index],
    )
  );
}

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
    : value;
}

function getTourStepPresentation(
  stepId: TourStepId,
  context: {
    tabMenuOpen: boolean;
    hasActiveResult: boolean;
    hasSelectableActiveResult: boolean;
    searchAttempted: boolean;
    selectedCount: number;
    queueReady: boolean;
  },
): TourStepPresentation {
  if (stepId === "tabs-toggle") {
    return {
      id: stepId,
      anchor: "tabs-toggle",
      title: "Search tabs",
      body: "This button opens your search sessions. You can keep multiple searches around and switch between them without losing your place.",
      nagText: "Open tabs",
      canAdvance: true,
      advanceLabel: "Next",
    };
  }
  if (stepId === "tabs-menu") {
    return {
      id: stepId,
      anchor: "tabs-menu",
      title: "Session menu",
      body: "Each bubble is a search tab. Pick one to switch context, or use the plus bubble to start a fresh search session.",
      nagText: "Tabs live here",
      canAdvance: true,
      advanceLabel: "Next",
    };
  }
  if (stepId === "search-words") {
    return {
      id: stepId,
      anchor: "search-words",
      title: "Search words",
      body: "Type keywords here. Spaces split words, and a leading minus excludes terms, so `wolf -feral` narrows results fast.",
      nagText: "Type here",
      canAdvance: true,
      advanceLabel: "Next",
    };
  }
  if (stepId === "artist-name") {
    return {
      id: stepId,
      anchor: "artist-name",
      title: "Artist filter",
      body: "Use this field when you want results from one artist only. Leave it blank for broader searches.",
      nagText: "Filter here",
      canAdvance: true,
      advanceLabel: "Next",
    };
  }
  if (stepId === "run-search") {
    return {
      id: stepId,
      anchor: "search-action",
      title: "Run the search",
      body: "Start a search from here. The guide waits for real results so the next steps can show selection and queueing on actual submissions.",
      helper:
        context.searchAttempted && !context.hasActiveResult
          ? "That search did not return results. Try broader search words or clear the artist name field, then search again."
          : "Run a search that returns at least one result to continue.",
      nagText: "Search now",
      canAdvance: context.hasActiveResult,
      advanceLabel: "Next",
    };
  }
  if (stepId === "select-images") {
    return {
      id: stepId,
      anchor: "select-result",
      title: "Select images",
      body: "Use the add button on a result to include it in the current batch. You can select one submission or build a larger download set.",
      helper:
        context.selectedCount > 0
          ? "You have a selection ready. Continue to queue it."
          : "Select at least one result to continue.",
      nagText: "Pick one",
      canAdvance: context.selectedCount > 0,
      advanceLabel: "Next",
    };
  }
  if (stepId === "queue-images") {
    return {
      id: stepId,
      anchor: "queue-download",
      title: "Queue downloads",
      body: "This download action sends the current selection into the queue so the app can fetch files in the background.",
      helper: context.queueReady
        ? "The queue has work now. Continue to the queue overview."
        : "Queue at least one selected submission to continue.",
      nagText: "Queue this",
      canAdvance: context.queueReady,
      advanceLabel: "Next",
    };
  }
  return {
    id: stepId,
    anchor: "queue-panel",
    title: "Watch the queue",
    body: "The queue panel tracks progress, status, and completion. This is also where you clear finished jobs or stop active downloads.",
    nagText: "Watch here",
    canAdvance: true,
    advanceLabel: "Finish",
    final: true,
  };
}

function getNextTourStep(stepId: TourStepId): TourStepId | null {
  if (stepId === "tabs-toggle") {
    return "tabs-menu";
  }
  if (stepId === "tabs-menu") {
    return "search-words";
  }
  if (stepId === "search-words") {
    return "artist-name";
  }
  if (stepId === "artist-name") {
    return "run-search";
  }
  if (stepId === "run-search") {
    return "select-images";
  }
  if (stepId === "select-images") {
    return "queue-images";
  }
  if (stepId === "queue-images") {
    return "queue-panel";
  }
  return null;
}
