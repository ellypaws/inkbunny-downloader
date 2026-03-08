import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { AccountSidebar } from "./components/AccountSidebar";
import BubbleMenu, { type BubbleMenuItem } from "./components/BubbleMenu";
import { DownloadQueuePanel } from "./components/DownloadQueuePanel";
import { LoginModal } from "./components/LoginModal";
import { NavigationPill } from "./components/NavigationPill";
import { ResultsShowcase } from "./components/ResultsShowcase";
import { SearchWorkspace } from "./components/SearchWorkspace";
import { StarBackground } from "./components/StarBackground";
import { ToastHost, type ToastItem } from "./components/ToastHost";
import { DEFAULT_SEARCH, EMPTY_QUEUE, EMPTY_SESSION } from "./lib/constants";
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

declare global {
  interface Window {
    __inkbunnyDebug?: InkbunnyDebugControls;
  }
}

type InkbunnyDebugControls = { showUpdateToast: () => void };

type SearchTabState = {
  id: string;
  searchParams: SearchParams;
  searchResponse: SearchResponse | null;
  results: SubmissionCard[];
  activeSubmissionId: string;
  selectedSubmissionIds: string[];
  searchLoading: boolean;
  searchCollapsed: boolean;
  searchError: string;
  resultsRefreshToken: number;
};

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

  const lagTextRef = useRef<HTMLHeadingElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const shouldScrollToResultsRef = useRef(false);
  const ratingDebounceRef = useRef<number | null>(null);
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

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  );
  const downloadedSubmissionIds = useMemo(() => getDownloadedSubmissionIds(queue), [queue]);
  const downloadedSubmissionIdsRef = useRef(downloadedSubmissionIds);
  const unavailableSubmissionIds = useMemo(
    () => getUnavailableSubmissionIds(queue, pendingDownloadSubmissionIds),
    [pendingDownloadSubmissionIds, queue],
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
        searchParams: syncSearchParamsWithSession(tab.searchParams, nextSession, nextSettings),
      })),
    );
  }

  function updateTab(tabId: string, updater: (tab: SearchTabState) => SearchTabState) {
    setTabs((previous) => previous.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
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
  useEffect(() => void (downloadedSubmissionIdsRef.current = downloadedSubmissionIds), [downloadedSubmissionIds]);
  useEffect(() => void (toastsRef.current = toasts), [toasts]);
  useEffect(() => {
    if (!activeTab && tabs[0]) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTab, tabs]);

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
    if (downloadedSubmissionIds.size === 0) {
      return;
    }
    setTabs((previous) =>
      previous.map((tab) => ({
        ...tab,
        selectedSubmissionIds: tab.selectedSubmissionIds.filter(
          (submissionId) => !downloadedSubmissionIds.has(submissionId),
        ),
      })),
    );
  }, [downloadedSubmissionIds]);

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
    setSettings(next);
    try {
      syncSettings(await backend.updateSettings(next));
    } catch (error) {
      updateQueueMessage(getErrorMessage(error, "Unable to save settings."), "error", "save-settings-error");
    }
  }

  async function handleLogin() {
    setAuthLoading(true);
    setAuthError("");
    try {
      const nextSession = await backend.login(loginUsername, loginPassword);
      applySession(nextSession);
      setLoginOpen(false);
      setLoginPassword("");
      pushToast({
        level: "success",
        message: `Signed in as ${nextSession.username}.`,
        dedupeKey: "login-success",
      });
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
      const response =
        page === 1
          ? await backend.search({
              ...tab.searchParams,
              page,
              maxActive: settingsRef.current.maxActive,
            })
          : await backend.loadMoreResults(tab.searchResponse!.searchId, page);
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
                searchResponse: response,
                results: response.results,
                selectedSubmissionIds: getAutoSelectedSubmissionIds(
                  response.results,
                  downloadedSubmissionIdsRef.current,
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
    } catch (error) {
      const message = getErrorMessage(error, "Search failed.");
      updateTab(targetTabId, (currentTab) => ({ ...currentTab, searchError: message }));
      pushErrorToast(message, page === 1 ? "search-error" : "load-more-error");
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
                    downloadedSubmissionIdsRef.current,
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
          onToggleDarkMode={() => void persistSettings({ darkMode: !settings.darkMode })}
          onToggleMotion={() => void persistSettings({ motionEnabled: !settings.motionEnabled })}
          onToggleTabs={() => setTabMenuOpen((current) => !current)}
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
        <LoginModal
          open={loginOpen}
          session={session}
          username={loginUsername}
          password={loginPassword}
          loading={authLoading}
          error={authError}
          onChangeUsername={setLoginUsername}
          onChangePassword={setLoginPassword}
          onClose={() => setLoginOpen(false)}
          onSubmit={() => void handleLogin()}
        />
        <main className="relative z-10 pt-18 md:pt-32 max-w-[1560px] mx-auto pb-20 px-4 md:px-8 space-y-8">
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SearchWorkspace
              session={session}
              searchParams={activeSearchParams}
              keywordSuggestions={keywordSuggestions}
              artistSuggestions={artistSuggestions}
              favoriteSuggestions={favoriteSuggestions}
              loading={activeSearchLoading}
              ratingUpdating={ratingUpdating}
              collapsed={activeSearchCollapsed}
              error={activeSearchError}
              onChange={(updater) => {
                if (!activeTab) {
                  return;
                }
                updateTab(activeTab.id, (currentTab) => ({
                  ...currentTab,
                  searchParams: updater(currentTab.searchParams),
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
              loading={activeSearchLoading}
              resultsRefreshToken={activeResultsRefreshToken}
              queue={queue}
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
              onRefresh={() => void handleRefreshSearch()}
              onQueueDownloads={() => void handleQueueDownloads()}
              onLoadMore={() => void handleSearch((activeSearchResponse?.page ?? 1) + 1)}
            />
          </div>
          <DownloadQueuePanel
            queue={queue}
            message={queueMessage}
            selectedCount={activeSelectedSubmissionIds.length}
            canQueueDownloads={Boolean(activeSearchResponse) && activeSelectedSubmissionIds.length > 0}
            allSelected={allResultsSelected}
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
            onQueueDownloads={() => void handleQueueDownloads()}
            onToggleSelectAll={handleToggleSelectAll}
            onCancel={(jobId) => {
              backend.cancelDownload(jobId).then(setQueue).catch(() => undefined);
            }}
            onCancelSubmission={(submissionId) => void handleCancelSubmission(submissionId)}
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

function getDownloadedSubmissionIds(queue: QueueSnapshot) {
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
) {
  const unavailable = new Set(pendingDownloadSubmissionIds);
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

function buildDefaultSearch(session: SessionInfo, settings: AppSettings) {
  return {
    ...DEFAULT_SEARCH,
    submissionTypes: [...DEFAULT_SEARCH.submissionTypes],
    maxActive: settings.maxActive || DEFAULT_SEARCH.maxActive,
    maxDownloads: session.isGuest ? GUEST_DEFAULT_MAX_DOWNLOADS : 0,
  };
}

function cloneSearchParams(searchParams: SearchParams): SearchParams {
  return { ...searchParams, submissionTypes: [...searchParams.submissionTypes] };
}

function syncSearchParamsWithSession(
  searchParams: SearchParams,
  session: SessionInfo,
  settings: AppSettings,
) {
  return {
    ...cloneSearchParams(searchParams),
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
    searchParams: buildDefaultSearch(session, settings),
    searchResponse: null,
    results: [],
    activeSubmissionId: "",
    selectedSubmissionIds: [],
    searchLoading: false,
    searchCollapsed: false,
    searchError: "",
    resultsRefreshToken: 0,
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

function getSearchTabLabel(tab: SearchTabState, index: number) {
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

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
    : value;
}
