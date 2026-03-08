import { useVirtualizer } from "@tanstack/react-virtual";
import { Download, FileImage, FolderOpen, Square, X } from "lucide-react";
import { useRef, useState } from "react";

import type { QueueSnapshot } from "../lib/types";
import { formatBytes } from "../lib/format";

type DownloadQueuePanelProps = {
  queue: QueueSnapshot;
  message: string;
  selectedCount: number;
  canQueueDownloads: boolean;
  allSelected: boolean;
  onOpenDownloadFolder: () => void;
  onClearQueue: () => void;
  onQueueDownloads: () => void;
  onToggleSelectAll: () => void;
  onCancel: (jobId: string) => void;
  onCancelSubmission: (submissionId: string) => void;
};

export function DownloadQueuePanel(props: DownloadQueuePanelProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: props.queue.jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 164,
    overscan: 6,
  });

  return (
    <section className="relative rounded-toy-sm border border-[#bcc1b5]/90 bg-[#eff1ea]/92 p-8 shadow-pop backdrop-blur-2xl dark:border-[#4a5360]/90 dark:bg-[#252a31]/90 md:p-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-4xl font-black text-[#4E9A06] dark:text-[#8AE234]">
            Download Queue
          </h3>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-black">
          <span className="rounded-full bg-[#73D216]/15 px-4 py-2 text-[#4E9A06]">
            {props.queue.activeCount} active
          </span>
          <span className="rounded-full bg-[#89CFF0]/15 px-4 py-2 text-[#3465A4]">
            {props.queue.queuedCount} queued
          </span>
          <span className="rounded-full bg-[#B5EAD7]/18 px-4 py-2 text-[#4E9A06]">
            {props.queue.completedCount} completed
          </span>
          <span className="rounded-full bg-[#FFB7B2]/18 px-4 py-2 text-[#CC5E00]">
            {props.queue.failedCount} failed
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/88 px-4 py-4 backdrop-blur-xl dark:border-[#4a5360] dark:bg-[#1f252b]/80">
        <div className="text-sm font-bold text-[#555753] dark:text-white/75">
          {props.selectedCount} selected for download
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={props.onOpenDownloadFolder}
            className="flex items-center gap-2 rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/92 px-4 py-2.5 text-sm font-black text-[#333333] transition-all hover:bg-[#e8eddc] dark:border-[#4a5360] dark:bg-[#1f252b] dark:text-white dark:hover:bg-[#2f353a]"
          >
            <FolderOpen size={16} />
            Open Folder
          </button>
          <button
            type="button"
            onClick={props.onClearQueue}
            disabled={props.queue.jobs.length === 0}
            className="rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/92 px-4 py-2.5 text-sm font-black text-[#333333] transition-all hover:bg-[#e8eddc] disabled:opacity-50 dark:border-[#4a5360] dark:bg-[#1f252b] dark:text-white dark:hover:bg-[#2f353a]"
          >
            Clear List
          </button>
          <button
            type="button"
            onClick={props.onToggleSelectAll}
            disabled={props.selectedCount === 0 && props.allSelected}
            className="rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/92 px-4 py-2.5 text-sm font-black text-[#333333] transition-all hover:bg-[#e8eddc] disabled:opacity-50 dark:border-[#4a5360] dark:bg-[#1f252b] dark:text-white dark:hover:bg-[#2f353a]"
          >
            {props.allSelected ? "Deselect All" : "Select All"}
          </button>
          <button
            type="button"
            onClick={props.onQueueDownloads}
            disabled={!props.canQueueDownloads}
            className="flex items-center gap-2 rounded-2xl border-b-8 border-[#2f6d05] bg-[#73D216] px-5 py-3 text-sm font-black text-white shadow-xl transition-all hover:bg-[#4E9A06] disabled:opacity-60"
          >
            <Download size={16} />
            Download
          </button>
        </div>
      </div>

      {props.message ? (
        <div className="mt-5 rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/92 px-4 py-3 text-sm font-bold text-[#333333] dark:border-[#4a5360] dark:bg-[#1f252b]/90 dark:text-white/75">
          {props.message}
        </div>
      ) : null}

      <div className="mt-6">
        {props.queue.jobs.length === 0 ? (
          <div className="rounded-toy-sm border border-[#c2c7bc] bg-[#f7f8f2]/92 px-6 py-10 text-center font-bold text-[#555753] dark:border-[#4a5360] dark:bg-[#1f252b]/82 dark:text-white/70">
            No queued downloads yet.
          </div>
        ) : (
          <div
            ref={parentRef}
            className="h-[32rem] overflow-y-auto rounded-toy-sm border border-[#c2c7bc] bg-[#f7f8f2]/45 p-3 backdrop-blur-md dark:border-[#4a5360] dark:bg-[#1f252b]/40"
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
                    className="absolute left-0 top-0 w-full"
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

  return (
    <div className="mb-3 rounded-toy border border-[#c2c7bc] bg-[#f7f8f2]/92 px-5 py-4 dark:border-[#4a5360] dark:bg-[#1f252b]/82">
      <div className="flex items-start gap-4">
        <QueueThumbnail
          src={job.previewUrl}
          alt={job.fileName || job.title || job.submissionId}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate font-bold text-[#333333] dark:text-white">
                {job.fileName}
              </div>
              <div className="mt-1 text-xs font-black tracking-[0.12em] text-[#3465A4] dark:text-[#89CFF0]">
                {job.username} · attempt {job.attempt || 1}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-2 text-xs font-black ${
                  job.status === "completed"
                    ? "bg-[#B5EAD7] text-[#4E9A06]"
                    : job.status === "failed"
                      ? "bg-[#FFB7B2] text-[#CC5E00]"
                      : job.status === "cancelled"
                        ? "bg-[#E0BBE4] text-[#2D2D44]"
                        : job.status === "active"
                          ? "bg-[#73D216] text-white"
                          : "bg-[#89CFF0] text-[#204A87]"
                }`}
              >
                {job.status}
              </span>
              {job.status === "queued" || job.status === "active" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => props.onCancelSubmission(job.submissionId)}
                    className="flex items-center gap-1 rounded-full bg-[#14112C] px-3 py-2 text-xs font-black text-white transition-colors hover:bg-[#CC5E00]"
                  >
                    <Square size={12} className="fill-current" strokeWidth={2.5} />
                    Stop all
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onCancel(job.id)}
                    className="flex items-center gap-1 rounded-full border border-[#c2c7bc] bg-[#f7f8f2]/92 px-3 py-2 text-xs font-black text-[#333333] transition-colors hover:bg-[#e8eddc] dark:border-[#4a5360] dark:bg-[#1f252b] dark:text-white dark:hover:bg-[#2f353a]"
                  >
                    <X size={12} strokeWidth={2.5} />
                    File
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#d9ddd3] dark:bg-white/10">
            <div
              className={`h-full transition-all duration-300 ${
                job.status === "failed"
                  ? "bg-[#CC5E00]"
                  : job.status === "completed"
                    ? "bg-[#73D216]"
                    : "bg-linear-to-r from-[#729FCF] to-[#76B900]"
              }`}
              style={{
                width: `${Math.max(job.progress * 100, job.status === "completed" ? 100 : 4)}%`,
              }}
            />
          </div>
          <div className="mt-3 flex justify-between gap-4 text-xs font-bold text-[#555753] dark:text-white/70">
            <span>
              {formatBytes(job.bytesWritten)} / {formatBytes(job.totalBytes)}
            </span>
            <span>{Math.round((job.progress || 0) * 100)}%</span>
          </div>
          {job.error ? (
            <div className="mt-3 text-xs font-bold text-[#CC5E00]">
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
      <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-[#c2c7bc] bg-white/70 text-[11px] font-black text-[#555753] dark:border-[#4a5360] dark:bg-[#14112C]/65 dark:text-white/55">
        <FileImage size={18} />
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
      className="h-20 w-20 shrink-0 rounded-2xl border border-[#c2c7bc] bg-white object-cover dark:border-[#4a5360]"
    />
  );
}
