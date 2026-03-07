import type { QueueSnapshot } from '../lib/types'
import { formatBytes } from '../lib/format'

type DownloadQueuePanelProps = {
  queue: QueueSnapshot
  message: string
  onCancel: (jobId: string) => void
}

export function DownloadQueuePanel(props: DownloadQueuePanelProps) {
  return (
    <section className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-2xl rounded-toy-lg p-8 md:p-10 shadow-pop relative border-4 border-[#89CFF0]/30">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-4xl font-black text-[#2D2D44] dark:text-white">
            Download Queue
          </h3>
          <p className="mt-2 text-sm font-bold text-[#2D2D44]/70 dark:text-white/70">
            Track active, queued, completed, and failed downloads in real time.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-black">
          <span className="rounded-full bg-[#73D216]/15 px-4 py-2 text-[#4E9A06]">{props.queue.activeCount} active</span>
          <span className="rounded-full bg-[#89CFF0]/15 px-4 py-2 text-[#3465A4]">{props.queue.queuedCount} queued</span>
          <span className="rounded-full bg-[#B5EAD7]/18 px-4 py-2 text-[#4E9A06]">{props.queue.completedCount} completed</span>
          <span className="rounded-full bg-[#FFB7B2]/18 px-4 py-2 text-[#CC5E00]">{props.queue.failedCount} failed</span>
        </div>
      </div>

      {props.message ? (
        <div className="mt-5 rounded-2xl bg-white/65 dark:bg-[#1A1733]/70 px-4 py-3 text-sm font-bold text-[#2D2D44] dark:text-white/75">
          {props.message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4">
        {props.queue.jobs.length === 0 ? (
          <div className="rounded-toy bg-white/65 dark:bg-[#1A1733]/55 border-2 border-white/40 dark:border-white/8 px-6 py-10 text-center font-bold text-[#2D2D44]/70 dark:text-white/70">
            No queued downloads yet.
          </div>
        ) : (
          props.queue.jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-toy bg-white/65 dark:bg-[#1A1733]/55 border-2 border-white/40 dark:border-white/8 px-5 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-bold text-[#2D2D44] dark:text-white truncate">
                    {job.fileName}
                  </div>
                  <div className="text-xs uppercase tracking-[0.18em] font-black text-[#3465A4] dark:text-[#89CFF0] mt-1">
                    {job.username} · attempt {job.attempt || 1}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.18em] ${
                      job.status === 'completed'
                        ? 'bg-[#B5EAD7] text-[#4E9A06]'
                        : job.status === 'failed'
                          ? 'bg-[#FFB7B2] text-[#CC5E00]'
                          : job.status === 'cancelled'
                            ? 'bg-[#E0BBE4] text-[#2D2D44]'
                            : job.status === 'active'
                              ? 'bg-[#73D216] text-white'
                              : 'bg-[#89CFF0] text-[#204A87]'
                    }`}
                  >
                    {job.status}
                  </span>
                  {(job.status === 'queued' || job.status === 'active') ? (
                    <button
                      onClick={() => props.onCancel(job.id)}
                      className="rounded-full bg-[#14112C] px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-white"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 h-3 rounded-full bg-[#14112C]/12 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    job.status === 'failed'
                      ? 'bg-[#CC5E00]'
                      : job.status === 'completed'
                        ? 'bg-[#73D216]'
                        : 'bg-gradient-to-r from-[#89CFF0] to-[#73D216]'
                  }`}
                  style={{ width: `${Math.max(job.progress * 100, job.status === 'completed' ? 100 : 4)}%` }}
                />
              </div>
              <div className="mt-3 flex justify-between gap-4 text-xs font-bold text-[#2D2D44]/70 dark:text-white/70">
                <span>
                  {formatBytes(job.bytesWritten)} / {formatBytes(job.totalBytes)}
                </span>
                <span>{Math.round((job.progress || 0) * 100)}%</span>
              </div>
              {job.error ? (
                <div className="mt-3 text-xs font-bold text-[#CC5E00]">{job.error}</div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
