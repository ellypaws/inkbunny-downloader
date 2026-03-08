import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Download,
  FileImage,
  FolderOpen,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import ElasticSlider from "./ElasticSlider";
import {
  MAX_CONCURRENT_DOWNLOADS,
  MIN_CONCURRENT_DOWNLOADS,
} from "../lib/constants";
import { formatBytes } from "../lib/format";
import type { QueueSnapshot } from "../lib/types";

type DownloadQueuePanelProps = {
  queue: QueueSnapshot;
  message: string;
  maxActive: number;
  selectedCount: number;
  canQueueDownloads: boolean;
  canStopAll: boolean;
  allSelected: boolean;
  autoClearCompleted: boolean;
  onOpenDownloadFolder: () => void;
  onClearQueue: () => void;
  onClearCompleted: () => void;
  onQueueDownloads: () => void;
  onStopAll: () => void;
  onToggleSelectAll: () => void;
  onToggleAutoClearCompleted: (enabled: boolean) => void;
  onMaxActiveChange: (value: number) => void;
  onCancel: (jobId: string) => void;
  onCancelSubmission: (submissionId: string) => void;
};

export function DownloadQueuePanel(props: DownloadQueuePanelProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: props.queue.jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 112,
    overscan: 8,
  });

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
        <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.14em]">
          <StatChip tone="active" label={`${props.queue.activeCount} active`} />
          <StatChip tone="queued" label={`${props.queue.queuedCount} queued`} />
          <StatChip
            tone="completed"
            label={`${props.queue.completedCount} completed`}
          />
          <StatChip tone="failed" label={`${props.queue.failedCount} failed`} />
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
              Open Folder
            </button>
            <button
              type="button"
              onClick={props.onClearCompleted}
              disabled={props.queue.completedCount === 0}
              className="theme-button-secondary flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Trash2 size={16} />
              Clear Completed
            </button>
            <button
              type="button"
              onClick={props.onClearQueue}
              disabled={props.queue.jobs.length === 0}
              className="theme-button-secondary rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
            >
              Clear List
            </button>
            <button
              type="button"
              onClick={props.onToggleSelectAll}
              disabled={props.selectedCount === 0 && props.allSelected}
              className="theme-button-secondary rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
            >
              {props.allSelected ? "Deselect All" : "Select All"}
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
              onClick={props.onStopAll}
              disabled={!props.canStopAll}
              className="theme-button-danger flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-black shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 disabled:opacity-50"
              title="Stop every queued or active download"
            >
              <Square size={15} className="fill-current" strokeWidth={2.5} />
              Stop All
            </button>

            <AutoClearToggle
              checked={props.autoClearCompleted}
              onChange={props.onToggleAutoClearCompleted}
            />
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
        ) : (
          <div
            ref={parentRef}
            className="theme-panel-muted h-[75vh] min-h-[26rem] overflow-y-auto rounded-toy-sm border p-2 backdrop-blur-md"
          >
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const job = props.queue.jobs[virtualRow.index];
                if (!job) {
                  return null;
                }

                return (
                  <div
                    key={job.id}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full px-1 py-1"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <QueueRow
                      job={job}
                      onCancel={props.onCancel}
                      onCancelSubmission={props.onCancelSubmission}
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
}) {
  const { job } = props;
  const actionable = job.status === "queued" || job.status === "active";
  const progress =
    job.status === "completed"
      ? 100
      : Math.max(Math.round((job.progress || 0) * 100), actionable ? 4 : 0);

  return (
    <div
      tabIndex={0}
      className="theme-panel-strong group relative overflow-hidden rounded-[1.45rem] border px-3.5 py-3 shadow-sm outline-none transition-[transform,box-shadow,border-color,background-color] motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5 hover:shadow-lg focus-within:shadow-lg"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(114,159,207,0.12),transparent_35%,var(--theme-accent-soft))] opacity-0 transition-opacity motion-safe:duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />

      <div className="relative flex items-start gap-3">
        <QueueThumbnail
          src={job.previewUrl}
          alt={job.fileName || job.title || job.submissionId}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="theme-title truncate text-sm font-black md:text-[0.95rem]">
                  {job.fileName}
                </div>
                {job.fileExists ? (
                  <span className="rounded-full bg-[var(--theme-success-soft)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--theme-success)]">
                    On disk
                  </span>
                ) : null}
              </div>
              <div className="theme-subtle mt-1 flex items-center gap-2 text-[11px] font-semibold">
                <span className="truncate">@{job.username}</span>
                <span className="h-1 w-1 rounded-full bg-current/60" />
                <span>{progress}%</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={job.status} />
              <div className="flex max-w-0 items-center gap-2 overflow-hidden opacity-0 transition-[max-width,opacity,transform] motion-safe:duration-300 motion-safe:ease-out motion-safe:translate-x-2 group-hover:max-w-48 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:max-w-48 group-focus-within:translate-x-0 group-focus-within:opacity-100">
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
            </div>
          </div>

          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--theme-surface-soft)]">
            <div
              className={`h-full rounded-full transition-[width,background-color] motion-safe:duration-500 motion-safe:ease-out ${getProgressBarClass(job.status)}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity,margin] motion-safe:duration-300 motion-safe:ease-out group-hover:mt-3 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-focus-within:mt-3 group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100">
            <div className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold">
                <div className="theme-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {formatBytes(job.bytesWritten)} /{" "}
                    {formatBytes(job.totalBytes)}
                  </span>
                  <span>Attempt {job.attempt || 1}</span>
                  <span>ID {job.submissionId}</span>
                </div>
                <span className="theme-subtle">
                  {job.title || "Untitled submission"}
                </span>
              </div>
              {job.error ? (
                <div className="mt-2 rounded-2xl bg-[var(--theme-danger-soft)] px-3 py-2 text-[11px] font-bold text-[var(--theme-danger)]">
                  {job.error}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueThumbnail(props: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!props.src || failed) {
    return (
      <div className="theme-panel-soft theme-muted flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border text-[10px] font-black">
        <FileImage size={16} />
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
      className="h-14 w-14 shrink-0 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface-strong)] object-cover"
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
    <span className={`rounded-full px-3 py-2 ${className}`}>{props.label}</span>
  );
}

function StatusBadge(props: { status: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] ${getStatusBadgeClass(
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
