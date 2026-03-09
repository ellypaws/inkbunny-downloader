import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { AccountSidebar } from "./components/AccountSidebar";
import BubbleMenu, { type BubbleMenuItem } from "./components/BubbleMenu";
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
  EMPTY_QUEUE,
  EMPTY_SESSION,
  MAX_CONCURRENT_DOWNLOADS,
  MIN_CONCURRENT_DOWNLOADS,
} from "./lib/constants";
import type {
  AppNotification,
  AppSettings,
  DownloadProgressEvent,
  QueueSnapshot,
  ReleaseStatus,
  SearchParams,
  SearchResponse,
  SessionInfo,
  SubmissionCard,
  UsernameSuggestion,
} from "./lib/types";
import { backend, onRuntimeEvent } from "./lib/wails";
import { GLOBAL_STYLES } from "./styles/globalStyles";

const GUEST_DEFAULT_MAX_DOWNLOADS = 256;
const RELEASE_UPDATE_TOAST_ID = "release-update-toast";
const TOUR_STEP_DELAY_MS = 420;
const UNREAD_POLL_INTERVAL_MS = 60_000;
const LOAD_ALL_DELAY_MS = 500;

declare global {
  interface Window {
    __inkbunnyDebug?: InkbunnyDebugControls;
  }
}

type InkbunnyDebugControls = {
  showUpdateToast: () => void;
  showOnboarding: () => void;
};

type SearchTabMode = "default" | "unread";
type SearchTabLoadMoreMode = "idle" | "more" | "all";

type SearchTabLoadMoreState = {
  mode: SearchTabLoadMoreMode;
  pagesLoaded: number;
};

type SearchTabState = {
  id: string;
  mode: SearchTabMode;
  searchParams: SearchParams;
  searchResponse: SearchResponse | null;
  results: SubmissionCard[];
  activeSubmissionId: string;
  selectedSubmissionIds: string[];
  searchLoading: boolean;
  searchCollapsed: boolean;
  searchError: string;
  resultsRefreshToken: number;
  loadMoreState: SearchTabLoadMoreState;
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

export default function App() {
  const initialTabRef = useRef<SearchTabState | null>(null);
  if (!initialTabRef.current) {
    initialTabRef.current = createSearchTab(EMPTY_SESSION, EMPTY_SESSION.settings);
  }

  const [session, setSession] = useState<SessionInfo>(EMPTY_SESSION);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SESSION.settings);
  const [loginOpen, setLoginOpen] = useState(true);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginTeachMe, setLoginTeachMe] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [tabs, setTabs] = useState<SearchTabState[]>(() => [initialTabRef.current!]);
  const [activeTabId, setActiveTabId] = useState(() => initialTabRef.current!.id);
  const [ratingUpdating, setRatingUpdating] = useState(false);
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [artistSuggestions, setArtistSuggestions] = useState<UsernameSuggestion[]>([]);
  const [favoriteSuggestions, setFavoriteSuggestions] = useState<UsernameSuggestion[]>([]);
  const [queue, setQueue] = useState<QueueSnapshot>(EMPTY_QUEUE);
  const [pendingDownloadSubmissionIds, setPendingDownloadSubmissionIds] = useState<string[]>([]);
  const [queueMessage, setQueueMessage] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [apiCooldownUntil, setApiCooldownUntil] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStepId, setTourStepId] = useState<TourStepId>("tabs-toggle");
  const [tourSearchAttempted, setTourSearchAttempted] = useState(false);
  const [tourAdvancing, setTourAdvancing] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [trackedUnreadBaseline, setTrackedUnreadBaseline] = useState(-1);

  const lagTextRef = useRef<HTMLHeadingElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const shouldScrollToResultsRef = useRef(false);
  const ratingDebounceRef = useRef<number | null>(null);
  const autoClearTimeoutRef = useRef<number | null>(null);
  const pendingRatingsMaskRef = useRef("");
  const currentY = useRef(0);
  const toastTimeoutsRef = useRef<Map<string, number>>(new Map());
  const toastsRef = useRef<ToastItem[]>([]);
  const keywordRequestRef = useRef(0);
  const artistRequestRef = useRef(0);
  const favoritesRequestRef = useRef(0);
  const tabsRef = useRef<SearchTabState[]>(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const sessionRef = useRef(session);
  const settingsRef = useRef(settings);
  const unreadTotalRef = useRef(unreadTotal);
  const tourAdvanceTimeoutRef = useRef<number | null>(null);
  const scheduledTourAdvanceRef = useRef("");
  const loadMoreControllersRef = useRef(
    new Map<string, { runId: number; stopRequested: boolean }>(),
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  );
  const completedQueueSubmissionIds = useMemo(
    () => getCompletedQueueSubmissionIds(queue),
    [queue],
  );
  const completedJobIds = useMemo(
    () =>
      queue.jobs
        .filter((job) => job.status === "completed")
        .map((job) => job.id)
        .join(","),
    [queue.jobs],
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
  const activeSearchParams = activeTab?.searchParams ?? buildDefaultSearch(session, settings);
  const activeSearchResponse = activeTab?.searchResponse ?? null;
  const activeResults = activeTab?.results ?? [];
  const activeSubmissionId = activeTab?.activeSubmissionId ?? "";
  const activeSelectedSubmissionIds = activeTab?.selectedSubmissionIds ?? [];
  const activeSearchLoading = activeTab?.searchLoading ?? false;
  const activeSearchCollapsed = activeTab?.searchCollapsed ?? false;
  const activeSearchError = activeTab?.searchError ?? "";
  const activeResultsRefreshToken = activeTab?.resultsRefreshToken ?? 0;
  const activeLoadMoreState = activeTab?.loadMoreState ?? createIdleLoadMoreState();
  const activeSearchBusy =
    activeSearchLoading || activeLoadMoreState.mode !== "idle";
  const unreadModeActive = activeTab?.mode === "unread";
  const newUnreadCount =
    trackedUnreadBaseline < 0 ? 0 : Math.max(unreadTotal - trackedUnreadBaseline, 0);
  const hasSelectableActiveResult = activeResults.some(
    (item) => !downloadedSubmissionIds.has(item.submissionId),
  );
  const queueReadyForTour =
    pendingDownloadSubmissionIds.length > 0 || queue.jobs.length > 0;
  const canStopAllDownloads = queue.jobs.some(
    (job) => job.status === "queued" || job.status === "active",
  );
  const currentTourStep = getTourStepPresentation(tourStepId, {
    tabMenuOpen,
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
    activeResults.some((item) => !downloadedSubmissionIds.has(item.submissionId)) &&
    activeResults
      .filter((item) => !downloadedSubmissionIds.has(item.submissionId))
      .every((item) => activeSelectedSubmissionIds.includes(item.submissionId));
  const sessionMenuItems = useMemo<BubbleMenuItem[]>(
    () =>
      tabs.map((tab, index) => ({
        id: tab.id,
        label: getSearchTabLabel(tab, index),
        subtitle: getSearchTabSubtitle(tab),
        active: tab.id === activeTabId,
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
    [activeTabId, tabs],
  );

  function applySession(nextSession: SessionInfo, nextSettings = nextSession.settings) {
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

  function updateTab(tabId: string, updater: (tab: SearchTabState) => SearchTabState) {
    setTabs((previous) => previous.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
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
    return !controller || controller.runId !== runId || controller.stopRequested;
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
          item.id === existing.id ? { ...item, ...toast, id: existing.id } : item,
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
      window.setTimeout(() => dismissToast(id), getToastDuration(toast.level, toast.retryAfterMs)),
    );
  }

  function pushErrorToast(message: string, dedupeKey?: string) {
    if (!isRateLimitMessage(message)) {
      pushToast({ level: "error", message, dedupeKey });
    }
  }

  function updateQueueMessage(message: string, level?: ToastItem["level"], dedupeKey?: string) {
    setQueueMessage(message);
    if (level) {
      pushToast({ level, message, dedupeKey });
    }
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

  function showReleaseUpdateToast(status: ReleaseStatus, currentSettings: AppSettings) {
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
              pushErrorToast(getErrorMessage(error, "Could not open the release page."), "release-open-error");
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
                getErrorMessage(error, "Could not save the release preference."),
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
    const currentTab = currentTabs.find((tab) => tab.id === activeTabIdRef.current) ?? null;
    const reuseCurrentTab =
      currentTab !== null && isSearchTabUntouched(currentTab, sessionRef.current, settingsRef.current);
    const targetTab = reuseCurrentTab
      ? switchSearchTabToUnread(currentTab!, sessionRef.current, settingsRef.current)
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

  function handleCloseTab(tabId: string) {
    const currentTabs = tabsRef.current;
    const closingIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) {
      return;
    }
    if (currentTabs.length === 1) {
      setTabs((previous) =>
        previous.map((tab) =>
          tab.id === tabId ? resetSearchTab(tab, sessionRef.current, settingsRef.current) : tab,
        ),
      );
      setActiveTabId(tabId);
      return;
    }
    const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
    const nextActiveId =
      activeTabIdRef.current === tabId
        ? nextTabs[Math.max(0, closingIndex - 1)]?.id ?? nextTabs[0]?.id ?? ""
        : activeTabIdRef.current;
    setTabs(nextTabs);
    if (nextActiveId) {
      setActiveTabId(nextActiveId);
    }
  }

  useEffect(() => void (tabsRef.current = tabs), [tabs]);
  useEffect(() => void (activeTabIdRef.current = activeTabId), [activeTabId]);
  useEffect(() => void (sessionRef.current = session), [session]);
  useEffect(() => void (settingsRef.current = settings), [settings]);
  useEffect(() => void (unreadTotalRef.current = unreadTotal), [unreadTotal]);
  useEffect(() => void (downloadedSubmissionIdsRef.current = downloadedSubmissionIds), [downloadedSubmissionIds]);
  useEffect(() => void (toastsRef.current = toasts), [toasts]);
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
        setTrackedUnreadBaseline((previous) => (previous < 0 ? total : previous));
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
      hasSelectableActiveResult &&
      !activeSearchLoading
    ) {
      scheduleTourAdvance("select-images");
      return;
    }
    if (tourStepId === "select-images" && activeSelectedSubmissionIds.length > 0) {
      scheduleTourAdvance("queue-images");
      return;
    }
    if (tourStepId === "queue-images" && queueReadyForTour) {
      scheduleTourAdvance("queue-panel");
    }
  }, [
    activeSearchLoading,
    activeSelectedSubmissionIds.length,
    hasSelectableActiveResult,
    queueReadyForTour,
    tabMenuOpen,
    tourAdvancing,
    tourOpen,
    tourStepId,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    class DevDebugControls implements InkbunnyDebugControls {
      showUpdateToast() {
        showReleaseUpdateToast(
          {
            currentVersion: "0.1.2",
            currentTag: "v0.1.2",
            latestTag: "v0.1.3",
            releaseURL: "https://github.com/ellypaws/inkbunny-downloader/releases/latest",
            updateAvailable: true,
          },
          settings,
        );
      }

      showOnboarding() {
        setLoginOpen(false);
        startTutorial();
      }
    }
    window.__inkbunnyDebug = new DevDebugControls();
    return () => {
      delete window.__inkbunnyDebug;
    };
  }, [settings]);

  useEffect(
    () => () => {
      for (const timeoutId of toastTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      toastTimeoutsRef.current.clear();
      if (autoClearTimeoutRef.current !== null) {
        window.clearTimeout(autoClearTimeoutRef.current);
      }
      clearScheduledTourAdvance();
    },
    [],
  );

  useEffect(() => {
    if (apiCooldownUntil <= Date.now()) {
      return;
    }
    const timeout = window.setTimeout(() => setApiCooldownUntil(0), apiCooldownUntil - Date.now());
    return () => window.clearTimeout(timeout);
  }, [apiCooldownUntil]);

  useEffect(() => {
    let mounted = true;
    backend
      .getSession()
      .then((nextSession) => {
        if (!mounted) {
          return;
        }
        applySession(nextSession);
        setLoginOpen(!nextSession.hasSession);
        void backend
          .getReleaseStatus()
          .then((status) => {
            if (mounted) {
              showReleaseUpdateToast(status, nextSession.settings);
            }
          })
          .catch(() => undefined);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to reach the Wails backend.";
        setAuthError(message);
        pushErrorToast(message, "backend-unavailable");
      });
    backend
      .getQueueSnapshot()
      .then((snapshot) => {
        if (mounted) {
          setQueue(snapshot);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribeProgress = onRuntimeEvent<DownloadProgressEvent>("download-progress", (event) => {
      if (event.queue) {
        setQueue(event.queue);
      }
    });
    const unsubscribeNotifications = onRuntimeEvent<AppNotification>("app-notification", (event) => {
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
    });
    return () => {
      unsubscribeProgress();
      unsubscribeNotifications();
    };
  }, []);

  useEffect(() => {
    const animate = () => {
      if (settings.motionEnabled && lagTextRef.current) {
        const targetY = window.scrollY;
        currentY.current += (targetY - currentY.current) * 0.05;
        const translateY = currentY.current * 0.55;
        const rotate = Math.sin(currentY.current * 0.002) * 2;
        lagTextRef.current.style.transform = `translateY(${translateY}px) translateX(-2rem) rotate(${rotate}deg)`;
      }
      requestRef.current = window.requestAnimationFrame(animate);
    };
    requestRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (requestRef.current !== null) {
        window.cancelAnimationFrame(requestRef.current);
      }
    };
  }, [settings.motionEnabled]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
  }, [settings.darkMode]);

  useEffect(() => {
    if (autoClearTimeoutRef.current !== null) {
      window.clearTimeout(autoClearTimeoutRef.current);
      autoClearTimeoutRef.current = null;
    }
    if (!settings.autoClearCompleted || !completedJobIds) {
      return;
    }
    autoClearTimeoutRef.current = window.setTimeout(() => {
      autoClearTimeoutRef.current = null;
      void handleClearCompleted(true);
    }, 3000);
    return () => {
      if (autoClearTimeoutRef.current !== null) {
        window.clearTimeout(autoClearTimeoutRef.current);
        autoClearTimeoutRef.current = null;
      }
    };
  }, [completedJobIds, settings.autoClearCompleted]);

  useEffect(() => {
    pendingRatingsMaskRef.current = session.ratingsMask;
  }, [session.ratingsMask]);

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
  }, [activeResults.length, activeSearchResponse?.searchId, activeTabId, settings.motionEnabled]);

  useEffect(() => {
    if (completedQueueSubmissionIds.size === 0) {
      return;
    }
    setTabs((previous) =>
      previous.map((tab) => ({
        ...tab,
        results: tab.results.map((result) =>
          completedQueueSubmissionIds.has(result.submissionId)
            ? { ...result, downloaded: true }
            : result,
        ),
        selectedSubmissionIds: tab.selectedSubmissionIds.filter(
          (submissionId) => !downloadedSubmissionIds.has(submissionId),
        ),
      })),
    );
  }, [completedQueueSubmissionIds, downloadedSubmissionIds]);

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
      if (!activeSearchParams.artistName.trim()) {
        setArtistSuggestions([]);
        return;
      }
      backend
        .getUsernameSuggestions(activeSearchParams.artistName)
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
  }, [activeSearchParams.artistName, apiCooldownUntil]);

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
      updateQueueMessage(getErrorMessage(error, "Unable to save settings."), "error", "save-settings-error");
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

  async function handleClearCompleted(auto = false) {
    try {
      const snapshot = await backend.clearCompletedDownloads();
      setQueue(snapshot);
      if (auto) {
        updateQueueMessage("Completed downloads cleared automatically.", "success", "queue-auto-clear-completed");
        return;
      }
      updateQueueMessage("Completed downloads cleared.", "success", "queue-clear-completed");
    } catch (error) {
      const message = getErrorMessage(error, "Could not clear completed downloads.");
      updateQueueMessage(message);
      pushErrorToast(message, auto ? "queue-auto-clear-completed-error" : "queue-clear-completed-error");
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
      pushToast({ level: "success", message: "Signed out.", dedupeKey: "logout-success" });
    } catch (error) {
      updateQueueMessage(getErrorMessage(error, "Logout failed."), "error", "logout-error");
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
      updateTab(targetTabId, (currentTab) => ({ ...currentTab, searchError: message }));
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
      searchError: "",
    }));
    try {
      const normalizedParams = normalizeSearchParamsForMode(
        tab.searchParams,
        tab.mode,
        sessionRef.current,
        settingsRef.current,
      );
      const response =
        page === 1
          ? await backend.search({
              ...normalizedParams,
              page,
              maxActive: settingsRef.current.maxActive,
            })
          : await backend.loadMoreResults(tab.searchResponse!.searchId, page);
      if (tourOpen && tourStepId === "run-search" && page === 1) {
        setTourSearchAttempted(true);
      }
      applySession(response.session);
      if (page === 1 && activeTabIdRef.current === targetTabId) {
        shouldScrollToResultsRef.current = true;
      }
      startTransition(() => {
        setTabs((previous) =>
          previous.map((currentTab) => {
            if (currentTab.id !== targetTabId) {
              return currentTab;
            }
            if (page === 1) {
              return {
                ...currentTab,
                searchParams: normalizedParams,
                searchResponse: response,
                results: response.results,
                selectedSubmissionIds: getAutoSelectedSubmissionIds(
                  response.results,
                  mergeDownloadedSubmissionIds(
                    downloadedSubmissionIdsRef.current,
                    response.results,
                  ),
                ),
                activeSubmissionId: response.results[0]?.submissionId ?? "",
                searchError: "",
              };
            }
            return {
              ...currentTab,
              searchResponse: response,
              results: [...currentTab.results, ...response.results],
              activeSubmissionId:
                currentTab.activeSubmissionId || response.results[0]?.submissionId || "",
              searchError: "",
            };
          }),
        );
      });
      return response;
    } catch (error) {
      const message = getErrorMessage(error, "Search failed.");
      updateTab(targetTabId, (currentTab) => ({ ...currentTab, searchError: message }));
      pushErrorToast(message, page === 1 ? "search-error" : "load-more-error");
      return undefined;
    } finally {
      updateTab(targetTabId, (currentTab) => ({ ...currentTab, searchLoading: false }));
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
      searchError: "",
    }));
    try {
      const response = await backend.refreshSearch(tab.searchResponse.searchId);
      applySession(response.session);
      startTransition(() => {
        setTabs((previous) =>
            previous.map((currentTab) =>
              currentTab.id === resolvedTabId
                ? {
                  ...currentTab,
                  searchResponse: response,
                  results: response.results,
                  selectedSubmissionIds: getAutoSelectedSubmissionIds(
                    response.results,
                    mergeDownloadedSubmissionIds(
                      downloadedSubmissionIdsRef.current,
                      response.results,
                    ),
                  ),
                  activeSubmissionId: response.results[0]?.submissionId ?? "",
                  resultsRefreshToken: currentTab.resultsRefreshToken + 1,
                }
              : currentTab,
          ),
        );
      });
    } catch (error) {
      const message = getErrorMessage(error, "Refresh failed.");
      updateTab(resolvedTabId, (currentTab) => ({ ...currentTab, searchError: message }));
      pushErrorToast(message, "refresh-search-error");
    } finally {
      updateTab(resolvedTabId, (currentTab) => ({ ...currentTab, searchLoading: false }));
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
      await delay(LOAD_ALL_DELAY_MS);
      if (isLoadMoreStopRequested(targetTabId, runId)) {
        return;
      }

      let nextPage = tab.searchResponse.page + 1;
      while (true) {
        const currentTab = tabsRef.current.find((item) => item.id === targetTabId);
        if (!currentTab?.searchResponse || nextPage > currentTab.searchResponse.pagesCount) {
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
        await delay(LOAD_ALL_DELAY_MS);
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
    stopLoadMore(targetTabId);
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab?.searchLoading) {
      cancelLoadMore(targetTabId);
    }
  }

  async function handleQueueDownloads() {
    await handleDownloadSubmissions(activeSelectedSubmissionIds);
  }

  async function handleDownloadSubmissions(
    submissionIds: string[],
    targetTabId = activeTabIdRef.current,
  ) {
    const tab = tabsRef.current.find((item) => item.id === targetTabId);
    if (!tab?.searchResponse || submissionIds.length === 0) {
      return;
    }
    const eligibleSubmissionIds = submissionIds.filter(
      (submissionId) => !unavailableSubmissionIds.has(submissionId),
    );
    if (eligibleSubmissionIds.length === 0) {
      updateQueueMessage(
        "Those submissions are already downloading or downloaded.",
        "warning",
        "queue-no-eligible-results",
      );
      return;
    }
    setQueueMessage("");
    setPendingDownloadSubmissionIds((previous) =>
      mergeSubmissionIds(previous, eligibleSubmissionIds),
    );
    try {
      const snapshot = await backend.enqueueDownloads(
        tab.searchResponse.searchId,
        {
          submissions: eligibleSubmissionIds.map((submissionId) => ({ submissionId })),
        },
        {
          saveKeywords: tab.searchParams.saveKeywords,
          maxActive: settingsRef.current.maxActive,
          downloadDirectory: settingsRef.current.downloadDirectory,
        },
      );
      setQueue(snapshot);
      updateQueueMessage(
        `Queued ${eligibleSubmissionIds.length} submission${eligibleSubmissionIds.length === 1 ? "" : "s"}.`,
        "success",
        "queue-downloads-success",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Failed to queue downloads.");
      updateQueueMessage(message);
      pushErrorToast(message, "queue-downloads-error");
    } finally {
      setPendingDownloadSubmissionIds((previous) =>
        previous.filter((submissionId) => !eligibleSubmissionIds.includes(submissionId)),
      );
    }
  }

  async function handleCancelSubmission(submissionId: string) {
    if (!submissionId) {
      return;
    }
    setPendingDownloadSubmissionIds((previous) =>
      previous.filter((value) => value !== submissionId),
    );
    try {
      setQueue(await backend.cancelSubmission(submissionId));
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
      setQueue(await backend.retryDownload(jobId));
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
      setQueue(await backend.retrySubmission(submissionId));
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

  async function handleStopAllDownloads() {
    if (!canStopAllDownloads) {
      return;
    }
    setPendingDownloadSubmissionIds([]);
    try {
      setQueue(await backend.stopAllDownloads());
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
    updateTab(targetTabId, (currentTab) => ({ ...currentTab, searchError: "" }));
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
          updateTab(targetTabId, (currentTab) => ({ ...currentTab, searchError: message }));
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
      selectableResultIds.every((submissionId) => tab.selectedSubmissionIds.includes(submissionId));
    updateTab(resolvedTabId, (currentTab) => ({
      ...currentTab,
      selectedSubmissionIds: allSelected ? [] : selectableResultIds,
    }));
  }

  return (
    <div className={`theme-switch min-h-screen transition-colors duration-300 mobile-zoom ${settings.darkMode ? "dark theme-dark" : "theme-light"} ${!settings.motionEnabled ? "motion-reduced" : ""}`}>
      <style>{GLOBAL_STYLES}</style>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <StarBackground darkMode={settings.darkMode} motionEnabled={settings.motionEnabled} />
      <div className="theme-shell min-h-screen overflow-x-hidden font-sans text-[var(--theme-text)] selection:bg-[var(--theme-accent)] selection:text-white transition-colors duration-300">
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none select-none z-0">
          <h1
            ref={lagTextRef}
            className="font-teko text-[12rem] md:text-[20rem] leading-none transform translate-x-[-2rem] tracking-tight will-change-transform"
            style={{
              transform: "translateY(0) translateX(-2rem)",
              opacity: settings.darkMode ? 0.07 : 0.12,
              color: settings.darkMode ? "var(--theme-accent-strong)" : "var(--theme-border)",
            }}
          >
            BUNNY
          </h1>
        </div>
        <NavigationPill
          darkMode={settings.darkMode}
          motionEnabled={settings.motionEnabled}
          tabsOpen={tabMenuOpen}
          session={session}
          unreadTotal={unreadTotal}
          newUnreadCount={newUnreadCount}
          unreadActive={unreadModeActive}
          onToggleDarkMode={() => void persistSettings({ darkMode: !settings.darkMode })}
          onToggleMotion={() => void persistSettings({ motionEnabled: !settings.motionEnabled })}
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
        <main className="relative z-10 pt-18 md:pt-32 max-w-[1560px] mx-auto pb-20 px-4 md:px-8 space-y-8">
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SearchWorkspace
              session={session}
              searchParams={activeSearchParams}
              mode={activeTab?.mode ?? "default"}
              keywordSuggestions={keywordSuggestions}
              artistSuggestions={artistSuggestions}
              favoriteSuggestions={favoriteSuggestions}
              loading={activeSearchBusy}
              ratingUpdating={ratingUpdating}
              collapsed={activeSearchCollapsed}
              error={activeSearchError}
              onChange={(updater) => {
                if (!activeTab) {
                  return;
                }
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  searchParams: normalizeSearchParamsForMode(
                    updater(currentTab.searchParams),
                    currentTab.mode,
                    sessionRef.current,
                    settingsRef.current,
                  ),
                }));
              }}
              onSearch={() => void handleSearch(1)}
              onToggleCollapse={() => {
                if (!activeTab) {
                  return;
                }
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  searchCollapsed: !currentTab.searchCollapsed,
                }));
              }}
              onToggleRating={(index) => void handleToggleRating(index)}
            />
            <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${activeSearchCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
              <div className="overflow-hidden">
                <AccountSidebar
                  session={session}
                  settings={settings}
                  searchParams={activeSearchParams}
                  onLogout={() => void handleLogout()}
                  onPickDirectory={() =>
                    void backend
                      .pickDownloadDirectory()
                      .then((directory) => {
                        if (!directory) {
                          return;
                        }
                        syncSettings({ ...settingsRef.current, downloadDirectory: directory });
                        pushToast({
                          level: "success",
                          message: `Download folder set to ${directory}.`,
                          dedupeKey: "download-folder-success",
                        });
                      })
                      .catch((error: unknown) => {
                        const message = getErrorMessage(error, "Could not open folder picker.");
                        updateQueueMessage(message);
                        pushErrorToast(message, "download-folder-picker-error");
                      })
                  }
                  onToggleSaveKeywords={(checked) => {
                    if (!activeTab) {
                      return;
                    }
                    updateTab(activeTab.id, (currentTab) => ({
                      ...currentTab,
                      searchParams: {
                        ...currentTab.searchParams,
                        saveKeywords: checked,
                      },
                    }));
                  }}
                />
              </div>
            </div>
          </div>
          <div ref={resultsRef}>
            <ResultsShowcase
              searchResponse={activeSearchResponse}
              results={activeResults}
              activeSubmissionId={activeSubmissionId}
              selectedSubmissionIds={activeSelectedSubmissionIds}
              allSelected={allResultsSelected}
              loading={activeSearchBusy}
              loadMoreState={activeLoadMoreState}
              resultsRefreshToken={activeResultsRefreshToken}
              queue={queue}
              canStopAll={canStopAllDownloads}
              downloadedSubmissionIds={downloadedSubmissionIds}
              pendingDownloadSubmissionIds={pendingDownloadSubmissionIds}
              onSelectActive={(submissionId) => {
                if (!activeTab) {
                  return;
                }
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  activeSubmissionId: submissionId,
                }));
              }}
              onToggleSelectAll={handleToggleSelectAll}
              onToggleSelection={(submissionId) => {
                if (!activeTab) {
                  return;
                }
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  selectedSubmissionIds: currentTab.selectedSubmissionIds.includes(submissionId)
                    ? currentTab.selectedSubmissionIds.filter((value) => value !== submissionId)
                    : [...currentTab.selectedSubmissionIds, submissionId],
                }));
              }}
              onDownloadSubmission={(submissionId) => void handleDownloadSubmissions([submissionId])}
              onCancelSubmission={(submissionId) => void handleCancelSubmission(submissionId)}
              onRetrySubmission={(submissionId) => void handleRetrySubmission(submissionId)}
              onStopAll={() => void handleStopAllDownloads()}
              onRefresh={() => void handleRefreshSearch()}
              onQueueDownloads={() => void handleQueueDownloads()}
              onLoadMore={() => void handleLoadMore("more")}
              onLoadAll={() => void handleLoadMore("all")}
              onStopLoadMore={() => void handleStopLoadMore()}
            />
          </div>
          <DownloadQueuePanel
            queue={queue}
            message={queueMessage}
            maxActive={settings.maxActive}
            selectedCount={activeSelectedSubmissionIds.length}
            canQueueDownloads={Boolean(activeSearchResponse) && activeSelectedSubmissionIds.length > 0}
            canStopAll={canStopAllDownloads}
            allSelected={allResultsSelected}
            autoClearCompleted={settings.autoClearCompleted}
            onOpenDownloadFolder={() => {
              backend.openDownloadDirectory().catch((error: unknown) => {
                const message = getErrorMessage(error, "Could not open the download folder.");
                updateQueueMessage(message);
                pushErrorToast(message, "open-download-folder-error");
              });
            }}
            onClearQueue={() => {
              backend
                .clearQueue()
                .then((snapshot) => {
                  setQueue(snapshot);
                  setPendingDownloadSubmissionIds([]);
                  updateQueueMessage("Queue cleared.", "success", "queue-cleared");
                })
                .catch((error: unknown) => {
                  const message = getErrorMessage(error, "Could not clear the queue.");
                  updateQueueMessage(message);
                  pushErrorToast(message, "queue-clear-error");
                });
            }}
            onClearCompleted={() => void handleClearCompleted()}
            onQueueDownloads={() => void handleQueueDownloads()}
            onStopAll={() => void handleStopAllDownloads()}
            onToggleSelectAll={handleToggleSelectAll}
            onToggleAutoClearCompleted={(enabled) =>
              void persistSettings({ autoClearCompleted: enabled })
            }
            onMaxActiveChange={handleMaxActiveChange}
            onCancel={(jobId) => {
              backend.cancelDownload(jobId).then(setQueue).catch(() => undefined);
            }}
            onCancelSubmission={(submissionId) => void handleCancelSubmission(submissionId)}
            onRetry={(jobId) => void handleRetryDownload(jobId)}
          />
        </main>
      </div>
    </div>
  );
}

function getToastDuration(level: ToastItem["level"], retryAfterMs?: number) {
  const base =
    level === "error" ? 6500 : level === "warning" ? 5500 : level === "success" ? 3500 : 4000;
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
  return value.includes("rate limiting") || (value.includes("429") && value.includes("inkbunny"));
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

function getUnavailableSubmissionIds(
  queue: QueueSnapshot,
  pendingDownloadSubmissionIds: string[],
  downloadedSubmissionIds: Set<string>,
) {
  const unavailable = new Set([...pendingDownloadSubmissionIds, ...downloadedSubmissionIds]);
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
  return { ...searchParams, submissionTypes: [...searchParams.submissionTypes] };
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
      maxActive: settings.maxActive || searchParams.maxActive || DEFAULT_SEARCH.maxActive,
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
  return {
    ...cloneSearchParams(searchParams),
    unreadSubmissions: mode === "unread",
    maxActive: settings.maxActive || searchParams.maxActive || DEFAULT_SEARCH.maxActive,
    maxDownloads:
      session.isGuest && searchParams.maxDownloads <= 0
        ? GUEST_DEFAULT_MAX_DOWNLOADS
        : searchParams.maxDownloads,
  };
}

function createSearchTab(session: SessionInfo, settings: AppSettings): SearchTabState {
  return {
    id: createTabId(),
    mode: "default",
    searchParams: buildDefaultSearch(session, settings),
    searchResponse: null,
    results: [],
    activeSubmissionId: "",
    selectedSubmissionIds: [],
    searchLoading: false,
    searchCollapsed: false,
    searchError: "",
    resultsRefreshToken: 0,
    loadMoreState: createIdleLoadMoreState(),
  };
}

function createUnreadSearchTab(session: SessionInfo, settings: AppSettings): SearchTabState {
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
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
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

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getSearchTabLabel(tab: SearchTabState, index: number) {
  if (tab.mode === "unread") {
    return "Unread";
  }
  const { query, artistName, favoritesBy, poolId } = tab.searchParams;
  if (query.trim()) {
    return truncateLabel(query.trim(), 26);
  }
  if (artistName.trim()) {
    return `@${truncateLabel(artistName.trim(), 22)}`;
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

function getSearchTabSubtitle(tab: SearchTabState) {
  if (tab.mode === "unread") {
    return "new submissions";
  }
  if (tab.searchParams.artistName.trim()) {
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

function isSearchTabUntouched(
  tab: SearchTabState,
  session: SessionInfo,
  settings: AppSettings,
) {
  return (
    tab.mode === "default" &&
    areSearchParamsEqual(tab.searchParams, buildDefaultSearch(session, settings)) &&
    tab.searchResponse === null &&
    tab.results.length === 0 &&
    tab.activeSubmissionId === "" &&
    tab.selectedSubmissionIds.length === 0 &&
    !tab.searchLoading &&
    tab.searchError === ""
  );
}

function areSearchParamsEqual(left: SearchParams, right: SearchParams) {
  return (
    left.query === right.query &&
    left.joinType === right.joinType &&
    left.searchInKeywords === right.searchInKeywords &&
    left.searchInTitle === right.searchInTitle &&
    left.searchInDescription === right.searchInDescription &&
    left.searchInMD5 === right.searchInMD5 &&
    left.unreadSubmissions === right.unreadSubmissions &&
    left.artistName === right.artistName &&
    left.favoritesBy === right.favoritesBy &&
    left.poolId === right.poolId &&
    left.scraps === right.scraps &&
    left.timeRangeDays === right.timeRangeDays &&
    left.orderBy === right.orderBy &&
    left.page === right.page &&
    left.perPage === right.perPage &&
    left.maxDownloads === right.maxDownloads &&
    left.maxActive === right.maxActive &&
    left.saveKeywords === right.saveKeywords &&
    left.submissionTypes.length === right.submissionTypes.length &&
    left.submissionTypes.every((value, index) => value === right.submissionTypes[index])
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
      helper: context.tabMenuOpen
        ? "Tabs are open. Continue to see the session menu."
        : "Open the tabs menu to continue.",
      nagText: "Open tabs",
      canAdvance: context.tabMenuOpen,
      advanceLabel: "Next",
    };
  }
  if (stepId === "tabs-menu") {
    return {
      id: stepId,
      anchor: "tabs-menu",
      title: "Session menu",
      body: "Each bubble is a search tab. Pick one to switch context, or use the plus bubble to start a fresh search session.",
      helper: context.tabMenuOpen
        ? "Use Next when you are ready to return to the search form."
        : "Open the tabs menu again to continue.",
      nagText: "Tabs live here",
      canAdvance: context.tabMenuOpen,
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
        context.searchAttempted && !context.hasSelectableActiveResult
          ? "That search did not produce selectable results. Try broader search words or clear the artist name field, then search again."
          : "Run a search that returns at least one selectable result to continue.",
      nagText: "Search now",
      canAdvance: context.hasSelectableActiveResult,
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
