import { Download } from "lucide-react";

import type { QueueSnapshot } from "../lib/types";
import { formatBytes } from "../lib/format";

type DownloadQueuePanelProps = {
  queue: QueueSnapshot;
  message: string;
  selectedCount: number;
  canQueueDownloads: boolean;
  allSelected: boolean;
  onQueueDownloads: () => void;
  onToggleSelectAll: () => void;
  onCancel: (jobId: string) => void;
};

export function DownloadQueuePanel(props: DownloadQueuePanelProps) {
  return (
    <section className="relative rounded-toy-lg border border-[#bcc1b5]/90 bg-[#eff1ea]/92 p-8 shadow-pop backdrop-blur-2xl dark:border-[#4a5360]/90 dark:bg-[#252a31]/90 md:p-10">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-4xl font-black text-[#4E9A06] dark:text-[#8AE234]">
            Download Queue
          </h3>
          <p className="mt-2 text-sm font-bold text-[#555753] dark:text-white/70">
            Track active, queued, completed, and failed downloads in real time.
          </p>
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/88 px-4 py-4 dark:border-[#4a5360] dark:bg-[#1f252b]/80">
        <div className="text-sm font-bold text-[#555753] dark:text-white/75">
          {props.selectedCount} selected for download
        </div>
        <div className="flex flex-wrap gap-3">
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

      <div className="mt-6 grid gap-4">
        {props.queue.jobs.length === 0 ? (
          <div className="rounded-toy border border-[#c2c7bc] bg-[#f7f8f2]/92 px-6 py-10 text-center font-bold text-[#555753] dark:border-[#4a5360] dark:bg-[#1f252b]/82 dark:text-white/70">
            No queued downloads yet.
          </div>
        ) : (
          props.queue.jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-toy border border-[#c2c7bc] bg-[#f7f8f2]/92 px-5 py-4 dark:border-[#4a5360] dark:bg-[#1f252b]/82"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate font-bold text-[#333333] dark:text-white">
                    {job.fileName}
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] font-black text-[#3465A4] dark:text-[#89CFF0] mt-1">
                    {job.username} · attempt {job.attempt || 1}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.18em] ${
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
                    <button
                      onClick={() => props.onCancel(job.id)}
                      className="rounded-full bg-[#14112C] px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-white"
                    >
                      Cancel
                    </button>
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
                  {formatBytes(job.bytesWritten)} /{" "}
                  {formatBytes(job.totalBytes)}
                </span>
                <span>{Math.round((job.progress || 0) * 100)}%</span>
              </div>
              {job.error ? (
                <div className="mt-3 text-xs font-bold text-[#CC5E00]">
                  {job.error}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
