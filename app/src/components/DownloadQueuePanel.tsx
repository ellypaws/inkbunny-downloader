import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowUpRight,
  ChevronsDown,
  Download,
  FileImage,
  FolderOpen,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import ElasticSlider from "./ElasticSlider";
import {
  MAX_CONCURRENT_DOWNLOADS,
  MIN_CONCURRENT_DOWNLOADS,
} from "../lib/constants";
import { formatBytes } from "../lib/format";
import type { QueueSnapshot } from "../lib/types";

const FILTERABLE_QUEUE_STATUSES = [
  "active",
  "queued",
  "completed",
  "failed",
] as const;

type QueueFilterStatus = (typeof FILTERABLE_QUEUE_STATUSES)[number];

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
  const [followActiveDownload, setFollowActiveDownload] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<QueueFilterStatus[]>(
    [],
  );
  const selectedStatusSet = useMemo(
    () => new Set<QueueFilterStatus>(selectedStatuses),
    [selectedStatuses],
  );
  const showAllJobs =
    selectedStatuses.length === 0 ||
    selectedStatuses.length === FILTERABLE_QUEUE_STATUSES.length;
  const visibleJobs = useMemo(() => {
    if (showAllJobs) {
      return props.queue.jobs;
    }
    return props.queue.jobs.filter((job) =>
      selectedStatusSet.has(job.status as QueueFilterStatus),
    );
  }, [props.queue.jobs, selectedStatusSet, showAllJobs]);
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
    if (!followActiveDownload || firstActiveIndex < 0) {
      return;
    }
    autoScrollIgnoreUntilRef.current = performance.now() + 400;
    rowVirtualizer.scrollToIndex(firstActiveIndex, {
      align: "start",
      behavior: "smooth",
    });
  }, [firstActiveIndex, followActiveDownload, rowVirtualizer]);

  function handleQueueScroll() {
    if (!followActiveDownload) {
      return;
    }
    if (performance.now() <= autoScrollIgnoreUntilRef.current) {
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

  return (
    <section
      className="theme-panel relative overflow-hidden rounded-toy-sm border p-5 shadow-pop backdrop-blur-2xl md:min-h-[95vh] md:p-6"
      data-tour-anchor="queue-panel"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--theme-accent-soft),transparent_28%),radial-gradient(circle_at_bottom_left,var(--theme-surface-soft),transparent_24%)] opacity-80" />

      <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-display text-3xl font-black text-[var(--theme-accent-strong)] md:text-[2.55rem]">
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

      <div className="theme-panel-soft relative z-10 mt-4 flex flex-col gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={props.onOpenDownloadFolder}
              className="theme-button-secondary flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5"
            >
              <FolderOpen size={16} />
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

          <div className="theme-panel-strong min-w-[13rem] flex-1 rounded-2xl border px-4 pt-3 shadow-sm md:max-w-[17rem]">
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
        <div className="theme-panel-soft relative z-10 mt-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm motion-safe:animate-[fade-in_220ms_ease-out]">
          {props.message}
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
            className="theme-panel-muted h-[75vh] min-h-[26rem] overflow-y-auto rounded-toy-sm border p-2 backdrop-blur-md"
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
  onCancel: (jobId: string) => void;
  onCancelSubmission: (submissionId: string) => void;
  onRetry: (jobId: string) => void;
}) {
  const { job } = props;
  const actionable = job.status === "queued" || job.status === "active";
  const retryable = job.status === "failed";
  const showAttemptChip =
    job.status === "queued" || (actionable && (job.attempt || 1) > 1);
  const submissionUrl = `https://inkbunny.net/s/${job.submissionId}`;
  const submissionLabel = job.title || `Submission ${job.submissionId}`;
  const progress =
    job.status === "completed"
      ? 100
      : Math.max(Math.round((job.progress || 0) * 100), actionable ? 4 : 0);

  return (
    <div
      tabIndex={0}
      className="theme-panel-strong group relative overflow-hidden rounded-[1.3rem] border px-3 py-2.5 shadow-sm outline-none transition-[transform,box-shadow,border-color,background-color] motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5 hover:shadow-lg focus-within:shadow-lg"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(114,159,207,0.12),transparent_35%,var(--theme-accent-soft))] opacity-0 transition-opacity motion-safe:duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />

      <div className="relative flex items-start gap-3">
        <QueueThumbnail
          src={job.previewUrl}
          alt={job.fileName || job.title || job.submissionId}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="theme-title truncate text-sm font-black md:text-[0.95rem]">
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
                  href={submissionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="theme-panel-soft theme-hover inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black text-[var(--theme-info)] transition-colors hover:text-[var(--theme-info-strong)]"
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
                      <button
                        type="button"
                        onClick={() => props.onCancelSubmission(job.submissionId)}
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

          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--theme-surface-soft)]">
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
      <div className="theme-panel-soft theme-muted flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border text-[9px] font-black">
        <FileImage size={14} />
        <span>Preview</span>
      </div>
    );
  }

  return (
    <img
      src={props.src}
      alt={props.alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-strong)] object-cover"
    />
  );
}

function AutoClearToggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="theme-panel-strong flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm font-black shadow-sm">
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
