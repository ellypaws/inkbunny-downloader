import {
  Check,
  ChevronDown,
  Download,
  File,
  FileImage,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search as SearchIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
} from "react";

import ElasticSlider from "./ElasticSlider";
import { accentClass } from "../lib/format";
import type {
  DownloadJobSnapshot,
  QueueSnapshot,
  SearchResponse,
  SubmissionCard,
} from "../lib/types";

type ResultsShowcaseProps = {
  searchResponse: SearchResponse | null;
  results: SubmissionCard[];
  activeSubmissionId: string;
  selectedSubmissionIds: string[];
  allSelected: boolean;
  loading: boolean;
  resultsRefreshToken: number;
  queue: QueueSnapshot;
  pendingDownloadSubmissionIds: string[];
  onSelectActive: (submissionId: string) => void;
  onToggleSelectAll: () => void;
  onToggleSelection: (submissionId: string) => void;
  onDownloadSubmission: (submissionId: string) => void;
  onRefresh: () => void;
  onQueueDownloads: () => void;
  onLoadMore: () => void;
};

type SubmissionDownloadState = "idle" | "queued" | "downloading" | "downloaded";

type SubmissionDownloadSummary = {
  state: SubmissionDownloadState;
  progress: number;
};

const PANEL_WINDOW_SIZE = 5;
const IDLE_DOWNLOAD_SUMMARY: SubmissionDownloadSummary = {
  state: "idle",
  progress: 0,
};

export function ResultsShowcase(props: ResultsShowcaseProps) {
  const panelAnimationRef = useRef<number | null>(null);
  const selectedCount = props.selectedSubmissionIds.length;
  const activeSubmission =
    props.results.find(
      (item) => item.submissionId === props.activeSubmissionId,
    ) ?? props.results[0];
  const activeIndex = props.results.findIndex(
    (item) => item.submissionId === activeSubmission?.submissionId,
  );
  const canLoadMore =
    !!props.searchResponse &&
    props.searchResponse.page < props.searchResponse.pagesCount;
  const [panelStart, setPanelStart] = useState(0);
  const [panelVisible, setPanelVisible] = useState(true);
  const [gridCardWidth, setGridCardWidth] = useState(220);

  const panelItems = useMemo(
    () => getPanelItems(props.results, panelStart),
    [props.results, panelStart],
  );
  const downloadSummaries = useMemo(
    () =>
      buildSubmissionDownloadSummaries(
        props.queue,
        props.pendingDownloadSubmissionIds,
      ),
    [props.pendingDownloadSubmissionIds, props.queue],
  );
  const downloadedCount = useMemo(
    () =>
      props.results.filter(
        (item) =>
          downloadSummaries.get(item.submissionId)?.state === "downloaded",
      ).length,
    [downloadSummaries, props.results],
  );
  const selectableCount = props.results.length - downloadedCount;
  const selectAllDisabled = props.results.length === 0 || selectableCount === 0;
  const selectAllLabel =
    selectableCount === 0
      ? "All downloaded"
      : props.allSelected
        ? "Deselect all"
        : "Select all";

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (panelAnimationRef.current !== null) {
        window.cancelAnimationFrame(panelAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (props.results.length <= PANEL_WINDOW_SIZE) {
      if (panelStart !== 0) {
        setPanelStart(0);
      }
      setPanelVisible(true);
      return;
    }

    const maxStart = Math.max(0, props.results.length - PANEL_WINDOW_SIZE);
    if (panelStart > maxStart) {
      setPanelStart(maxStart);
    }
  }, [panelStart, props.results.length]);

  useEffect(() => {
    if (activeIndex < 0 || props.results.length <= PANEL_WINDOW_SIZE) {
      return;
    }

    const windowEnd = panelStart + PANEL_WINDOW_SIZE - 1;
    if (activeIndex >= panelStart && activeIndex <= windowEnd) {
      return;
    }

    const nextStart = getPanelWindowStart(props.results.length, activeIndex);
    if (nextStart === panelStart) {
      return;
    }

    setPanelVisible(false);
    setPanelStart(nextStart);

    if (panelAnimationRef.current !== null) {
      window.cancelAnimationFrame(panelAnimationRef.current);
    }

    panelAnimationRef.current = window.requestAnimationFrame(() => {
      panelAnimationRef.current = window.requestAnimationFrame(() => {
        setPanelVisible(true);
      });
    });
  }, [activeIndex, panelStart, props.results.length]);

  return (
    <section className="relative mt-4">
      <h1 className="font-teko text-[144px] font-bold text-[#2D2D44] dark:text-white tracking-[-0.02em] leading-[118.8px] -mb-[130px] drop-shadow-sm pointer-events-none text-left antialiased block w-full max-w-[945px] break-words relative z-20 -rotate-2 origin-left">
        Preview
      </h1>

      <div className="relative z-10 mb-5 flex flex-wrap items-center justify-end gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white/72 px-4 py-2 text-sm font-bold text-[#2D2D44] backdrop-blur-md dark:bg-[#1A1733]/80 dark:text-white">
            {selectedCount} selected
          </div>
          <button
            type="button"
            onClick={props.onToggleSelectAll}
            disabled={selectAllDisabled}
            className="rounded-2xl border border-[#2D2D44]/15 bg-white/80 px-5 py-3 text-sm font-black text-[#2D2D44] shadow-sm backdrop-blur-md transition-all hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-[#1A1733]/80 dark:text-white"
          >
            {selectAllLabel}
          </button>
          <button
            type="button"
            onClick={props.onRefresh}
            disabled={!props.searchResponse || props.loading}
            className="flex items-center gap-2 rounded-2xl border border-[#2D2D44]/15 bg-white/80 px-5 py-3 text-sm font-black text-[#2D2D44] shadow-sm backdrop-blur-md transition-all hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-[#1A1733]/80 dark:text-white"
          >
            {props.loading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
          <button
            onClick={props.onQueueDownloads}
            disabled={!props.searchResponse || selectedCount === 0}
            className="flex items-center gap-2 rounded-2xl border-b-8 border-[#2f6d05] bg-[#73D216] px-6 py-3 font-black text-white shadow-xl transition-all hover:bg-[#4E9A06] disabled:opacity-60"
          >
            <Download size={18} />
            Download
          </button>
        </div>
      </div>

      <div className="flex h-[1020px] w-full flex-col overflow-hidden rounded-toy-sm border-2 border-white/70 bg-white/80 shadow-pop dark:border-gray-700/70 dark:bg-gray-800/90 md:h-[600px] md:flex-row">
        {props.results.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-white/35 px-6 text-center dark:bg-[#1A1733]/55">
            <SearchIcon className="text-[#89CFF0]" size={42} />
            <p className="mt-4 max-w-md text-lg font-bold text-[#2D2D44] dark:text-white">
              Search results appear here.
            </p>
          </div>
        ) : (
          panelItems.map((item, index) => {
            const selected = props.selectedSubmissionIds.includes(
              item.submissionId,
            );
            const downloadSummary =
              downloadSummaries.get(item.submissionId) ?? IDLE_DOWNLOAD_SUMMARY;
            const downloaded = downloadSummary.state === "downloaded";

            return (
              <div
                key={item.submissionId}
                onClick={() => {
                  props.onSelectActive(item.submissionId);
                  if (!downloaded) {
                    props.onToggleSelection(item.submissionId);
                  }
                }}
                className={`slide-panel relative cursor-pointer group ${
                  props.activeSubmissionId === item.submissionId
                    ? "flex-[3]"
                    : "flex-1"
                } hover:flex-[3] transition-opacity duration-250 ${
                  panelVisible ? "opacity-100" : "opacity-0"
                } ${
                  index < panelItems.length - 1
                    ? "border-b-2 border-white/70 dark:border-gray-700/70 md:border-r-2 md:border-b-0"
                    : ""
                }`}
              >
                <SubmissionPreview
                  submission={item}
                  alt={item.title}
                  variant="full"
                  refreshToken={props.resultsRefreshToken}
                  className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity duration-500 group-hover:opacity-100"
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${accentClass(item.accent)} via-transparent to-transparent`}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-[#14112C]/10 via-transparent to-[#14112C]/60" />

                <div className="absolute right-5 top-5 z-20 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onDownloadSubmission(item.submissionId);
                    }}
                    aria-label={`Download ${item.title}`}
                    disabled={downloadSummary.state !== "idle"}
                    className={`flex h-11 w-11 items-center justify-center rounded-full shadow-pop backdrop-blur-md transition-all duration-300 ${
                      downloadSummary.state === "downloaded"
                        ? "translate-x-[3.25rem] bg-[#73D216]/85 text-white"
                        : downloadSummary.state === "queued" ||
                            downloadSummary.state === "downloading"
                          ? "bg-[#2A7FA6] text-white"
                          : "bg-[#14112C]/72 text-white hover:scale-105"
                    } disabled:cursor-default disabled:hover:scale-100`}
                  >
                    {renderDownloadIcon(downloadSummary.state, 18)}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onToggleSelection(item.submissionId);
                    }}
                    disabled={downloaded}
                    aria-label={
                      selected
                        ? `Remove ${item.title} from selection`
                        : `Select ${item.title}`
                    }
                    className={`flex h-11 w-11 items-center justify-center rounded-full shadow-pop backdrop-blur-md transition-all duration-300 ${
                      downloaded
                        ? "pointer-events-none w-0 scale-75 opacity-0"
                        : selected
                          ? "bg-[#73D216] text-white"
                          : "bg-white/85 text-[#2D2D44]"
                    }`}
                  >
                    {downloaded ? (
                      <Check size={18} />
                    ) : selected ? (
                      <Check size={18} />
                    ) : (
                      <Plus size={18} />
                    )}
                  </button>
                </div>

                <div className="absolute bottom-8 left-8 z-10 max-w-[72%]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block rounded-full bg-white px-4 py-1 text-sm font-black shadow-sm transform ${
                        index % 2 === 0 ? "-rotate-3 text-[#3465A4]" : "rotate-2 text-[#CC5E00]"
                      }`}
                    >
                      {item.badgeText || item.typeName || "Submission"}
                    </span>
                    <span className="rounded-full border border-white/55 bg-[#14112C]/35 px-3 py-1 text-xs font-bold text-white/92 backdrop-blur-sm">
                      {formatFileCount(item.pageCount)}
                    </span>
                  </div>
                  <h4 className="text-3xl font-display font-black text-white drop-shadow-md">
                    {item.title}
                  </h4>
                  <p className="text-xl font-bold text-white opacity-95">
                    @{item.username}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {props.results.length > 0 ? (
        <div className="mt-6 rounded-toy-lg border-2 border-[#89CFF0]/30 bg-white/50 p-5 shadow-pop backdrop-blur-2xl dark:bg-gray-800/50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm font-bold text-[#2D2D44]/65 dark:text-white/65">
              Gallery Grid
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={props.onToggleSelectAll}
                disabled={selectAllDisabled}
                className="rounded-full border border-[#2D2D44]/10 bg-white/72 px-4 py-2 text-xs font-black text-[#2D2D44]/75 backdrop-blur-md transition-colors hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-[#1A1733]/80 dark:text-white/75 dark:hover:bg-[#241e46]"
              >
                {selectAllLabel}
              </button>
              <button
                type="button"
                onClick={props.onRefresh}
                disabled={!props.searchResponse || props.loading}
                className="flex items-center gap-2 rounded-full border border-[#2D2D44]/10 bg-white/72 px-4 py-2 text-xs font-black text-[#2D2D44]/75 backdrop-blur-md transition-colors hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-[#1A1733]/80 dark:text-white/75 dark:hover:bg-[#241e46]"
              >
                {props.loading ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <RefreshCw size={14} />
                )}
                Refresh
              </button>
              <button
                type="button"
                onClick={props.onQueueDownloads}
                disabled={!props.searchResponse || selectedCount === 0}
                className="flex items-center gap-2 rounded-full bg-[#73D216] px-4 py-2 text-xs font-black text-white shadow-lg transition-all hover:bg-[#4E9A06] disabled:opacity-60"
              >
                <Download size={14} />
                Download
              </button>
              <label className="flex items-center gap-3 rounded-full border border-[#2D2D44]/10 bg-white/72 px-4 py-2 text-xs font-black text-[#2D2D44]/75 backdrop-blur-md dark:border-white/10 dark:bg-[#1A1733]/80 dark:text-white/75">
                Grid Size
                <ElasticSlider
                  value={gridCardWidth}
                  onChange={setGridCardWidth}
                  startingValue={180}
                  maxValue={320}
                  isStepped
                  stepSize={10}
                  valueFormatter={(value) => `${value}px`}
                  leftIcon={<span className="text-[11px]">S</span>}
                  rightIcon={<span className="text-[11px]">L</span>}
                  className="w-32"
                />
              </label>
            </div>
          </div>
          <div
            ref={scrollRef}
            className="mt-4 h-[75vh] overflow-y-auto rounded-toy-sm border border-white/40 bg-white/55 p-2.5 dark:border-white/8 dark:bg-[#151129]/55"
          >
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${gridCardWidth}px, 1fr))`,
              }}
            >
              {props.results.map((item) => {
                const isActive =
                  item.submissionId === activeSubmission?.submissionId;
                const selected = props.selectedSubmissionIds.includes(
                  item.submissionId,
                );
                const downloadSummary =
                  downloadSummaries.get(item.submissionId) ?? IDLE_DOWNLOAD_SUMMARY;
                const downloaded = downloadSummary.state === "downloaded";

                return (
                  <article
                    key={item.submissionId}
                    onClick={() => {
                      props.onSelectActive(item.submissionId);
                      if (!downloaded) {
                        props.onToggleSelection(item.submissionId);
                      }
                    }}
                    className={`cursor-pointer overflow-hidden rounded-[1.35rem] border transition-colors ${
                      isActive
                        ? "border-[#73D216]/80 bg-[#73D216]/10"
                        : "border-[#2D2D44]/10 bg-white/72 hover:bg-[#89CFF0]/10 dark:border-white/10 dark:bg-[#1A1733]/72 dark:hover:bg-white/8"
                    }`}
                  >
                    <div className="relative aspect-[5/4] overflow-hidden bg-[#2D2D44]/10 dark:bg-white/10">
                      <SubmissionPreview
                        submission={item}
                        alt={item.title}
                        variant="card"
                        refreshToken={props.resultsRefreshToken}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#14112C]/75 via-[#14112C]/20 to-transparent p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white/92 px-3 py-1 text-[11px] font-black text-[#2D2D44]">
                            {item.typeName || "Submission"}
                          </span>
                          <span className="rounded-full border border-white/45 bg-[#14112C]/40 px-3 py-1 text-[11px] font-bold text-white/92 backdrop-blur-sm">
                            {formatFileCount(item.pageCount)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5 p-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-black text-[#2D2D44] dark:text-white">
                          {item.title}
                        </div>
                        <div className="mt-1 truncate text-[11px] font-bold text-[#2D2D44]/70 dark:text-white/70">
                          @{item.username} · {item.ratingName || "Unrated"}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-semibold text-[#2D2D44]/55 dark:text-white/55">
                          {formatDownloadStatus(downloadSummary)}
                        </div>
                        <div className="flex items-center gap-2">
                          <GridDownloadButton
                            title={item.title}
                            summary={downloadSummary}
                            onClick={(event) => {
                              event.stopPropagation();
                              props.onDownloadSubmission(item.submissionId);
                            }}
                          />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              props.onToggleSelection(item.submissionId);
                            }}
                            disabled={downloaded}
                            aria-label={
                              selected
                                ? `Remove ${item.title} from selection`
                                : `Select ${item.title}`
                            }
                            className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 ${
                              downloaded
                                ? "pointer-events-none w-0 scale-75 opacity-0"
                                : selected
                                  ? "bg-[#73D216] text-white"
                                  : "bg-[#14112C] text-white"
                            }`}
                          >
                            {downloaded ? (
                              <Check size={14} />
                            ) : selected ? (
                              <Check size={14} />
                            ) : (
                              <Plus size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {canLoadMore ? (
        <div className="mt-6 flex justify-center">
          <button
            onClick={props.onLoadMore}
            disabled={props.loading}
            className="flex items-center gap-2 rounded-xl bg-[#2D2D44] px-6 py-3 font-bold text-white shadow-pop transition-all hover:bg-[#3b3b55] hover:shadow-pop-hover"
          >
            {props.loading ? (
              <LoaderCircle className="animate-spin" size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
            Load More Results
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SubmissionPreview(props: {
  submission: SubmissionCard;
  alt: string;
  className: string;
  variant?: "full" | "card";
  refreshToken: number;
}) {
  const sources = getPreviewSources(props.submission, props.variant);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [
    props.submission.submissionId,
    props.submission.thumbnailUrl,
    props.submission.previewUrl,
    props.submission.screenUrl,
    props.submission.fullUrl,
    props.submission.latestPreviewUrl,
    props.submission.latestThumbnailUrl,
    props.refreshToken,
  ]);

  const source = sources[sourceIndex];

  if (!source) {
    return (
      <PreviewFallback
        submission={props.submission}
        className={props.className}
      />
    );
  }

  return (
    <img
      key={`${props.submission.submissionId}-${props.refreshToken}-${sourceIndex}`}
      src={source}
      sizes={
        props.variant === "full"
          ? "(min-width: 768px) 60vw, 100vw"
          : "(min-width: 1280px) 26vw, (min-width: 768px) 42vw, 100vw"
      }
      alt={props.alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setSourceIndex((current) => current + 1);
      }}
      className={props.className}
    />
  );
}

function getPreviewSources(
  submission: SubmissionCard,
  variant: "full" | "card" = "card",
) {
  const ordered =
    variant === "full"
      ? [
          submission.fullUrl,
          submission.screenUrl,
          submission.previewUrl,
          submission.latestPreviewUrl,
          submission.thumbnailUrl,
          submission.latestThumbnailUrl,
        ]
      : [
          submission.previewUrl,
          submission.latestPreviewUrl,
          submission.screenUrl,
          submission.thumbnailUrl,
          submission.latestThumbnailUrl,
          submission.fullUrl,
        ];

  return [...new Set(ordered.filter((value): value is string => Boolean(value)))];
}

function PreviewFallback(props: {
  submission: SubmissionCard;
  className: string;
}) {
  const { icon, label } = getPreviewFallbackContent(props.submission);

  return (
    <div
      className={`${props.className} flex items-center justify-center bg-linear-to-br from-[#eef1ff] via-[#f7f8ff] to-[#e8ffef] text-[#2D2D44] dark:from-[#17142a] dark:via-[#1d1737] dark:to-[#11251d] dark:text-white`}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="rounded-full border border-current/15 bg-white/70 p-4 dark:bg-white/8">
          {icon}
        </div>
        <div className="text-xs font-black tracking-[0.16em] uppercase opacity-70">
          {label}
        </div>
      </div>
    </div>
  );
}

function getPreviewFallbackContent(submission: SubmissionCard) {
  const typeName = submission.typeName.toLowerCase();
  const primaryMime = (
    submission.mimeType ||
    submission.latestMimeType ||
    ""
  ).toLowerCase();

  if (
    submission.submissionTypeId === 12 ||
    primaryMime.startsWith("text/") ||
    typeName.includes("writing") ||
    typeName.includes("document")
  ) {
    return {
      icon: <FileText size={30} />,
      label: "Writing",
    };
  }

  if (primaryMime.startsWith("image/")) {
    return {
      icon: <FileImage size={30} />,
      label: "Image",
    };
  }

  return {
    icon: <File size={30} />,
    label: "File",
  };
}

function formatFileCount(pageCount: number) {
  const count = Math.max(1, pageCount || 0);
  return `${count} file${count === 1 ? "" : "s"}`;
}

function getPanelItems(results: SubmissionCard[], startIndex: number) {
  if (results.length <= PANEL_WINDOW_SIZE) {
    return results;
  }

  const safeStart = Math.max(
    0,
    Math.min(startIndex, results.length - PANEL_WINDOW_SIZE),
  );
  return results.slice(safeStart, safeStart + PANEL_WINDOW_SIZE);
}

function getPanelWindowStart(resultCount: number, activeIndex: number) {
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;
  return Math.max(0, Math.min(safeIndex - 2, resultCount - PANEL_WINDOW_SIZE));
}

function buildSubmissionDownloadSummaries(
  queue: QueueSnapshot,
  pendingDownloadSubmissionIds: string[],
) {
  const summaries = new Map<string, SubmissionDownloadSummary>();
  const pendingSubmissionIds = new Set(pendingDownloadSubmissionIds);
  const jobsBySubmission = new Map<string, DownloadJobSnapshot[]>();

  for (const job of queue.jobs) {
    if (!job.submissionId) {
      continue;
    }
    const jobs = jobsBySubmission.get(job.submissionId) ?? [];
    jobs.push(job);
    jobsBySubmission.set(job.submissionId, jobs);
  }

  const submissionIds = new Set([
    ...pendingSubmissionIds,
    ...jobsBySubmission.keys(),
  ]);

  for (const submissionId of submissionIds) {
    const jobs = jobsBySubmission.get(submissionId) ?? [];
    if (jobs.length === 0) {
      summaries.set(submissionId, {
        state: "queued",
        progress: 0,
      });
      continue;
    }

    if (jobs.every((job) => job.status === "completed")) {
      summaries.set(submissionId, {
        state: "downloaded",
        progress: 1,
      });
      continue;
    }

    const anyActive = jobs.some((job) => job.status === "active");
    const anyQueued = jobs.some((job) => job.status === "queued");
    const state =
      anyActive
        ? "downloading"
        : anyQueued || pendingSubmissionIds.has(submissionId)
          ? "queued"
          : "idle";

    summaries.set(submissionId, {
      state,
      progress: getSubmissionProgress(jobs),
    });
  }

  return summaries;
}

function getSubmissionProgress(jobs: DownloadJobSnapshot[]) {
  let knownBytes = 0;
  let writtenBytes = 0;
  let fallbackProgressTotal = 0;
  let fallbackProgressCount = 0;

  for (const job of jobs) {
    const totalBytes = Math.max(0, job.totalBytes || 0);
    const bytesWritten = Math.max(0, job.bytesWritten || 0);
    if (totalBytes > 0) {
      knownBytes += totalBytes;
      writtenBytes += Math.min(bytesWritten, totalBytes);
      continue;
    }

    fallbackProgressTotal +=
      job.status === "completed" ? 1 : clampProgress(job.progress);
    fallbackProgressCount++;
  }

  if (knownBytes > 0) {
    return clampProgress(writtenBytes / knownBytes);
  }
  if (fallbackProgressCount > 0) {
    return clampProgress(fallbackProgressTotal / fallbackProgressCount);
  }
  return 0;
}

function formatDownloadStatus(summary: SubmissionDownloadSummary) {
  if (summary.state === "queued") {
    return "Queued";
  }
  if (summary.state === "downloading") {
    return "Downloading";
  }
  if (summary.state === "downloaded") {
    return "Downloaded";
  }
  return "Ready";
}

function renderDownloadIcon(state: SubmissionDownloadState, size: number) {
  if (state === "queued" || state === "downloading") {
    return <LoaderCircle className="animate-spin" size={size} />;
  }
  if (state === "downloaded") {
    return <Check size={size} />;
  }
  return <Download size={size} />;
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function GridDownloadButton(props: {
  title: string;
  summary: SubmissionDownloadSummary;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  const progress =
    props.summary.state === "downloaded"
      ? 1
      : props.summary.state === "queued"
        ? Math.max(props.summary.progress, 0.08)
        : props.summary.state === "downloading"
          ? Math.max(props.summary.progress, 0.1)
          : 0;

  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={`Download ${props.title}`}
      disabled={props.summary.state !== "idle"}
      className={`relative flex h-8 w-8 items-center justify-center rounded-full shadow-sm backdrop-blur-md transition-all duration-300 ${
        props.summary.state === "downloaded"
          ? "translate-x-10 bg-[#73D216]/85 text-white"
          : props.summary.state === "queued" ||
              props.summary.state === "downloading"
            ? "bg-[#2A7FA6] text-white"
            : "bg-[#2A7FA6] text-white hover:scale-105"
      } disabled:cursor-default disabled:hover:scale-100`}
    >
      {props.summary.state === "queued" || props.summary.state === "downloading" ? (
        <CircularProgressIcon progress={progress} />
      ) : props.summary.state === "downloaded" ? (
        <Check size={14} />
      ) : (
        <Download size={14} />
      )}
    </button>
  );
}

function CircularProgressIcon(props: { progress: number }) {
  const size = 20;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clampProgress(props.progress));

  return (
    <span className="relative flex h-5 w-5 items-center justify-center">
      <svg
        className="-rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}
