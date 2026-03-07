import {
  Check,
  ChevronDown,
  Download,
  LoaderCircle,
  Plus,
  Search as SearchIcon,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { accentClass } from "../lib/format";
import type { SearchResponse, SubmissionCard } from "../lib/types";

type ResultsShowcaseProps = {
  searchResponse: SearchResponse | null;
  results: SubmissionCard[];
  activeSubmissionId: string;
  selectedSubmissionIds: string[];
  loading: boolean;
  onSelectActive: (submissionId: string) => void;
  onToggleSelection: (submissionId: string) => void;
  onQueueDownloads: () => void;
  onLoadMore: () => void;
};

export function ResultsShowcase(props: ResultsShowcaseProps) {
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

  const panelItems = useMemo(
    () => getPanelItems(props.results, activeIndex),
    [props.results, activeIndex],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <section className="relative mt-4">
      <div className="flex items-center gap-3 mb-8 justify-center">
        <Star className="text-[#FFB7B2] fill-current" size={36} />
        <h3 className="text-4xl font-display font-bold text-[#2D2D44] dark:text-white">
          Results
        </h3>
      </div>

      <h1 className="font-teko text-[144px] font-bold text-[#2D2D44] dark:text-white tracking-[-0.02em] leading-[118.8px] -mb-[54px] drop-shadow-sm pointer-events-none text-left antialiased block w-full max-w-[945px] break-words relative z-20 -rotate-2 origin-left">
        PREVIEW
      </h1>

      <div className="relative z-10 flex items-center justify-between mb-5 px-2 gap-4 flex-wrap">
        <div className="text-sm font-bold text-[#2D2D44]/75 dark:text-white/75 mt-6">
          {props.searchResponse
            ? `${props.results.length} loaded of ${props.searchResponse.resultsCount} total`
            : "Run a search to view matching submissions."}
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
            const selected = props.selectedSubmissionIds.includes(
              item.submissionId,
            );
            return (
              <div
                key={item.submissionId}
                onClick={() => props.onSelectActive(item.submissionId)}
                className={`slide-panel relative cursor-pointer group ${
                  props.activeSubmissionId === item.submissionId
                    ? "flex-[3]"
                    : "flex-1"
                } hover:flex-[3] ${
                  index < panelItems.length - 1
                    ? "border-b-4 md:border-b-0 md:border-r-4 border-white/70 dark:border-gray-700/70"
                    : ""
                }`}
              >
                <SubmissionPreviewImage
                  submission={item}
                  alt={item.title}
                  variant="full"
                  className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity duration-500 group-hover:opacity-100"
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${accentClass(item.accent)} via-transparent to-transparent`}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-[#14112C]/10 via-transparent to-[#14112C]/60" />

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onToggleSelection(item.submissionId);
                  }}
                  aria-label={
                    selected
                      ? `Remove ${item.title} from selection`
                      : `Select ${item.title}`
                  }
                  className={`absolute top-5 right-5 z-20 flex h-11 w-11 items-center justify-center rounded-full shadow-pop ${
                    selected
                      ? "bg-[#73D216] text-white"
                      : "bg-white/85 text-[#2D2D44]"
                  }`}
                >
                  {selected ? <Check size={18} /> : <Plus size={18} />}
                </button>

                <div className="absolute bottom-8 left-8 z-10 max-w-[72%]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`bg-white ${
                        index % 2 === 0 ? "text-[#3465A4]" : "text-[#CC5E00]"
                      } font-black px-4 py-1 rounded-full text-sm shadow-sm inline-block transform ${
                        index % 2 === 0 ? "-rotate-3" : "rotate-2"
                      }`}
                    >
                      {item.badgeText || item.typeName || "Submission"}
                    </span>
                    <span className="rounded-full border border-white/55 bg-[#14112C]/35 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-white/92 backdrop-blur-sm">
                      {formatFileCount(item.pageCount)}
                    </span>
                  </div>
                  <h4 className="text-3xl font-display font-black text-white drop-shadow-md">
                    {item.title}
                  </h4>
                  <p className="text-white font-bold text-xl opacity-95">
                    @{item.username}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {props.results.length > 0 ? (
        <div className="mt-6 rounded-toy-lg border-4 border-[#89CFF0]/30 bg-white/50 p-5 shadow-pop backdrop-blur-2xl dark:bg-gray-800/50">
          <div
            ref={scrollRef}
            className="mt-4 h-[75vh] overflow-y-auto rounded-toy-sm border border-white/40 bg-white/55 p-3 dark:border-white/8 dark:bg-[#151129]/55"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {props.results.map((item) => {
                const isActive =
                  item.submissionId === activeSubmission?.submissionId;
                const selected = props.selectedSubmissionIds.includes(
                  item.submissionId,
                );

                return (
                  <article
                    key={item.submissionId}
                    onClick={() => props.onSelectActive(item.submissionId)}
                    className={`cursor-pointer overflow-hidden rounded-[1.6rem] border transition-colors ${
                      isActive
                        ? "border-[#73D216]/80 bg-[#73D216]/10"
                        : "border-[#2D2D44]/10 bg-white/72 hover:bg-[#89CFF0]/10 dark:border-white/10 dark:bg-[#1A1733]/72 dark:hover:bg-white/8"
                    }`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-[#2D2D44]/10 dark:bg-white/10">
                      <SubmissionPreviewImage
                        submission={item}
                        alt={item.title}
                        variant="grid"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#14112C]/75 via-[#14112C]/20 to-transparent p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white/92 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#2D2D44]">
                            {item.typeName || "Submission"}
                          </span>
                          <span className="rounded-full border border-white/45 bg-[#14112C]/40 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/92 backdrop-blur-sm">
                            {formatFileCount(item.pageCount)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 p-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-[#2D2D44] dark:text-white">
                          {item.title}
                        </div>
                        <div className="mt-1 truncate text-xs font-bold text-[#2D2D44]/70 dark:text-white/70">
                          @{item.username} · {item.ratingName || "Unrated"}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2D2D44]/55 dark:text-white/55">
                          {item.submissionId}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            props.onToggleSelection(item.submissionId);
                          }}
                          aria-label={
                            selected
                              ? `Remove ${item.title} from selection`
                              : `Select ${item.title}`
                          }
                          className={`flex h-9 w-9 items-center justify-center rounded-full ${
                            selected
                              ? "bg-[#73D216] text-white"
                              : "bg-[#14112C] text-white"
                          }`}
                        >
                          {selected ? <Check size={16} /> : <Plus size={16} />}
                        </button>
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
            className="px-6 py-3 bg-[#2D2D44] hover:bg-[#3b3b55] text-white font-bold rounded-xl shadow-pop hover:shadow-pop-hover transition-all flex items-center gap-2"
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

      {activeSubmission ? (
        <div className="mt-6 bg-white/50 dark:bg-gray-800/50 backdrop-blur-2xl rounded-toy-lg p-6 shadow-pop relative border-4 border-[#89CFF0]/30">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-3xl font-black text-[#2D2D44] dark:text-white">
                {activeSubmission.title}
              </div>
              <div className="mt-2 text-sm font-bold text-[#2D2D44]/70 dark:text-white/70">
                @{activeSubmission.username} ·{" "}
                {activeSubmission.typeName || "Unknown type"} ·{" "}
                {activeSubmission.ratingName || "No rating label"}
              </div>
            </div>
            <div className="rounded-full bg-[#FFFACD] dark:bg-[#1A1733]/80 px-4 py-2 text-sm font-black text-[#CC5E00] dark:text-[#73D216]">
              {activeSubmission.isPublic ? "Public file path" : "SID required"}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SubmissionPreviewImage(props: {
  submission: SubmissionCard;
  alt: string;
  className: string;
  variant?: "full" | "grid";
}) {
  const preferredSource = getPrimaryPreviewSource(
    props.submission,
    props.variant,
  );
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
  ]);

  const source = sources[sourceIndex];
  if (!source) {
    return null;
  }

  return (
    <img
      src={source ?? preferredSource}
      srcSet={buildSrcSet(props.submission)}
      sizes={
        props.variant === "full"
          ? "(min-width: 768px) 60vw, 100vw"
          : "(min-width: 1280px) 26vw, (min-width: 768px) 42vw, 100vw"
      }
      alt={props.alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setSourceIndex((current) =>
          current < sources.length - 1 ? current + 1 : current,
        );
      }}
      className={props.className}
    />
  );
}

function getPreviewSources(
  submission: SubmissionCard,
  variant: "full" | "grid" = "grid",
) {
  const ordered =
    variant === "full"
      ? [
          submission.fullUrl,
          submission.screenUrl,
          submission.previewUrl,
          submission.thumbnailUrl,
        ]
      : [
          submission.previewUrl,
          submission.screenUrl,
          submission.thumbnailUrl,
          submission.fullUrl,
        ];

  return ordered.filter((value): value is string => Boolean(value));
}

function getPrimaryPreviewSource(
  submission: SubmissionCard,
  variant: "full" | "grid" = "grid",
) {
  return getPreviewSources(submission, variant)[0] ?? "";
}

function buildSrcSet(submission: SubmissionCard) {
  const entries: Array<[string | undefined, string]> = [
    [submission.thumbnailUrl, "320w"],
    [submission.previewUrl, "640w"],
    [submission.screenUrl, "1024w"],
    [submission.fullUrl, "1600w"],
  ];

  const uniqueEntries = entries.filter(
    (entry, index, array) =>
      entry[0] &&
      array.findIndex((candidate) => candidate[0] === entry[0]) === index,
  );

  return uniqueEntries.map(([url, width]) => `${url} ${width}`).join(", ");
}

function formatFileCount(pageCount: number) {
  const count = Math.max(1, pageCount || 0);
  return `${count} file${count === 1 ? "" : "s"}`;
}

function getPanelItems(results: SubmissionCard[], activeIndex: number) {
  if (results.length <= 5) {
    return results;
  }

  const safeIndex = activeIndex >= 0 ? activeIndex : 0;
  const start = Math.max(0, Math.min(safeIndex - 2, results.length - 5));
  return results.slice(start, start + 5);
}
