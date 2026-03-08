import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { AccountSidebar } from "./components/AccountSidebar";
import { DownloadQueuePanel } from "./components/DownloadQueuePanel";
import { LoginModal } from "./components/LoginModal";
import { NavigationPill } from "./components/NavigationPill";
import { ResultsShowcase } from "./components/ResultsShowcase";
import { SearchWorkspace } from "./components/SearchWorkspace";
import { StarBackground } from "./components/StarBackground";
import { ToastHost, type ToastItem } from "./components/ToastHost";
import { DEFAULT_SEARCH, EMPTY_QUEUE, EMPTY_SESSION } from "./lib/constants";
import { backend, onRuntimeEvent } from "./lib/wails";
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
import { GLOBAL_STYLES } from "./styles/globalStyles";

const GUEST_DEFAULT_MAX_DOWNLOADS = 256;
const RELEASE_UPDATE_TOAST_ID = "release-update-toast";

export default function App() {
  const [session, setSession] = useState<SessionInfo>(EMPTY_SESSION);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SESSION.settings);
  const [loginOpen, setLoginOpen] = useState(true);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [searchParams, setSearchParams] = useState<SearchParams>(DEFAULT_SEARCH);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [results, setResults] = useState<SubmissionCard[]>([]);
  const [activeSubmissionId, setActiveSubmissionId] = useState("");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [ratingUpdating, setRatingUpdating] = useState(false);
  const [searchError, setSearchError] = useState("");
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
  const downloadedSubmissionIds = useMemo(() => getDownloadedSubmissionIds(queue), [queue]);
  const unavailableSubmissionIds = useMemo(
    () => getUnavailableSubmissionIds(queue, pendingDownloadSubmissionIds),
    [pendingDownloadSubmissionIds, queue],
  );

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
    const id = existing?.id ?? toast.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    const duration = getToastDuration(toast.level, toast.retryAfterMs);
    toastTimeoutsRef.current.set(
      id,
      window.setTimeout(() => dismissToast(id), duration),
    );
  }

  function pushErrorToast(message: string, dedupeKey?: string) {
    if (isRateLimitMessage(message)) {
      return;
    }
    pushToast({ level: "error", message, dedupeKey });
  }

  function updateQueueMessage(message: string, level?: ToastItem["level"], dedupeKey?: string) {
    setQueueMessage(message);
    if (level) {
      pushToast({ level, message, dedupeKey });
    }
  }

  function syncSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    setSession((previous) => ({
      ...previous,
      settings: nextSettings,
      effectiveTheme: nextSettings.darkMode ? "dark" : "light",
    }));
  }

  function showReleaseUpdateToast(status: ReleaseStatus, currentSettings: AppSettings) {
    if (!status.updateAvailable || !status.latestTag || status.latestTag === currentSettings.skippedReleaseTag) {
      return;
    }

    pushToast({
      id: RELEASE_UPDATE_TOAST_ID,
      dedupeKey: RELEASE_UPDATE_TOAST_ID,
      level: "info",
      message: `Update available: ${status.latestTag} is ready.`,
      sticky: true,
      primaryAction: {
        label: "View release notes",
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
        label: `Don't show ${status.latestTag} again`,
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

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  useEffect(() => {
    return () => {
      for (const timeoutId of toastTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      toastTimeoutsRef.current.clear();
    };
  }, []);

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
        setSession(nextSession);
        setSettings(nextSession.settings);
        setSearchParams((previous) => ({
          ...previous,
          maxActive: nextSession.settings.maxActive || previous.maxActive,
          maxDownloads:
            nextSession.isGuest && previous.maxDownloads <= 0
              ? GUEST_DEFAULT_MAX_DOWNLOADS
              : previous.maxDownloads,
        }));
        setLoginOpen(!nextSession.hasSession);

        void backend
          .getReleaseStatus()
          .then((status) => {
            if (!mounted) {
              return;
            }
            showReleaseUpdateToast(status, nextSession.settings);
          })
          .catch(() => undefined);
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
    const unsubscribeProgress = onRuntimeEvent<DownloadProgressEvent>(
      "download-progress",
      (event) => {
        if (event.queue) {
          setQueue(event.queue);
        }
      },
    );
    const unsubscribeNotifications = onRuntimeEvent<AppNotification>(
      "app-notification",
      (event) => {
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
      },
    );

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

  useEffect(() => {
    if (!session.hasSession || !session.isGuest || searchParams.maxDownloads > 0) {
      return;
    }
    setSearchParams((previous) =>
      previous.maxDownloads > 0
        ? previous
        : { ...previous, maxDownloads: GUEST_DEFAULT_MAX_DOWNLOADS },
    );
  }, [searchParams.maxDownloads, session.hasSession, session.isGuest]);

  useEffect(() => {
    return () => {
      if (ratingDebounceRef.current !== null) {
        window.clearTimeout(ratingDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldScrollToResultsRef.current || !resultsRef.current) {
      return;
    }

    shouldScrollToResultsRef.current = false;
    resultsRef.current.scrollIntoView({
      behavior: settings.motionEnabled ? "smooth" : "auto",
      block: "start",
    });
  }, [results.length, searchResponse, settings.motionEnabled]);

  useEffect(() => {
    if (downloadedSubmissionIds.size === 0) {
      return;
    }
    setSelectedSubmissionIds((previous) =>
      previous.filter((submissionId) => !downloadedSubmissionIds.has(submissionId)),
    );
  }, [downloadedSubmissionIds]);

  useEffect(() => {
    const requestId = ++keywordRequestRef.current;
    const timeout = window.setTimeout(() => {
      if (apiCooldownUntil > Date.now()) {
        setKeywordSuggestions([]);
        return;
      }

      const suggestionQuery = getSuggestionQuery(searchParams.query);
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
  }, [apiCooldownUntil, searchParams.query]);

  useEffect(() => {
    const requestId = ++artistRequestRef.current;
    const timeout = window.setTimeout(() => {
      if (apiCooldownUntil > Date.now()) {
        setArtistSuggestions([]);
        return;
      }

      if (!searchParams.artistName.trim()) {
        setArtistSuggestions([]);
        return;
      }

      backend
        .getUsernameSuggestions(searchParams.artistName)
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
  }, [apiCooldownUntil, searchParams.artistName]);

  useEffect(() => {
    const requestId = ++favoritesRequestRef.current;
    const timeout = window.setTimeout(() => {
      if (apiCooldownUntil > Date.now()) {
        setFavoriteSuggestions([]);
        return;
      }

      if (!searchParams.favoritesBy.trim()) {
        setFavoriteSuggestions([]);
        return;
      }

      backend
        .getUsernameSuggestions(searchParams.favoritesBy)
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
  }, [apiCooldownUntil, searchParams.favoritesBy]);

  async function persistSettings(partial: Partial<AppSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    try {
      const saved = await backend.updateSettings(next);
      syncSettings(saved);
    } catch (error) {
      const message = getErrorMessage(error, "Unable to save settings.");
      updateQueueMessage(message, "error", "save-settings-error");
    }
  }

  async function handleLogin() {
    setAuthLoading(true);
    setAuthError("");
    try {
      const nextSession = await backend.login(loginUsername, loginPassword);
      setSession(nextSession);
      setSettings(nextSession.settings);
      setSearchParams((previous) => ({
        ...previous,
        maxActive: nextSession.settings.maxActive || previous.maxActive,
        maxDownloads:
          nextSession.isGuest && previous.maxDownloads <= 0
            ? GUEST_DEFAULT_MAX_DOWNLOADS
            : previous.maxDownloads,
      }));
      setLoginOpen(false);
      setLoginPassword("");
      pushToast({ level: "success", message: `Signed in as ${nextSession.username}.`, dedupeKey: "login-success" });
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
      const nextSession = await backend.logout();
      setSession(nextSession);
      setSettings(nextSession.settings);
      setLoginOpen(true);
      pushToast({ level: "success", message: "Signed out.", dedupeKey: "logout-success" });
    } catch (error) {
      const message = getErrorMessage(error, "Logout failed.");
      updateQueueMessage(message, "error", "logout-error");
    }
  }

  async function handleSearch(page = 1) {
    if (!session.hasSession) {
      const message = "Sign in to search.";
      setSearchError(message);
      setLoginOpen(true);
      pushToast({ level: "warning", message, dedupeKey: "search-sign-in" });
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    try {
      const response =
        page === 1
          ? await backend.search({
              ...searchParams,
              page,
              maxActive: settings.maxActive,
            })
          : await backend.loadMoreResults(searchResponse?.searchId ?? "", page);
      setSession(response.session);
      setSettings(response.session.settings);
      if (page === 1) {
        shouldScrollToResultsRef.current = true;
      }
      startTransition(() => {
        setSearchResponse(response);
        if (page === 1) {
          setResults(response.results);
          setSelectedSubmissionIds(
            response.results
              .map((item) => item.submissionId)
              .filter((submissionId) => !downloadedSubmissionIds.has(submissionId)),
          );
          setActiveSubmissionId(response.results[0]?.submissionId ?? "");
        } else {
          setResults((previous) => [...previous, ...response.results]);
          setSelectedSubmissionIds((previous) => [
            ...previous,
            ...response.results
              .map((item) => item.submissionId)
              .filter((submissionId) => !downloadedSubmissionIds.has(submissionId))
              .filter((id) => !previous.includes(id)),
          ]);
          if (!activeSubmissionId && response.results[0]) {
            setActiveSubmissionId(response.results[0].submissionId);
          }
        }
      });
    } catch (error) {
      const message = getErrorMessage(error, "Search failed.");
      setSearchError(message);
      pushErrorToast(message, page === 1 ? "search-error" : "load-more-error");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleQueueDownloads() {
    await handleDownloadSubmissions(selectedSubmissionIds);
  }

  async function handleDownloadSubmissions(submissionIds: string[]) {
    if (!searchResponse || submissionIds.length === 0) {
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
        searchResponse.searchId,
        {
          submissions: eligibleSubmissionIds.map((submissionId) => ({
            submissionId,
          })),
        },
        {
          saveKeywords: searchParams.saveKeywords,
          maxActive: settings.maxActive,
          downloadDirectory: settings.downloadDirectory,
        },
      );
      const message = `Queued ${eligibleSubmissionIds.length} submission${eligibleSubmissionIds.length === 1 ? "" : "s"}.`;
      setQueue(snapshot);
      updateQueueMessage(message, "success", "queue-downloads-success");
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

  function handleToggleRating(index: number) {
    if (!session.hasSession) {
      return;
    }

    const nextMask = toggleRatingMask(session.ratingsMask, index);
    if (nextMask === session.ratingsMask) {
      return;
    }

    setSearchError("");
    pendingRatingsMaskRef.current = nextMask;
    setSession((previous) => ({
      ...previous,
      ratingsMask: nextMask,
    }));

    if (ratingDebounceRef.current !== null) {
      window.clearTimeout(ratingDebounceRef.current);
    }

    ratingDebounceRef.current = window.setTimeout(() => {
      const targetMask = pendingRatingsMaskRef.current;
      setRatingUpdating(true);
      backend
        .updateRatings(targetMask)
        .then((nextSession) => {
          setSession(nextSession);
          setSettings(nextSession.settings);
          pendingRatingsMaskRef.current = nextSession.ratingsMask;
        })
        .catch((error: unknown) => {
          const message = getErrorMessage(error, "Unable to update ratings.");
          setSearchError(message);
          pushErrorToast(message, "ratings-error");
          backend
            .getSession()
            .then((currentSession) => {
              setSession(currentSession);
              setSettings(currentSession.settings);
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

  function handleToggleSelectAll() {
    if (results.length === 0) {
      return;
    }

    const resultIds = results.map((item) => item.submissionId);
    const selectableResultIds = resultIds.filter(
      (submissionId) => !downloadedSubmissionIds.has(submissionId),
    );
    const allSelected =
      selectableResultIds.length > 0 &&
      selectableResultIds.every((submissionId) =>
        selectedSubmissionIds.includes(submissionId),
      );

    setSelectedSubmissionIds(allSelected ? [] : selectableResultIds);
  }

  const allResultsSelected =
    results.some((item) => !downloadedSubmissionIds.has(item.submissionId)) &&
    results
      .filter((item) => !downloadedSubmissionIds.has(item.submissionId))
      .every((item) => selectedSubmissionIds.includes(item.submissionId));

  return (
    <div
      className={`theme-switch min-h-screen transition-colors duration-300 mobile-zoom ${settings.darkMode ? "dark theme-dark" : "theme-light"} ${
        !settings.motionEnabled ? "motion-reduced" : ""
      }`}
    >
      <style>{GLOBAL_STYLES}</style>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      <StarBackground
        darkMode={settings.darkMode}
        motionEnabled={settings.motionEnabled}
      />

      <div className="min-h-screen overflow-x-hidden font-sans text-[var(--theme-text)] selection:bg-[#76B900] selection:text-white transition-colors duration-300">
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none select-none z-0">
          <h1
            ref={lagTextRef}
            className="font-teko text-[12rem] md:text-[20rem] leading-none opacity-12 dark:opacity-[0.07] text-[#FFB7B2] dark:text-[#73D216] transform translate-x-[-2rem] tracking-tight will-change-transform"
            style={{ transform: "translateY(0) translateX(-2rem)" }}
          >
            BUNNY
          </h1>
        </div>

        <NavigationPill
          darkMode={settings.darkMode}
          motionEnabled={settings.motionEnabled}
          session={session}
          onToggleDarkMode={() => void persistSettings({ darkMode: !settings.darkMode })}
          onToggleMotion={() => void persistSettings({ motionEnabled: !settings.motionEnabled })}
          onOpenLogin={() => setLoginOpen(true)}
          onLogout={() => void handleLogout()}
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

        <main className="relative z-10 pt-18 md:pt-32 max-w-[1560px] mx-auto pb-20 px-4 md:px-8 space-y-10">
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SearchWorkspace
              session={session}
              searchParams={searchParams}
              keywordSuggestions={keywordSuggestions}
              artistSuggestions={artistSuggestions}
              favoriteSuggestions={favoriteSuggestions}
              loading={searchLoading}
              ratingUpdating={ratingUpdating}
              collapsed={searchCollapsed}
              error={searchError}
              onChange={(updater) => setSearchParams((previous) => updater(previous))}
              onSearch={() => void handleSearch(1)}
              onToggleCollapse={() => setSearchCollapsed((current) => !current)}
              onToggleRating={(index) => void handleToggleRating(index)}
            />
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                searchCollapsed
                  ? "grid-rows-[0fr] opacity-0"
                  : "grid-rows-[1fr] opacity-100"
              }`}
            >
              <div className="overflow-hidden">
                <AccountSidebar
                  session={session}
                  settings={settings}
                  searchParams={searchParams}
                  onLogout={() => void handleLogout()}
                  onPickDirectory={() =>
                    void backend
                      .pickDownloadDirectory()
                      .then((directory) => {
                        if (!directory) {
                          return;
                        }
                        setSettings((previous) => ({
                          ...previous,
                          downloadDirectory: directory,
                        }));
                        setSession((previous) => ({
                          ...previous,
                          settings: {
                            ...previous.settings,
                            downloadDirectory: directory,
                          },
                        }));
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
                  onToggleSaveKeywords={(checked) =>
                    setSearchParams((previous) => ({
                      ...previous,
                      saveKeywords: checked,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div ref={resultsRef}>
            <ResultsShowcase
              searchResponse={searchResponse}
              results={results}
              activeSubmissionId={activeSubmissionId}
              selectedSubmissionIds={selectedSubmissionIds}
              allSelected={allResultsSelected}
              loading={searchLoading}
              queue={queue}
              pendingDownloadSubmissionIds={pendingDownloadSubmissionIds}
              onSelectActive={setActiveSubmissionId}
              onToggleSelectAll={handleToggleSelectAll}
              onToggleSelection={(submissionId) =>
                setSelectedSubmissionIds((previous) =>
                  previous.includes(submissionId)
                    ? previous.filter((value) => value !== submissionId)
                    : [...previous, submissionId],
                )
              }
              onDownloadSubmission={(submissionId) =>
                void handleDownloadSubmissions([submissionId])
              }
              onQueueDownloads={() => void handleQueueDownloads()}
              onLoadMore={() => void handleSearch((searchResponse?.page ?? 1) + 1)}
            />
          </div>

          <DownloadQueuePanel
            queue={queue}
            message={queueMessage}
            selectedCount={selectedSubmissionIds.length}
            canQueueDownloads={Boolean(searchResponse) && selectedSubmissionIds.length > 0}
            allSelected={allResultsSelected}
            onOpenDownloadFolder={() => {
              backend
                .openDownloadDirectory()
                .catch((error: unknown) => {
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
              backend
                .cancelDownload(jobId)
                .then(setQueue)
                .catch(() => undefined);
            }}
          />
        </main>
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
    const trimmed = error.trim();
    return trimmed || fallback;
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
      // ignore serialization errors and use fallback
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
