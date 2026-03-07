import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, ChevronDown, Download, LoaderCircle, Plus, Search as SearchIcon, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { accentClass } from '../lib/format'
import type { SearchResponse, SubmissionCard } from '../lib/types'

type ResultsShowcaseProps = {
  searchResponse: SearchResponse | null
  results: SubmissionCard[]
  activeSubmissionId: string
  selectedSubmissionIds: string[]
  loading: boolean
  onSelectActive: (submissionId: string) => void
  onToggleSelection: (submissionId: string) => void
  onQueueDownloads: () => void
  onLoadMore: () => void
}

export function ResultsShowcase(props: ResultsShowcaseProps) {
  const selectedCount = props.selectedSubmissionIds.length
  const activeSubmission =
    props.results.find((item) => item.submissionId === props.activeSubmissionId) ?? props.results[0]
  const activeIndex = props.results.findIndex((item) => item.submissionId === activeSubmission?.submissionId)
  const canLoadMore = !!props.searchResponse && props.searchResponse.page < props.searchResponse.pagesCount

  const panelItems = useMemo(() => getPanelItems(props.results, activeIndex), [props.results, activeIndex])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: props.results.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 8,
    getItemKey: (index) => props.results[index]?.submissionId ?? index,
  })

  useEffect(() => {
    if (activeIndex >= 0) {
      rowVirtualizer.scrollToIndex(activeIndex, { align: 'auto' })
    }
  }, [activeIndex, rowVirtualizer])

  return (
    <section className="relative mt-4">
      <div className="flex items-center gap-3 mb-8 justify-center">
        <Star className="text-[#FFB7B2] fill-current" size={36} />
        <h3 className="text-4xl font-display font-bold text-[#2D2D44] dark:text-white">
          Results
        </h3>
      </div>

      <div className="relative z-10 flex items-center justify-between mb-5 px-2 gap-4 flex-wrap">
        <div className="text-sm font-bold text-[#2D2D44]/75 dark:text-white/75 mt-6">
          {props.searchResponse
            ? `${props.results.length} loaded of ${props.searchResponse.resultsCount} total`
            : 'Run a search to view matching submissions.'}
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white/70 dark:bg-[#1A1733]/80 px-4 py-2 text-sm font-bold text-[#2D2D44] dark:text-white">
            {selectedCount} selected
          </div>
          <button
            onClick={props.onQueueDownloads}
            disabled={!props.searchResponse || selectedCount === 0}
            className="px-6 py-3 bg-[#73D216] hover:bg-[#4E9A06] disabled:opacity-60 text-white font-black rounded-2xl shadow-xl transition-all flex items-center gap-2 border-b-8 border-[#2f6d05]"
          >
            <Download size={18} />
            Add to Queue
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row h-[1020px] md:h-[600px] w-full rounded-toy-lg overflow-hidden shadow-pop bg-white/80 dark:bg-gray-800/90 border-4 border-white/70 dark:border-gray-700/70">
        {props.results.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-white/35 dark:bg-[#1A1733]/55 text-center px-6">
            <SearchIcon className="text-[#89CFF0]" size={42} />
            <p className="mt-4 max-w-md text-lg font-bold text-[#2D2D44] dark:text-white">
              Search results appear here.
            </p>
          </div>
        ) : (
          panelItems.map((item, index) => {
            const selected = props.selectedSubmissionIds.includes(item.submissionId)
            return (
              <div
                key={item.submissionId}
                onClick={() => props.onSelectActive(item.submissionId)}
                className={`slide-panel relative cursor-pointer group ${
                  props.activeSubmissionId === item.submissionId ? 'flex-[3]' : 'flex-1'
                } hover:flex-[3] ${
                  index < panelItems.length - 1 ? 'border-b-4 md:border-b-0 md:border-r-4 border-white/70 dark:border-gray-700/70' : ''
                }`}
              >
                <SubmissionPreviewImage
                  submission={item}
                  alt={item.title}
                  className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity duration-500 group-hover:opacity-100"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${accentClass(item.accent)} via-transparent to-transparent`} />
                <div className="absolute inset-0 bg-gradient-to-br from-[#14112C]/10 via-transparent to-[#14112C]/60" />

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    props.onToggleSelection(item.submissionId)
                  }}
                  aria-label={selected ? `Remove ${item.title} from selection` : `Select ${item.title}`}
                  className={`absolute top-5 right-5 z-20 flex h-11 w-11 items-center justify-center rounded-full shadow-pop ${
                    selected ? 'bg-[#73D216] text-white' : 'bg-white/85 text-[#2D2D44]'
                  }`}
                >
                  {selected ? <Check size={18} /> : <Plus size={18} />}
                </button>

                <div className="absolute bottom-8 left-8 z-10 max-w-[72%]">
                  <span
                    className={`bg-white ${
                      index % 2 === 0 ? 'text-[#3465A4]' : 'text-[#CC5E00]'
                    } font-black px-4 py-1 rounded-full text-sm shadow-sm mb-2 inline-block transform ${
                      index % 2 === 0 ? '-rotate-3' : 'rotate-2'
                    }`}
                  >
                    {item.badgeText || item.typeName || 'Submission'}
                  </span>
                  <h4 className="text-3xl font-display font-black text-white drop-shadow-md">{item.title}</h4>
                  <p className="text-white font-bold text-xl opacity-95">@{item.username}</p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {props.results.length > 0 ? (
        <div className="mt-6 bg-white/50 dark:bg-gray-800/50 backdrop-blur-2xl rounded-toy-lg p-5 shadow-pop relative border-4 border-[#89CFF0]/30">

          <div
            ref={scrollRef}
            className="mt-4 h-[75vh] overflow-y-auto rounded-toy-sm bg-white/55 dark:bg-[#151129]/55 border border-white/40 dark:border-white/8"
          >
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = props.results[virtualRow.index]
                if (!item) {
                  return null
                }
                const isActive = item.submissionId === activeSubmission?.submissionId
                const selected = props.selectedSubmissionIds.includes(item.submissionId)

                return (
                  <div
                    key={item.submissionId}
                    className="absolute left-0 top-0 w-full px-3 py-1.5"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div
                      onClick={() => props.onSelectActive(item.submissionId)}
                      className={`grid cursor-pointer grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border px-3 py-3 transition-colors ${
                        isActive
                          ? 'border-[#73D216]/80 bg-[#73D216]/10'
                          : 'border-[#2D2D44]/10 dark:border-white/10 bg-white/72 dark:bg-[#1A1733]/72 hover:bg-[#89CFF0]/10 dark:hover:bg-white/8'
                      }`}
                    >
                      <div className="h-14 w-[72px] overflow-hidden rounded-xl bg-[#2D2D44]/10 dark:bg-white/10">
                        <SubmissionPreviewImage submission={item} alt={item.title} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-[#2D2D44] dark:text-white">
                          {item.title}
                        </div>
                        <div className="mt-1 truncate text-xs font-bold text-[#2D2D44]/70 dark:text-white/70">
                          @{item.username} · {item.typeName || 'Submission'} · {item.ratingName || 'Unrated'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          props.onToggleSelection(item.submissionId)
                        }}
                        aria-label={selected ? `Remove ${item.title} from selection` : `Select ${item.title}`}
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${
                          selected ? 'bg-[#73D216] text-white' : 'bg-[#14112C] text-white'
                        }`}
                      >
                        {selected ? <Check size={16} /> : <Plus size={16} />}
                      </button>
                    </div>
                  </div>
                )
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
            className="px-6 py-3 bg-[#2D2D44] hover:bg-[#3b3b55] text-white font-bold rounded-xl shadow-pop hover:shadow-pop-hover transition-all flex items-center gap-2"
          >
            {props.loading ? <LoaderCircle className="animate-spin" size={18} /> : <ChevronDown size={18} />}
            Load More Results
          </button>
        </div>
      ) : null}

      {activeSubmission ? (
        <div className="mt-6 bg-white/50 dark:bg-gray-800/50 backdrop-blur-2xl rounded-toy-lg p-6 shadow-pop relative border-4 border-[#89CFF0]/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-3xl font-black text-[#2D2D44] dark:text-white">
                {activeSubmission.title}
              </div>
              <div className="mt-2 text-sm font-bold text-[#2D2D44]/70 dark:text-white/70">
                @{activeSubmission.username} · {activeSubmission.typeName || 'Unknown type'} · {activeSubmission.ratingName || 'No rating label'}
              </div>
            </div>
            <div className="rounded-full bg-[#FFFACD] dark:bg-[#1A1733]/80 px-4 py-2 text-sm font-black text-[#CC5E00] dark:text-[#73D216]">
              {activeSubmission.isPublic ? 'Public file path' : 'SID required'}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SubmissionPreviewImage(props: { submission: SubmissionCard; alt: string; className: string }) {
  const sources = getPreviewSources(props.submission)
  const [sourceIndex, setSourceIndex] = useState(0)

  useEffect(() => {
    setSourceIndex(0)
  }, [props.submission.submissionId, props.submission.thumbnailUrl, props.submission.previewUrl, props.submission.screenUrl, props.submission.fullUrl])

  const source = sources[sourceIndex]
  if (!source) {
    return null
  }

  return (
    <img
      src={source}
      alt={props.alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setSourceIndex((current) => (current < sources.length - 1 ? current + 1 : current))
      }}
      className={props.className}
    />
  )
}

function getPreviewSources(submission: SubmissionCard) {
  return [submission.thumbnailUrl, submission.previewUrl, submission.screenUrl, submission.fullUrl].filter(
    (value): value is string => Boolean(value),
  )
}

function getPanelItems(results: SubmissionCard[], activeIndex: number) {
  if (results.length <= 5) {
    return results
  }

  const safeIndex = activeIndex >= 0 ? activeIndex : 0
  const start = Math.max(0, Math.min(safeIndex - 2, results.length - 5))
  return results.slice(start, start + 5)
}
