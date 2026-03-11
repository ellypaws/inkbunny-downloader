import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowUpRight,
  ChevronsDown,
  Download,
  FileImage,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type TouchEvent,
  type UIEvent,
  type WheelEvent,
} from "react";

import ElasticSlider from "./ElasticSlider";
import FolderPopout from "./FolderPopout";
import {
  MAX_CONCURRENT_DOWNLOADS,
  MIN_CONCURRENT_DOWNLOADS,
} from "../lib/constants";
import { formatBytes } from "../lib/format";
import { resolveExternalLinkURL, resolveMediaURL } from "../lib/wails";
import type { QueueSnapshot } from "../lib/types";

const FILTERABLE_QUEUE_STATUSES = [
  "active",
  "queued",
  "completed",
  "failed",
] as const;

type QueueFilterStatus = (typeof FILTERABLE_QUEUE_STATUSES)[number];

const AUTO_SCROLL_IGNORE_MS = 400;
const USER_SCROLL_INTENT_WINDOW_MS = 1200;
const USER_SCROLL_DISABLE_THRESHOLD_PX = 4;
const QUEUE_THUMBNAIL_STORAGE_KEY = "inkbunny.queue.show-thumbnails";
const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
]);

type DownloadQueuePanelProps = {
  queue: QueueSnapshot;
  message: string;
  maxActive: number;
  selectedCount: number;
  canQueueDownloads: boolean;
  canStopAll: boolean;
  canPauseAll: boolean;
  canResumeAll: boolean;
  canRetryAll: boolean;
  allSelected: boolean;
  autoClearCompleted: boolean;
  canOpenDownloadFolder: boolean;
  folderPreviewImages: string[][];
  onOpenDownloadFolder: () => void;
  onClearQueue: () => void;
  onClearCompleted: () => void;
  onQueueDownloads: () => void;
  onRetryAll: () => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onStopAll: () => void;
  onToggleSelectAll: () => void;
  onToggleAutoClearCompleted: (enabled: boolean) => void;
  onMaxActiveChange: (value: number) => void;
  onCancel: (jobId: string) => void;
  onCancelSubmission: (submissionId: string) => void;
  onRetry: (jobId: string) => void;
};

export function DownloadQueuePanel(props: DownloadQueuePanelProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const autoScrollIgnoreUntilRef = useRef(0);
  const userScrollIntentUntilRef = useRef(0);
  const lastObservedScrollTopRef = useRef(0);
  const [followActiveDownload, setFollowActiveDownload] = useState(false);
  const [highlightedSubmissionId, setHighlightedSubmissionId] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<QueueFilterStatus[]>(
    [],
  );
  const [showThumbnails, setShowThumbnails] = useState(
    loadSavedQueueThumbnailVisibility,
  );
  const selectedStatusSet = useMemo(
    () => new Set<QueueFilterStatus>(selectedStatuses),
    [selectedStatuses],
  );
  const showAllJobs =
    selectedStatuses.length === 0 ||
    selectedStatuses.length === FILTERABLE_QUEUE_STATUSES.length;
  const hiddenCompletedJobs = Math.max(
    0,
    props.queue.completedCount -
      props.queue.jobs.filter((job) => job.status === "completed").length,
  );
  const hiddenCancelledJobs = Math.max(
    0,
    props.queue.cancelledCount -
      props.queue.jobs.filter((job) => job.status === "cancelled").length,
  );
  const hiddenJobCount = hiddenCompletedJobs + hiddenCancelledJobs;
  const visibleJobs = useMemo(() => {
    if (showAllJobs) {
      return props.queue.jobs;
    }
    return props.queue.jobs.filter((job) =>
      selectedStatusSet.has(job.status as QueueFilterStatus),
    );
  }, [props.queue.jobs, selectedStatusSet, showAllJobs]);
  const submissionJobCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of props.queue.jobs) {
      counts.set(job.submissionId, (counts.get(job.submissionId) ?? 0) + 1);
    }
    return counts;
  }, [props.queue.jobs]);
  const rowVirtualizer = useVirtualizer({
    count: visibleJobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 78,
    overscan: 8,
  });
  const firstActiveIndex = visibleJobs.findIndex(
    (job) => job.status === "active",
  );
  const hasActiveDownload = firstActiveIndex >= 0;

  useEffect(() => {
    if (!hasActiveDownload && followActiveDownload) {
      setFollowActiveDownload(false);
    }
  }, [followActiveDownload, hasActiveDownload]);

  useEffect(() => {
    if (!highlightedSubmissionId) {
      return;
    }
    if ((submissionJobCounts.get(highlightedSubmissionId) ?? 0) > 1) {
      return;
    }
    setHighlightedSubmissionId("");
  }, [highlightedSubmissionId, submissionJobCounts]);

  useEffect(() => {
    if (!followActiveDownload || firstActiveIndex < 0) {
      return;
    }
    autoScrollIgnoreUntilRef.current = performance.now() + AUTO_SCROLL_IGNORE_MS;
    rowVirtualizer.scrollToIndex(firstActiveIndex, {
      align: "start",
      behavior: "smooth",
    });
  }, [firstActiveIndex, followActiveDownload, rowVirtualizer]);

  useEffect(() => {
    lastObservedScrollTopRef.current = parentRef.current?.scrollTop ?? 0;
  }, [followActiveDownload, visibleJobs.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      QUEUE_THUMBNAIL_STORAGE_KEY,
      showThumbnails ? "1" : "0",
    );
  }, [showThumbnails]);

  function markUserScrollIntent() {
    userScrollIntentUntilRef.current =
      performance.now() + USER_SCROLL_INTENT_WINDOW_MS;
  }

  function handleQueuePointerDown(event: PointerEvent<HTMLDivElement>) {
    const currentTarget = event.currentTarget;
    const verticalScrollbarWidth =
      currentTarget.offsetWidth - currentTarget.clientWidth;
    if (verticalScrollbarWidth <= 0) {
      return;
    }
    const bounds = currentTarget.getBoundingClientRect();
    if (event.clientX >= bounds.right - verticalScrollbarWidth - 2) {
      markUserScrollIntent();
    }
  }

  function handleQueueKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!SCROLL_KEYS.has(event.key)) {
      return;
    }
    markUserScrollIntent();
  }

  function handleQueueScroll(event: UIEvent<HTMLDivElement>) {
    const nextScrollTop = event.currentTarget.scrollTop;
    const scrollDelta = Math.abs(nextScrollTop - lastObservedScrollTopRef.current);
    lastObservedScrollTopRef.current = nextScrollTop;

    if (!followActiveDownload) {
      return;
    }
    if (performance.now() <= autoScrollIgnoreUntilRef.current) {
      return;
    }
    if (scrollDelta < USER_SCROLL_DISABLE_THRESHOLD_PX) {
      return;
    }
    if (performance.now() > userScrollIntentUntilRef.current) {
      return;
    }
    setFollowActiveDownload(false);
  }

  function handleToggleStatus(status: QueueFilterStatus) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status],
    );
  }

  function handleOpenFolderClick() {
    if (shouldAnimateFolderOnly()) {
      return;
    }
    props.onOpenDownloadFolder();
  }

  return (
    <section
      className="theme-panel relative overflow-visible rounded-toy-sm border p-3.5 shadow-pop backdrop-blur-2xl sm:p-5 md:min-h-[95vh] md:p-6"
      data-tour-anchor="queue-panel"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--theme-accent-soft),transparent_28%),radial-gradient(circle_at_bottom_left,var(--theme-surface-soft),transparent_24%)] opacity-80" />

      <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-display text-2xl font-black text-[var(--theme-accent-strong)] sm:text-[2.2rem] md:text-[2.55rem]">
            Download Queue
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black">
          <StatChip
            tone="active"
            label={`${props.queue.activeCount} downloading`}
            pressed={selectedStatusSet.has("active")}
            onClick={() => handleToggleStatus("active")}
          />
          <StatChip
            tone="queued"
            label={`${props.queue.queuedCount} queued`}
            pressed={selectedStatusSet.has("queued")}
            onClick={() => handleToggleStatus("queued")}
          />
          <StatChip
            tone="completed"
            label={`${props.queue.completedCount} completed`}
            pressed={selectedStatusSet.has("completed")}
            onClick={() => handleToggleStatus("completed")}
          />
          <StatChip
            tone="failed"
            label={`${props.queue.failedCount} failed`}
            pressed={selectedStatusSet.has("failed")}
            onClick={() => handleToggleStatus("failed")}
          />
        </div>
      </div>

      <div className="theme-panel-soft relative z-20 mt-3 overflow-visible flex flex-col gap-3 rounded-2xl border px-3 py-3 backdrop-blur-xl sm:mt-4 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3 overflow-visible">
          <div className="flex flex-wrap gap-2.5 overflow-visible">
            <button
              type="button"
              onClick={handleOpenFolderClick}
              disabled={!props.canOpenDownloadFolder}
              className="relative z-30 flex h-12 w-14 items-center justify-center overflow-visible px-1 py-1 transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-45"
              aria-label="Open download folder"
              title="Open download folder"
            >
              <FolderPopout images={props.folderPreviewImages} />
            </button>
            <button
              type="button"
              onClick={props.onClearCompleted}
              disabled={props.queue.completedCount === 0}
              className="theme-button-secondary flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Trash2 size={16} />
              Completed
            </button>
            <button
              type="button"
              onClick={props.onClearQueue}
              disabled={props.queue.jobs.length === 0}
              className="theme-button-secondary rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={props.onToggleSelectAll}
              disabled={props.selectedCount === 0 && props.allSelected}
              className="theme-button-secondary rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
            >
              {props.allSelected ? "Deselect" : "Select All"}
            </button>
            <button
              type="button"
              onClick={props.onQueueDownloads}
              disabled={!props.canQueueDownloads}
              className="theme-button-accent flex items-center gap-2 rounded-2xl border-b-8 px-4 py-2.5 text-sm font-black shadow-xl transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-60"
              data-tour-anchor="queue-download"
            >
              <Download size={16} />
              Download
            </button>
            <button
              type="button"
              onClick={props.onRetryAll}
              disabled={!props.canRetryAll}
              className="theme-button-secondary flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
              title="Retry every failed download"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={props.onPauseAll}
              disabled={!props.canPauseAll}
              className="theme-button-secondary flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
              title="Pause queued and active downloads"
            >
              <Pause size={15} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={props.onResumeAll}
              disabled={!props.canResumeAll}
              className="theme-button-secondary flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
              title="Resume paused downloads"
            >
              <Play size={15} className="fill-current" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={props.onStopAll}
              disabled={!props.canStopAll}
              className="theme-button-danger flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
              title="Stop every queued or active download"
            >
              <Square size={15} className="fill-current" strokeWidth={2.5} />
            </button>

            <AutoClearToggle
              checked={props.autoClearCompleted}
              onChange={props.onToggleAutoClearCompleted}
            />
            <QueueThumbnailToggle
              checked={showThumbnails}
              onChange={setShowThumbnails}
            />
            <button
              type="button"
              aria-pressed={followActiveDownload}
              disabled={!hasActiveDownload}
              onClick={() =>
                setFollowActiveDownload((current) =>
                  hasActiveDownload ? !current : false,
                )
              }
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 ${
                followActiveDownload
                  ? "border-[var(--theme-accent)] bg-[var(--theme-accent)] text-white"
                  : "theme-button-secondary"
              } disabled:cursor-not-allowed disabled:opacity-40`}
              title={
                followActiveDownload
                  ? "Following the first active download"
                  : "Follow the first active download"
              }
            >
              <ChevronsDown size={18} strokeWidth={2.6} />
            </button>
          </div>

          <div className="theme-panel-strong min-w-[10rem] flex-1 rounded-2xl border px-4 pt-3 shadow-sm md:max-w-[17rem]">
            <ElasticSlider
              value={props.maxActive}
              onChange={props.onMaxActiveChange}
              startingValue={MIN_CONCURRENT_DOWNLOADS}
              maxValue={MAX_CONCURRENT_DOWNLOADS}
              isStepped
              stepSize={1}
              valueFormatter={(value) => `${Math.round(value)} at once`}
              leftIcon={<span className="text-xs font-black">1</span>}
              rightIcon={
                <span className="text-xs font-black">
                  {MAX_CONCURRENT_DOWNLOADS}
                </span>
              }
              className="w-full"
            />
          </div>
        </div>
      </div>

      {props.message ? (
        <div className="theme-panel-soft relative z-10 mt-3 rounded-2xl border px-3 py-3 text-sm font-bold shadow-sm motion-safe:animate-[fade-in_220ms_ease-out] sm:px-4">
          {props.message}
        </div>
      ) : null}

      {hiddenJobCount > 0 ? (
        <div className="theme-panel-soft relative z-10 mt-3 rounded-2xl border px-3 py-3 text-xs font-semibold shadow-sm sm:px-4 sm:text-sm">
          Showing active, failed, and recent history only.
          Hidden: {hiddenCompletedJobs} completed, {hiddenCancelledJobs} cancelled.
        </div>
      ) : null}

      <div className="relative z-10 mt-4">
        {props.queue.jobs.length === 0 ? (
          <div className="theme-panel-soft theme-muted rounded-toy-sm border px-5 py-12 text-center font-bold">
            No queued downloads yet.
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className="theme-panel-soft theme-muted rounded-toy-sm border px-5 py-12 text-center font-bold">
            No downloads match the selected filters.
          </div>
        ) : (
          <div
            ref={parentRef}
            onScroll={handleQueueScroll}
            onWheelCapture={(_event: WheelEvent<HTMLDivElement>) =>
              markUserScrollIntent()
            }
            onTouchMoveCapture={(_event: TouchEvent<HTMLDivElement>) =>
              markUserScrollIntent()
            }
            onPointerDownCapture={handleQueuePointerDown}
            onKeyDownCapture={handleQueueKeyDown}
            className="theme-panel-muted h-[68vh] min-h-[22rem] overflow-y-auto rounded-toy-sm border p-1.5 backdrop-blur-md sm:h-[75vh] sm:min-h-[26rem] sm:p-2"
          >
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const job = visibleJobs[virtualRow.index];
                if (!job) {
                  return null;
                }

                return (
                  <div
                    key={job.id}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full px-1 py-1"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <QueueRow
                      job={job}
                      showThumbnail={showThumbnails}
                      submissionJobCount={
                        submissionJobCounts.get(job.submissionId) ?? 0
                      }
                      submissionHighlighted={
                        highlightedSubmissionId !== "" &&
                        highlightedSubmissionId === job.submissionId
                      }
                      onSubmissionHighlightChange={setHighlightedSubmissionId}
                      onCancel={props.onCancel}
                      onCancelSubmission={props.onCancelSubmission}
                      onRetry={props.onRetry}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function QueueRow(props: {
  job: QueueSnapshot["jobs"][number];
  showThumbnail: boolean;
  submissionJobCount: number;
  submissionHighlighted: boolean;
  onSubmissionHighlightChange: (submissionId: string) => void;
  onCancel: (jobId: string) => void;
  onCancelSubmission: (submissionId: string) => void;
  onRetry: (jobId: string) => void;
}) {
  const { job } = props;
  const actionable = job.status === "queued" || job.status === "active";
  const retryable = job.status === "failed";
  const showSubmissionCancel = actionable && props.submissionJobCount > 1;
  const showAttemptChip =
    job.status === "queued" || (actionable && (job.attempt || 1) > 1);
  const submissionUrl = `https://inkbunny.net/s/${job.submissionId}`;
  const submissionLabel = job.title || `Submission ${job.submissionId}`;
  const progress =
    job.status === "completed"
      ? 100
      : Math.round((job.progress || 0) * 100);

  return (
    <div
      tabIndex={0}
      className={`theme-panel-strong group relative overflow-hidden rounded-[1.15rem] border px-2.5 py-2 shadow-sm outline-none transition-[transform,box-shadow,border-color,background-color] motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5 hover:shadow-lg focus-within:shadow-lg sm:rounded-[1.3rem] sm:px-3 sm:py-2.5 ${
        props.submissionHighlighted
          ? "border-[#CC5E00] ring-2 ring-[#CC5E00]/55"
          : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(114,159,207,0.12),transparent_35%,var(--theme-accent-soft))] opacity-0 transition-opacity motion-safe:duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />

      <div
        className={`relative flex items-start ${
          props.showThumbnail ? "gap-2.5 sm:gap-3" : "gap-0"
        }`}
      >
        {props.showThumbnail ? (
          <QueueThumbnail
            src={job.previewUrl}
            alt={job.fileName || job.title || job.submissionId}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="theme-title truncate text-[13px] font-black md:text-[0.95rem]">
                  {job.fileName}
                </div>
                {job.fileExists ? (
                  <span className="rounded-full bg-[var(--theme-success-soft)] px-2 py-1 text-[10px] font-black text-[var(--theme-success)]">
                    On disk
                  </span>
                ) : null}
                {showAttemptChip ? (
                  <span className="theme-panel-soft rounded-full border px-2 py-1 text-[10px] font-black text-[var(--theme-muted)]">
                    Attempt {job.attempt || 1}
                  </span>
                ) : null}
                <a
                  href={resolveExternalLinkURL(submissionUrl) ?? submissionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="theme-panel-soft theme-hover inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black text-[var(--theme-info)] transition-colors hover:text-[var(--theme-info-strong)] sm:text-[10px]"
                  title={`Open submission ${job.submissionId}`}
                >
                  <ArrowUpRight size={11} strokeWidth={2.4} />
                  <span className="truncate">{submissionLabel}</span>
                </a>
              </div>
              <div className="theme-subtle mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold">
                <span className="truncate">@{job.username}</span>
                <span className="h-1 w-1 rounded-full bg-current/60" />
                <span>
                  {formatBytes(job.bytesWritten)} / {formatBytes(job.totalBytes)}
                </span>
                <span className="h-1 w-1 rounded-full bg-current/60" />
                <span>{progress}%</span>
                <span className="h-1 w-1 rounded-full bg-current/60" />
                <span className="truncate">
                  {job.title || "Untitled submission"}
                </span>
              </div>
            </div>

            <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
              <StatusBadge status={job.status} />
              {retryable ? (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => props.onRetry(job.id)}
                    className="theme-button-secondary flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5"
                    title={`Retry ${job.fileName}`}
                  >
                    <RefreshCw size={11} strokeWidth={2.4} />
                    Retry
                  </button>
                </div>
              ) : (
                <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
                  {actionable ? (
                    <>
                      {showSubmissionCancel ? (
                        <button
                          type="button"
                          onClick={() => props.onCancelSubmission(job.submissionId)}
                          onMouseEnter={() =>
                            props.onSubmissionHighlightChange(job.submissionId)
                          }
                          onMouseLeave={() =>
                            props.onSubmissionHighlightChange("")
                          }
                          onFocus={() =>
                            props.onSubmissionHighlightChange(job.submissionId)
                          }
                          onBlur={() => props.onSubmissionHighlightChange("")}
                          className="theme-button-danger flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5"
                          title={`Stop every file for submission ${job.submissionId}`}
                        >
                          <Square
                            size={11}
                            className="fill-current"
                            strokeWidth={2.5}
                          />
                          Submission
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => props.onCancel(job.id)}
                        className="theme-button-secondary flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5"
                      >
                        <X size={11} strokeWidth={2.5} />
                        File
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--theme-surface-soft)] sm:mt-2.5 sm:h-2">
            <div
              className={`h-full rounded-full transition-[width,background-color] motion-safe:duration-500 motion-safe:ease-out ${getProgressBarClass(job.status)}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {job.error ? (
            <div className="mt-2 rounded-2xl bg-[var(--theme-danger-soft)] px-3 py-2 text-[11px] font-bold text-[var(--theme-danger)]">
              {job.error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QueueThumbnail(props: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!props.src || failed) {
    return (
      <div className="theme-panel-soft theme-muted flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-[8px] font-black sm:h-12 sm:w-12 sm:gap-1 sm:text-[9px]">
        <FileImage size={14} />
        <span>Preview</span>
      </div>
    );
  }

  return (
    <img
      src={resolveMediaURL(props.src) ?? props.src}
      alt={props.alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true);
      }}
      className="h-10 w-10 shrink-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-strong)] object-cover sm:h-12 sm:w-12"
    />
  );
}

function shouldAnimateFolderOnly() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none), (pointer: coarse)").matches
  );
}

function AutoClearToggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="theme-panel-strong flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-xs font-black shadow-sm sm:gap-3 sm:text-sm">
      <span className="theme-title">Auto-clear</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={`relative h-7 w-12 rounded-full border transition-all motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:scale-[1.03] ${
          props.checked
            ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]"
            : "border-[var(--theme-border)] bg-[var(--theme-surface-soft)]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-white shadow-md transition-transform motion-safe:duration-300 motion-safe:ease-out ${
            props.checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

function QueueThumbnailToggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="theme-panel-strong flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-xs font-black shadow-sm sm:gap-3 sm:text-sm">
      <FileImage size={14} className="text-[var(--theme-info)]" />
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        title={props.checked ? "Hide queue thumbnails" : "Show queue thumbnails"}
        className={`relative h-7 w-12 rounded-full border transition-all motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:scale-[1.03] ${
          props.checked
            ? "border-[var(--theme-accent)] bg-[var(--theme-accent)]"
            : "border-[var(--theme-border)] bg-[var(--theme-surface-soft)]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-white shadow-md transition-transform motion-safe:duration-300 motion-safe:ease-out ${
            props.checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

function StatChip(props: {
  tone: "active" | "queued" | "completed" | "failed";
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  const className =
    props.tone === "active"
      ? "bg-[#73D216]/16 text-[#4E9A06]"
      : props.tone === "queued"
        ? "bg-[#89CFF0]/16 text-[#3465A4]"
        : props.tone === "completed"
          ? "bg-[#B5EAD7]/20 text-[#2F7A43]"
          : "bg-[#FFB7B2]/20 text-[#CC5E00]";

  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      onClick={props.onClick}
      className={`cursor-pointer rounded-full border px-3 py-2 transition-all motion-safe:duration-200 motion-safe:hover:scale-[1.04] ${
        props.pressed
          ? `${className} border-current shadow-sm`
          : `${className} border-transparent opacity-75 hover:opacity-100`
      }`}
      title={`Filter by ${props.label}`}
    >
      {props.label}
    </button>
  );
}

function StatusBadge(props: { status: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-[11px] font-black ${getStatusBadgeClass(
        props.status,
      )}`}
    >
      {props.status}
    </span>
  );
}

function getStatusBadgeClass(status: string) {
  if (status === "completed") {
    return "bg-[#B5EAD7] text-[#2F7A43]";
  }
  if (status === "failed") {
    return "bg-[#FFB7B2] text-[#CC5E00]";
  }
  if (status === "cancelled") {
    return "bg-[var(--theme-surface-soft)] text-[var(--theme-muted)]";
  }
  if (status === "active") {
    return "bg-[#73D216] text-white";
  }
  return "bg-[#89CFF0] text-[#204A87]";
}

function getProgressBarClass(status: string) {
  if (status === "failed") {
    return "bg-[#CC5E00]";
  }
  if (status === "completed") {
    return "bg-[#73D216]";
  }
  if (status === "cancelled") {
    return "bg-[var(--theme-subtle)]";
  }
  return "bg-linear-to-r from-[#729FCF] to-[#76B900]";
}

function loadSavedQueueThumbnailVisibility() {
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem(QUEUE_THUMBNAIL_STORAGE_KEY) !== "0";
}
