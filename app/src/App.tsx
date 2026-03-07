import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { AccountSidebar } from "./components/AccountSidebar";
import { LoginModal } from "./components/LoginModal";
import { NavigationPill } from "./components/NavigationPill";
import { ResultsShowcase } from "./components/ResultsShowcase";
import { SearchWorkspace } from "./components/SearchWorkspace";
import { StarBackground } from "./components/StarBackground";
import { DownloadQueuePanel } from "./components/DownloadQueuePanel";
import { DEFAULT_SEARCH, EMPTY_QUEUE, EMPTY_SESSION } from "./lib/constants";
import { backend, onRuntimeEvent } from "./lib/wails";
import type {
  AppSettings,
  DownloadProgressEvent,
  QueueSnapshot,
  SearchParams,
  SearchResponse,
  SessionInfo,
  SubmissionCard,
  UsernameSuggestion,
} from "./lib/types";
import { GLOBAL_STYLES } from "./styles/globalStyles";

export default function App() {
  const [session, setSession] = useState<SessionInfo>(EMPTY_SESSION);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SESSION.settings);
  const [loginOpen, setLoginOpen] = useState(true);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [searchParams, setSearchParams] =
    useState<SearchParams>(DEFAULT_SEARCH);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(
    null,
  );
  const [results, setResults] = useState<SubmissionCard[]>([]);
  const [activeSubmissionId, setActiveSubmissionId] = useState("");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>(
    [],
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [ratingUpdating, setRatingUpdating] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [artistSuggestions, setArtistSuggestions] = useState<
    UsernameSuggestion[]
  >([]);
  const [favoriteSuggestions, setFavoriteSuggestions] = useState<
    UsernameSuggestion[]
  >([]);
  const [queue, setQueue] = useState<QueueSnapshot>(EMPTY_QUEUE);
  const [pendingDownloadSubmissionIds, setPendingDownloadSubmissionIds] =
    useState<string[]>([]);
  const [queueMessage, setQueueMessage] = useState("");

  const lagTextRef = useRef<HTMLHeadingElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const shouldScrollToResultsRef = useRef(false);
  const ratingDebounceRef = useRef<number | null>(null);
  const pendingRatingsMaskRef = useRef("");
  const currentY = useRef(0);
  const downloadedSubmissionIds = useMemo(
    () => getDownloadedSubmissionIds(queue),
    [queue],
  );
  const unavailableSubmissionIds = useMemo(
    () => getUnavailableSubmissionIds(queue, pendingDownloadSubmissionIds),
    [pendingDownloadSubmissionIds, queue],
  );

  useEffect(() => {
    let mounted = true;

    backend
      .getSession()
      .then((nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setSettings(nextSession.settings);
        setSearchParams((previous) => ({
          ...previous,
          maxActive: nextSession.settings.maxActive || previous.maxActive,
        }));
        setLoginOpen(!nextSession.hasSession);
      })
      .catch((error: unknown) => {
        if (mounted) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Unable to reach the Wails backend.",
          );
        }
      });

    backend
      .getQueueSnapshot()
      .then((snapshot) => {
        if (mounted) setQueue(snapshot);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onRuntimeEvent<DownloadProgressEvent>(
      "download-progress",
      (event) => {
        if (event.queue) {
          setQueue(event.queue);
        }
      },
    );
    return unsubscribe;
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
    const timeout = window.setTimeout(() => {
      const suggestionQuery = getSuggestionQuery(searchParams.query);
      if (!suggestionQuery) {
        setKeywordSuggestions([]);
        return;
      }
      backend
        .getKeywordSuggestions(suggestionQuery)
        .then(setKeywordSuggestions)
        .catch(() => setKeywordSuggestions([]));
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [searchParams.query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!searchParams.artistName.trim()) {
        setArtistSuggestions([]);
        return;
      }
      backend
        .getUsernameSuggestions(searchParams.artistName)
        .then(setArtistSuggestions)
        .catch(() => setArtistSuggestions([]));
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [searchParams.artistName]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!searchParams.favoritesBy.trim()) {
        setFavoriteSuggestions([]);
        return;
      }
      backend
        .getUsernameSuggestions(searchParams.favoritesBy)
        .then(setFavoriteSuggestions)
        .catch(() => setFavoriteSuggestions([]));
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [searchParams.favoritesBy]);

  async function persistSettings(partial: Partial<AppSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    try {
      const saved = await backend.updateSettings(next);
      setSettings(saved);
      setSession((previous) => ({
        ...previous,
        settings: saved,
        effectiveTheme: saved.darkMode ? "dark" : "light",
      }));
    } catch (error) {
      setQueueMessage(
        error instanceof Error ? error.message : "Unable to save settings.",
      );
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
      }));
      setLoginOpen(false);
      setLoginPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Login failed.");
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
    } catch (error) {
      setQueueMessage(
        error instanceof Error ? error.message : "Logout failed.",
      );
    }
  }

  async function handleSearch(page = 1) {
    if (!session.hasSession) {
      setSearchError("Sign in to search.");
      setLoginOpen(true);
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
      setSearchError(error instanceof Error ? error.message : "Search failed.");
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
      setQueueMessage(
        "Those submissions are already downloading or downloaded.",
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
      setQueue(snapshot);
      setQueueMessage(
        `Queued ${eligibleSubmissionIds.length} submission${eligibleSubmissionIds.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setQueueMessage(
        error instanceof Error ? error.message : "Failed to queue downloads.",
      );
    } finally {
      setPendingDownloadSubmissionIds((previous) =>
        previous.filter(
          (submissionId) => !eligibleSubmissionIds.includes(submissionId),
        ),
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
          setSearchError(
            error instanceof Error
              ? error.message
              : "Unable to update ratings.",
          );
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
          onToggleDarkMode={() =>
            void persistSettings({ darkMode: !settings.darkMode })
          }
          onToggleMotion={() =>
            void persistSettings({ motionEnabled: !settings.motionEnabled })
          }
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
              onChange={(updater) =>
                setSearchParams((previous) => updater(previous))
              }
              onSearch={() => void handleSearch(1)}
              onToggleCollapse={() =>
                setSearchCollapsed((current) => !current)
              }
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
                        if (directory) {
                          void persistSettings({ downloadDirectory: directory });
                        }
                      })
                      .catch((error: unknown) => {
                        setQueueMessage(
                          error instanceof Error
                            ? error.message
                            : "Could not open folder picker.",
                        );
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
              onLoadMore={() =>
                void handleSearch((searchResponse?.page ?? 1) + 1)
              }
            />
          </div>

          <DownloadQueuePanel
            queue={queue}
            message={queueMessage}
            selectedCount={selectedSubmissionIds.length}
            canQueueDownloads={
              Boolean(searchResponse) && selectedSubmissionIds.length > 0
            }
            allSelected={allResultsSelected}
            onOpenDownloadFolder={() => {
              backend
                .openDownloadDirectory()
                .catch((error: unknown) => {
                  setQueueMessage(
                    error instanceof Error
                      ? error.message
                      : "Could not open the download folder.",
                    );
                });
            }}
            onClearQueue={() => {
              backend
                .clearQueue()
                .then((snapshot) => {
                  setQueue(snapshot);
                  setPendingDownloadSubmissionIds([]);
                  setQueueMessage("Queue cleared.");
                })
                .catch((error: unknown) => {
                  setQueueMessage(
                    error instanceof Error
                      ? error.message
                      : "Could not clear the queue.",
                  );
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

function mergeSubmissionIds(
  existing: string[],
  next: string[],
) {
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
