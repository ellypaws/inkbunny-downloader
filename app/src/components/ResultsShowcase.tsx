import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  Download,
  Eye,
  File,
  FileImage,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search as SearchIcon,
  Square,
  Star,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
} from "react";

import ElasticSlider from "./ElasticSlider";
import { LoadMoreControl, type LoadMoreControlState } from "./LoadMoreControl";
import { SubmissionImageModal } from "./SubmissionImageModal";
import { DEFAULT_AVATAR_URL } from "../lib/constants";
import { accentClass } from "../lib/format";
import { backend } from "../lib/wails";
import type {
  DownloadJobSnapshot,
  QueueSnapshot,
  SearchResponse,
  SubmissionCard,
  SubmissionMediaFile,
} from "../lib/types";

type ResultsShowcaseProps = {
  searchResponse: SearchResponse | null;
  results: SubmissionCard[];
  activeSubmissionId: string;
  selectedSubmissionIds: string[];
  showCustomThumbnails: boolean;
  showEngagementStats?: boolean;
  allSelected: boolean;
  loading: boolean;
  loadMoreState: LoadMoreControlState;
  resultsRefreshToken: number;
  queue: QueueSnapshot;
  canStopAll: boolean;
  downloadedSubmissionIds: ReadonlySet<string>;
  pendingDownloadSubmissionIds: string[];
  downloadButtonMode: "default" | "stop" | "searching" | "timer";
  downloadButtonLabel: string;
  downloadButtonDisabled: boolean;
  onPanelPreviewImagesChange: (images: string[][]) => void;
  onSelectActive: (submissionId: string) => void;
  onToggleSelectAll: () => void;
  onToggleSelection: (submissionId: string) => void;
  onShowCustomThumbnailsChange: (enabled: boolean) => void;
  onDownloadSubmission: (submissionId: string) => void;
  onCancelSubmission: (submissionId: string) => void;
  onRetrySubmission: (submissionId: string) => void;
  onStopAll: () => void;
  onRefresh: () => void;
  onDownloadAction: () => void;
  onLoadMore: () => void;
  onLoadAll: () => void;
  onStopLoadMore: () => void;
};

type SubmissionDownloadState =
  | "idle"
  | "queued"
  | "downloading"
  | "downloaded"
  | "failed";

type SubmissionDownloadSummary = {
  state: SubmissionDownloadState;
  progress: number;
};

type ActiveModalState = {
  submissionId: string;
  fileIndex: number;
};

type ThumbnailSourceInput = {
  thumbnailUrl?: string;
  thumbnailUrlMedium?: string;
  thumbnailUrlLarge?: string;
  thumbnailUrlHuge?: string;
  thumbnailUrlMediumNonCustom?: string;
  thumbnailUrlLargeNonCustom?: string;
  thumbnailUrlHugeNonCustom?: string;
  thumbMediumX?: number;
  thumbLargeX?: number;
  thumbHugeX?: number;
  thumbMediumNonCustomX?: number;
  thumbLargeNonCustomX?: number;
  thumbHugeNonCustomX?: number;
  fullUrl?: string;
};

const PANEL_WINDOW_SIZE = 5;
const RESULT_GRID_GAP = 12;
const RESULT_CARD_CHROME_HEIGHT = 152;
const IDLE_DOWNLOAD_SUMMARY: SubmissionDownloadSummary = {
  state: "idle",
  progress: 0,
};

export function ResultsShowcase(props: ResultsShowcaseProps) {
  const panelAnimationRef = useRef<number | null>(null);
  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const resultsGridMeasureRef = useRef<HTMLDivElement | null>(null);
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
  const [resultsGridWidth, setResultsGridWidth] = useState(0);
  const [activeModal, setActiveModal] = useState<ActiveModalState | null>(null);

  const panelItems = useMemo(
    () => getPanelItems(props.results, panelStart),
    [props.results, panelStart],
  );
  const panelPreviewImages = useMemo(
    () => selectPanelPreviewImages(panelItems, props.showCustomThumbnails),
    [panelItems, props.showCustomThumbnails],
  );
  const downloadSummaries = useMemo(
    () =>
      buildSubmissionDownloadSummaries(
        props.queue,
        props.downloadedSubmissionIds,
        props.pendingDownloadSubmissionIds,
      ),
    [
      props.downloadedSubmissionIds,
      props.pendingDownloadSubmissionIds,
      props.queue,
    ],
  );
  const downloadedCount = useMemo(
    () =>
      props.results.filter(
        (item) =>
          downloadSummaries.get(item.submissionId)?.state === "downloaded",
      ).length,
    [downloadSummaries, props.results],
  );
  const firstSelectableSubmissionId =
    props.results.find(
      (item) =>
        (downloadSummaries.get(item.submissionId) ?? IDLE_DOWNLOAD_SUMMARY)
          .state !== "downloaded",
    )?.submissionId ?? "";
  const selectableCount = props.results.length - downloadedCount;
  const selectAllDisabled = props.results.length === 0 || selectableCount === 0;
  const selectAllLabel =
    selectableCount === 0
      ? "All downloaded"
      : props.allSelected
        ? "Deselect all"
        : "Select all";
  const resultColumnCount = useMemo(
    () => getVirtualGridColumnCount(resultsGridWidth, gridCardWidth),
    [gridCardWidth, resultsGridWidth],
  );
  const resultRowCount = Math.ceil(props.results.length / resultColumnCount);
  const estimatedResultRowHeight = useMemo(
    () =>
      estimateResultRowHeight(
        resultsGridWidth,
        resultColumnCount,
        gridCardWidth,
      ),
    [gridCardWidth, resultColumnCount, resultsGridWidth],
  );
  const resultCardWidth = useMemo(
    () =>
      getVirtualGridCardWidth(
        resultsGridWidth,
        resultColumnCount,
        gridCardWidth,
      ),
    [gridCardWidth, resultColumnCount, resultsGridWidth],
  );
  const resultRowVirtualizer = useVirtualizer({
    count: resultRowCount,
    getScrollElement: () => resultsScrollRef.current,
    estimateSize: () => estimatedResultRowHeight,
    overscan: 4,
  });
  const activeModalSubmission = useMemo(
    () =>
      activeModal
        ? props.results.find(
            (item) => item.submissionId === activeModal.submissionId,
          ) ?? null
        : null,
    [activeModal, props.results],
  );
  const activeModalMediaItems = useMemo(
    () =>
      activeModalSubmission
        ? getSubmissionModalMediaItems(
            activeModalSubmission,
            props.showCustomThumbnails,
          )
        : [],
    [activeModalSubmission, props.showCustomThumbnails],
  );
  const activeModalIndex = activeModal
    ? clampIndex(activeModal.fileIndex, activeModalMediaItems.length)
    : 0;
  const activeModalItem = activeModalMediaItems[activeModalIndex] ?? null;
  const activeModalDownloadSummary = activeModalSubmission
    ? (downloadSummaries.get(activeModalSubmission.submissionId) ??
      IDLE_DOWNLOAD_SUMMARY)
    : null;
  const activeModalCancellable = isSubmissionCancellable(
    activeModalDownloadSummary?.state ?? "idle",
  );
  const activeModalRetryable = isSubmissionRetryable(
    activeModalDownloadSummary?.state ?? "idle",
  );

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

  useEffect(() => {
    const element = resultsGridMeasureRef.current;
    if (!element) {
      return;
    }

    const updateWidth = (nextWidth: number) => {
      setResultsGridWidth((current) =>
        Math.abs(current - nextWidth) < 1 ? current : nextWidth,
      );
    };

    updateWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? element.clientWidth;
      updateWidth(nextWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.results.length]);

  useEffect(() => {
    resultRowVirtualizer.measure();
  }, [
    estimatedResultRowHeight,
    gridCardWidth,
    props.results.length,
    resultColumnCount,
    resultRowVirtualizer,
  ]);

  useEffect(() => {
    if (activeIndex < 0 || props.results.length === 0) {
      return;
    }
    resultRowVirtualizer.scrollToIndex(
      Math.floor(activeIndex / resultColumnCount),
      { align: "auto" },
    );
  }, [
    activeIndex,
    resultColumnCount,
    props.resultsRefreshToken,
    resultRowVirtualizer,
  ]);

  useEffect(() => {
    props.onPanelPreviewImagesChange(panelPreviewImages);
  }, [panelPreviewImages, props.onPanelPreviewImagesChange]);

  useEffect(() => {
    if (!activeModal) {
      return;
    }
    if (!activeModalSubmission) {
      setActiveModal(null);
      return;
    }
    if (activeModal.fileIndex !== activeModalIndex) {
      setActiveModal((current) =>
        current
          ? {
              ...current,
              fileIndex: activeModalIndex,
            }
          : current,
      );
    }
  }, [activeModal, activeModalIndex, activeModalSubmission]);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeModal]);

  useEffect(() => {
    if (!activeModal) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveModal(null);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveModal((current) =>
          current
            ? {
                ...current,
                fileIndex: current.fileIndex - 1,
              }
            : current,
        );
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveModal((current) =>
          current
            ? {
                ...current,
                fileIndex: current.fileIndex + 1,
              }
            : current,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeModal]);

  const openSubmissionModal = (submissionId: string, fileIndex = 0) => {
    props.onSelectActive(submissionId);
    setActiveModal({
      submissionId,
      fileIndex,
    });
  };

  const setActiveModalIndex = (fileIndex: number) => {
    setActiveModal((current) =>
      current
        ? {
            ...current,
            fileIndex,
          }
        : current,
    );
  };

  const handleActiveModalDownload = () => {
    if (!activeModalSubmission || !activeModalDownloadSummary) {
      return;
    }
    if (activeModalDownloadSummary.state === "downloaded") {
      return;
    }
    if (activeModalCancellable) {
      props.onCancelSubmission(activeModalSubmission.submissionId);
      return;
    }
    if (activeModalRetryable) {
      props.onRetrySubmission(activeModalSubmission.submissionId);
      return;
    }
    props.onDownloadSubmission(activeModalSubmission.submissionId);
  };

  return (
    <section className="relative mt-4">
      <h1 className="text-white font-teko text-[144px] font-bold tracking-[-0.02em] leading-[118.8px] -mb-[130px] drop-shadow-sm pointer-events-none text-left antialiased block w-full max-w-[945px] break-words relative z-20 -rotate-2 origin-left">
        Preview
      </h1>

      <div className="relative z-10 mb-5 flex flex-wrap items-center justify-end gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="theme-panel-soft rounded-full border px-4 py-2 text-sm font-bold backdrop-blur-md">
            {selectedCount} selected
          </div>
          <button
            type="button"
            onClick={props.onToggleSelectAll}
            disabled={selectAllDisabled}
            className="theme-button-secondary rounded-2xl border px-5 py-3 text-sm font-black shadow-sm backdrop-blur-md transition-all disabled:opacity-50"
          >
            {selectAllLabel}
          </button>
          <button
            type="button"
            onClick={props.onRefresh}
            disabled={!props.searchResponse || props.loading}
            className="theme-button-secondary flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black shadow-sm backdrop-blur-md transition-all disabled:opacity-50"
          >
            {props.loading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={props.onStopAll}
            disabled={!props.canStopAll}
            className="theme-button-danger flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black shadow-sm backdrop-blur-md transition-all disabled:opacity-50"
            title="Stop every queued or active download"
          >
            <Square size={15} className="fill-current" strokeWidth={2.5} />
            Stop All
          </button>
          <button
            type="button"
            onClick={props.onDownloadAction}
            disabled={props.downloadButtonDisabled}
            className={getDownloadActionButtonClass(
              props.downloadButtonMode,
              "rounded-2xl border-b-8 px-6 py-3 font-black shadow-xl",
            )}
          >
            {renderDownloadActionButtonContent(
              props.downloadButtonMode,
              props.downloadButtonLabel,
              18,
            )}
          </button>
        </div>
      </div>

      <div className="theme-panel flex h-[1020px] w-full flex-col overflow-hidden rounded-toy-sm border-2 shadow-pop md:h-[600px] md:flex-row">
        {props.results.length === 0 ? (
          <div className="theme-panel-soft flex h-full w-full flex-col items-center justify-center px-6 text-center">
            <SearchIcon className="text-[var(--theme-info)]" size={42} />
            <p className="theme-title mt-4 max-w-md text-lg font-bold">
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
            const cancellable = isSubmissionCancellable(downloadSummary.state);
            const retryable = isSubmissionRetryable(downloadSummary.state);

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
                  preferCustomThumbnails={props.showCustomThumbnails}
                  refreshToken={props.resultsRefreshToken}
                  className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity duration-500 group-hover:opacity-100"
                />
                <button
                  type="button"
                  aria-label={
                    props.activeSubmissionId === item.submissionId
                      ? `Open ${item.title}`
                      : `Focus ${item.title}`
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    if (props.activeSubmissionId === item.submissionId) {
                      openSubmissionModal(item.submissionId);
                      return;
                    }
                    props.onSelectActive(item.submissionId);
                  }}
                  className="absolute inset-0 z-[15]"
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
                      if (cancellable) {
                        props.onCancelSubmission(item.submissionId);
                        return;
                      }
                      if (retryable) {
                        props.onRetrySubmission(item.submissionId);
                        return;
                      }
                      props.onDownloadSubmission(item.submissionId);
                    }}
                    aria-label={
                      cancellable
                        ? `Cancel download for ${item.title}`
                        : retryable
                          ? `Retry download for ${item.title}`
                          : `Download ${item.title}`
                    }
                    disabled={downloaded}
                    className={`${cancellable ? "group/download-action" : ""} flex h-11 w-11 items-center justify-center rounded-full shadow-pop backdrop-blur-md transition-all duration-300 ${
                      downloadSummary.state === "downloaded"
                        ? "translate-x-[3.25rem] bg-[#73D216]/85 text-white"
                        : retryable
                          ? "bg-[#CC5E00] text-white hover:scale-105 hover:bg-[#A84600]"
                          : cancellable
                            ? "bg-[#2A7FA6] text-white hover:bg-[#CC5E00]"
                            : "bg-[#14112C]/72 text-white hover:scale-105"
                    } disabled:cursor-default disabled:hover:scale-100`}
                  >
                    {cancellable ? (
                      <span className="relative flex h-5 w-5 items-center justify-center">
                        <span className="transition-opacity duration-150 group-hover/download-action:opacity-0">
                          {renderDownloadIcon(downloadSummary.state, 18)}
                        </span>
                        <span className="pointer-events-none absolute opacity-0 transition-opacity duration-150 group-hover/download-action:opacity-100">
                          <Square
                            size={15}
                            className="fill-current"
                            strokeWidth={2.5}
                          />
                        </span>
                      </span>
                    ) : retryable ? (
                      <RefreshCw size={18} />
                    ) : (
                      renderDownloadIcon(downloadSummary.state, 18)
                    )}
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
                          : "bg-[#D9DDD3]/92 text-[#555753] hover:bg-[#CFE8AE] hover:text-[#4E9A06]"
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
                        index % 2 === 0
                          ? "-rotate-3 text-[#3465A4]"
                          : "rotate-2 text-[#CC5E00]"
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
        <div className="theme-panel-soft mt-6 overflow-hidden rounded-toy-sm border-2 shadow-pop backdrop-blur-2xl">
          <div className="border-b border-[var(--theme-border-soft)] bg-[color:var(--theme-surface)]/92 px-4 py-3 backdrop-blur-2xl">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={props.onToggleSelectAll}
                  disabled={selectAllDisabled}
                  className="theme-button-secondary rounded-2xl border px-4 py-2 text-xs font-black backdrop-blur-md transition-colors disabled:opacity-50"
                >
                  {selectAllLabel}
                </button>
                <button
                  type="button"
                  onClick={props.onRefresh}
                  disabled={!props.searchResponse || props.loading}
                  className="theme-button-secondary flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-black backdrop-blur-md transition-colors disabled:opacity-50"
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
                  onClick={props.onStopAll}
                  disabled={!props.canStopAll}
                  className="theme-button-danger flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-black backdrop-blur-md transition-colors disabled:opacity-50"
                  title="Stop every queued or active download"
                >
                  <Square
                    size={12}
                    className="fill-current"
                    strokeWidth={2.5}
                  />
                  Stop All
                </button>
                <button
                  type="button"
                  onClick={props.onDownloadAction}
                  disabled={props.downloadButtonDisabled}
                  className={getDownloadActionButtonClass(
                    props.downloadButtonMode,
                    "rounded-2xl border px-4 py-2 text-xs font-black shadow-lg",
                  )}
                >
                  {renderDownloadActionButtonContent(
                    props.downloadButtonMode,
                    props.downloadButtonLabel,
                    14,
                  )}
                </button>
                <label className="theme-panel-strong flex items-center gap-3 rounded-2xl border px-4 py-2 text-xs font-black backdrop-blur-md">
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
                    className="w-24"
                  />
                </label>
                <label className="theme-panel-strong flex items-center gap-3 rounded-2xl border px-4 py-2 text-xs font-black backdrop-blur-md">
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 items-center justify-center rounded-[0.35rem] border ${
                      props.showCustomThumbnails
                        ? "border-[#76B900] bg-[#76B900] text-white"
                        : "border-[var(--theme-subtle)] bg-transparent text-transparent"
                    }`}
                  >
                    <Check size={12} />
                  </span>
                  <input
                    type="checkbox"
                    checked={props.showCustomThumbnails}
                    onChange={(event) =>
                      props.onShowCustomThumbnailsChange(
                        event.target.checked,
                      )
                    }
                    className="sr-only"
                  />
                  <span className="inline-flex items-center gap-2">
                    <FileImage
                      size={14}
                      className="text-[var(--theme-info)]"
                    />
                    Custom Thumbnails
                  </span>
                </label>
              </div>
            </div>
          </div>
          <div
            ref={resultsScrollRef}
            className="h-[75vh] overflow-x-hidden overflow-y-auto"
          >
            <div ref={resultsGridMeasureRef} className="p-4">
              <div
                className="relative w-full"
                style={{
                  height: `${resultRowVirtualizer.getTotalSize()}px`,
                }}
              >
                {resultRowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const rowStart = virtualRow.index * resultColumnCount;
                  const rowItems = props.results.slice(
                    rowStart,
                    rowStart + resultColumnCount,
                  );

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={resultRowVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full pb-3"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div
                        className="grid gap-3"
                        style={{
                          gridTemplateColumns: `repeat(${resultColumnCount}, minmax(0, 1fr))`,
                        }}
                      >
                        {rowItems.map((item) => {
                          const isActive =
                            item.submissionId ===
                            activeSubmission?.submissionId;
                          const selected = props.selectedSubmissionIds.includes(
                            item.submissionId,
                          );
                          const downloadSummary =
                            downloadSummaries.get(item.submissionId) ??
                            IDLE_DOWNLOAD_SUMMARY;
                          const downloaded =
                            downloadSummary.state === "downloaded";
                          const cancellable = isSubmissionCancellable(
                            downloadSummary.state,
                          );
                          const retryable = isSubmissionRetryable(
                            downloadSummary.state,
                          );

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
                                  ? "border-[var(--theme-accent)] bg-[var(--theme-surface-strong)] ring-4 ring-[var(--theme-accent)]/45 shadow-[0_0_0_1px_var(--theme-accent)]"
                                  : "theme-panel-strong theme-hover border"
                              }`}
                            >
                              <div className="relative aspect-[5/4] overflow-hidden bg-[var(--theme-surface-soft)]">
                                <SubmissionPreview
                                  submission={item}
                                  alt={item.title}
                                  variant="card"
                                  preferCustomThumbnails={
                                    props.showCustomThumbnails
                                  }
                                  refreshToken={props.resultsRefreshToken}
                                  preferredWidth={resultCardWidth}
                                  sizes={`${Math.ceil(resultCardWidth)}px`}
                                  className="h-full w-full object-cover"
                                />
                                <button
                                  type="button"
                                  aria-label={`Open ${item.title}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openSubmissionModal(item.submissionId);
                                  }}
                                  className="absolute inset-0 z-10"
                                />
                                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[rgba(46,52,54,0.78)] via-[rgba(46,52,54,0.22)] to-transparent p-3 dark:from-[#14112C]/75 dark:via-[#14112C]/20">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-[var(--theme-surface-strong)] px-3 py-1 text-[11px] font-black text-[var(--theme-title)]">
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
                                  <ExternalActionButton
                                    url={item.submissionUrl}
                                    className="theme-title block truncate text-left text-[13px] font-black transition-colors hover:text-[var(--theme-info)]"
                                  >
                                    {item.title}
                                  </ExternalActionButton>
                                  <div className="mt-1 flex items-center justify-between gap-2">
                                    <SubmissionAuthorButton
                                      submission={item}
                                      compact
                                      className="theme-muted min-w-0 flex-1 text-[10px] font-bold"
                                    />
                                    <div className="theme-subtle shrink-0 text-[10px] font-semibold">
                                      {item.ratingName || "Unrated"}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                  {props.showEngagementStats ? (
                                    <SubmissionEngagementStats
                                      submission={item}
                                      compact
                                      className="theme-subtle text-[10px] font-semibold"
                                    />
                                  ) : (
                                    <div className="h-5" />
                                  )}
                                  <div className="flex items-center gap-2">
                                    <GridDownloadButton
                                      title={item.title}
                                      summary={downloadSummary}
                                      cancellable={cancellable}
                                      retryable={retryable}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (cancellable) {
                                          props.onCancelSubmission(
                                            item.submissionId,
                                          );
                                          return;
                                        }
                                        if (retryable) {
                                          props.onRetrySubmission(
                                            item.submissionId,
                                          );
                                          return;
                                        }
                                        props.onDownloadSubmission(
                                          item.submissionId,
                                        );
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        props.onToggleSelection(
                                          item.submissionId,
                                        );
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
                                            : "bg-[#D9DDD3]/92 text-[#555753] hover:bg-[#CFE8AE] hover:text-[#4E9A06]"
                                      }`}
                                      data-tour-anchor={
                                        item.submissionId ===
                                        firstSelectableSubmissionId
                                          ? "select-result"
                                          : undefined
                                      }
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
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeModalSubmission && activeModalItem ? (
        <SubmissionImageModal
          submission={activeModalSubmission}
          item={activeModalItem}
          items={activeModalMediaItems}
          activeIndex={activeModalIndex}
          downloadState={
            (activeModalDownloadSummary ?? IDLE_DOWNLOAD_SUMMARY).state
          }
          cancellable={activeModalCancellable}
          retryable={activeModalRetryable}
          onClose={() => setActiveModal(null)}
          onNavigate={setActiveModalIndex}
          onDownload={handleActiveModalDownload}
        />
      ) : null}

      <LoadMoreControl
        canLoadMore={canLoadMore}
        disabled={props.loading}
        state={props.loadMoreState}
        onLoadMore={props.onLoadMore}
        onLoadAll={props.onLoadAll}
        onStop={props.onStopLoadMore}
        className="mt-6"
      />
    </section>
  );
}

function SubmissionPreview(props: {
  submission: SubmissionCard;
  alt: string;
  className: string;
  variant?: "full" | "card";
  preferCustomThumbnails: boolean;
  refreshToken: number;
  preferredWidth?: number;
  sizes?: string;
}) {
  const sources = getPreviewSources(
    props.submission,
    props.variant,
    props.preferCustomThumbnails,
    props.preferredWidth,
  );

  if (sources.length === 0) {
    return (
      <PreviewFallback
        submission={props.submission}
        className={props.className}
      />
    );
  }

  return (
    <SubmissionPreviewImage
      key={getSubmissionPreviewKey(
        props.submission,
        props.refreshToken,
        props.preferCustomThumbnails,
      )}
      submission={props.submission}
      sources={sources}
      alt={props.alt}
      className={props.className}
      sizes={
        props.sizes ??
        (props.variant === "full"
          ? "(min-width: 768px) 60vw, 100vw"
          : "(min-width: 1280px) 26vw, (min-width: 768px) 42vw, 100vw")
      }
      refreshToken={props.refreshToken}
    />
  );
}

function SubmissionPreviewImage(props: {
  submission: SubmissionCard;
  sources: PreviewSource[];
  alt: string;
  className: string;
  sizes: string;
  refreshToken: number;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = props.sources[sourceIndex];

  if (!source?.src) {
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
      src={source.src}
      srcSet={source.srcSet}
      sizes={props.sizes}
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

function getSubmissionModalMediaItems(
  submission: SubmissionCard,
  preferCustomThumbnails: boolean,
) {
  const mediaFiles = submission.mediaFiles ?? [];
  if (mediaFiles.length > 0) {
    return mediaFiles.map((file, index) => ({
      key: file.fileId || `${submission.submissionId}-${index}`,
      alt: `${submission.title} - page ${index + 1}`,
      label: `Page ${index + 1}`,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sources: getMediaFilePreviewSources(file, preferCustomThumbnails),
      thumbnail: getThumbnailPreviewSource(file, preferCustomThumbnails),
    }));
  }

  return [
    {
      key: `${submission.submissionId}-fallback`,
      alt: submission.title,
      label: "Page 1",
      fileName: submission.fileName,
      mimeType: submission.mimeType,
      sources: getSubmissionModalPreviewSources(
        submission,
        preferCustomThumbnails,
      ),
      thumbnail: getThumbnailPreviewSource(submission, preferCustomThumbnails),
    },
  ];
}

function getSubmissionModalPreviewSources(
  submission: SubmissionCard,
  preferCustomThumbnails: boolean,
) {
  return dedupePreviewSources([
    toPreviewSource(submission.fullUrl),
    toPreviewSource(submission.screenUrl),
    toPreviewSource(submission.previewUrl),
    getThumbnailPreviewSource(submission, preferCustomThumbnails),
    toPreviewSource(submission.latestPreviewUrl),
    toPreviewSource(submission.latestThumbnailUrl),
  ]);
}

function getMediaFilePreviewSources(
  file: SubmissionMediaFile,
  preferCustomThumbnails: boolean,
) {
  return dedupePreviewSources([
    toPreviewSource(file.fullUrl),
    toPreviewSource(file.screenUrl),
    toPreviewSource(file.previewUrl),
    getThumbnailPreviewSource(file, preferCustomThumbnails),
    toPreviewSource(file.thumbnailUrl),
  ]);
}

function getPreviewSources(
  submission: SubmissionCard,
  variant: "full" | "card" = "card",
  preferCustomThumbnails = true,
  preferredWidth = 0,
) {
  const thumbnailSource = getThumbnailPreviewSource(
    submission,
    preferCustomThumbnails,
    variant === "full",
    preferredWidth,
  );

  const ordered =
    variant === "full"
      ? [
          thumbnailSource,
          toPreviewSource(submission.latestThumbnailUrl),
          toPreviewSource(submission.previewUrl),
          toPreviewSource(submission.latestPreviewUrl),
          toPreviewSource(submission.screenUrl),
          toPreviewSource(submission.fullUrl),
        ]
      : [
          thumbnailSource,
          toPreviewSource(submission.previewUrl),
          toPreviewSource(submission.latestPreviewUrl),
          toPreviewSource(submission.screenUrl),
          toPreviewSource(submission.fullUrl),
          toPreviewSource(submission.latestThumbnailUrl),
        ];

  return dedupePreviewSources(ordered);
}

function getSubmissionPreviewKey(
  submission: SubmissionCard,
  refreshToken: number,
  preferCustomThumbnails: boolean,
) {
  return [
    submission.submissionId,
    submission.thumbnailUrl,
    submission.thumbnailUrlMedium,
    submission.thumbnailUrlLarge,
    submission.thumbnailUrlHuge,
    submission.thumbnailUrlMediumNonCustom,
    submission.thumbnailUrlLargeNonCustom,
    submission.thumbnailUrlHugeNonCustom,
    submission.previewUrl,
    submission.screenUrl,
    submission.fullUrl,
    submission.latestPreviewUrl,
    submission.latestThumbnailUrl,
    preferCustomThumbnails ? "custom" : "default",
    refreshToken,
  ].join("|");
}

type PreviewSource = {
  src: string;
  srcSet?: string;
};

type ThumbnailVariant = {
  src: string;
  width: number;
};

function getThumbnailPreviewSource(
  item: ThumbnailSourceInput,
  preferCustomThumbnails: boolean,
  includeFullFileURL = false,
  preferredWidth = 0,
) {
  const preferred = preferCustomThumbnails
    ? getCustomThumbnailVariants(item)
    : getNonCustomThumbnailVariants(item);
  const fallback = preferCustomThumbnails
    ? getNonCustomThumbnailVariants(item)
    : getCustomThumbnailVariants(item);
  const variants = preferred.length > 0 ? preferred : fallback;
  const primary = getPrimaryThumbnailVariant(
    variants,
    Math.ceil(preferredWidth),
  );
  if (!primary) {
    return toPreviewSource(item.thumbnailUrl);
  }

  const srcSetVariants = variants
    .filter((variant) => variant.width > 0)
    .sort((left, right) => left.width - right.width);
  const fullWidth = Math.max(
    ...srcSetVariants.map((variant) => variant.width),
    0,
  );
  const srcSet = [
    ...srcSetVariants.map((variant) => `${variant.src} ${variant.width}w`),
    includeFullFileURL && item.fullUrl
      ? `${item.fullUrl} ${Math.max(fullWidth + 1, 4096)}w`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");
  return {
    src: primary.src,
    srcSet: srcSet || undefined,
  };
}

function getPrimaryThumbnailVariant(
  variants: ThumbnailVariant[],
  preferredWidth: number,
) {
  const sizedVariants = variants
    .filter((variant) => variant.width > 0)
    .sort((left, right) => left.width - right.width);

  if (sizedVariants.length === 0) {
    return variants[0];
  }

  if (preferredWidth > 0) {
    return (
      sizedVariants.find((variant) => variant.width >= preferredWidth) ??
      sizedVariants[sizedVariants.length - 1]
    );
  }

  return sizedVariants[sizedVariants.length - 1];
}

function getCustomThumbnailVariants(submission: ThumbnailSourceInput) {
  return getThumbnailVariants([
    [submission.thumbnailUrlHuge, submission.thumbHugeX],
    [submission.thumbnailUrlLarge, submission.thumbLargeX],
    [submission.thumbnailUrlMedium, submission.thumbMediumX],
  ]);
}

function getNonCustomThumbnailVariants(submission: ThumbnailSourceInput) {
  return getThumbnailVariants([
    [
      submission.thumbnailUrlHugeNonCustom,
      submission.thumbHugeNonCustomX,
    ],
    [
      submission.thumbnailUrlLargeNonCustom,
      submission.thumbLargeNonCustomX,
    ],
    [
      submission.thumbnailUrlMediumNonCustom,
      submission.thumbMediumNonCustomX,
    ],
  ]);
}

function getThumbnailVariants(
  entries: Array<[string | undefined, number | undefined]>,
) {
  const seen = new Set<string>();
  const variants: ThumbnailVariant[] = [];

  for (const [src, width] of entries) {
    if (!src || seen.has(src)) {
      continue;
    }
    seen.add(src);
    variants.push({
      src,
      width: width ?? 0,
    });
  }

  return variants;
}

function toPreviewSource(src?: string): PreviewSource | null {
  if (!src) {
    return null;
  }
  return { src };
}

function dedupePreviewSources(
  sources: Array<PreviewSource | null>,
) {
  const seen = new Set<string>();
  const deduped: PreviewSource[] = [];

  for (const source of sources) {
    if (!source?.src || seen.has(source.src)) {
      continue;
    }
    seen.add(source.src);
    deduped.push(source);
  }

  return deduped;
}

function buildAvatarSrcSet(submission: SubmissionCard) {
  const seen = new Set<string>();
  const variants = [
    [submission.userIconUrlSmall, "1x"],
    [submission.userIconUrlMedium, "2x"],
    [submission.userIconUrlLarge, "3x"],
  ] as const;

  return variants
    .filter(([src]) => {
      if (!src || seen.has(src)) {
        return false;
      }
      seen.add(src);
      return true;
    })
    .map(([src, descriptor]) => `${src} ${descriptor}`)
    .join(", ");
}

function openExternal(url?: string) {
  if (!url) {
    return;
  }
  void backend.openExternalURL(url).catch(() => undefined);
}

function ExternalActionButton(props: {
  url?: string;
  className: string;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openExternal(props.url);
      }}
      className={props.className}
    >
      {props.children}
    </button>
  );
}

function SubmissionAuthorButton(props: {
  submission: SubmissionCard;
  className?: string;
  compact?: boolean;
}) {
  const avatarSrc =
    props.submission.userIconUrlMedium ||
    props.submission.userIconUrlSmall ||
    props.submission.userIconUrlLarge ||
    DEFAULT_AVATAR_URL;
  const avatarSrcSet = buildAvatarSrcSet(props.submission);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openExternal(props.submission.userUrl);
      }}
      className={`inline-flex min-w-0 items-center text-left transition-opacity hover:opacity-85 ${
        props.compact ? "gap-1.5" : "gap-2"
      } ${props.className ?? ""}`}
    >
      <img
        src={avatarSrc}
        srcSet={avatarSrcSet || undefined}
        sizes={props.compact ? "24px" : "32px"}
        alt={props.submission.username}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(event) => {
          event.currentTarget.src = DEFAULT_AVATAR_URL;
          event.currentTarget.srcset = "";
        }}
        className={`shrink-0 rounded-full border border-white/70 bg-white object-cover ${
          props.compact ? "h-5 w-5" : "h-8 w-8"
        }`}
      />
      <span className="truncate">@{props.submission.username}</span>
    </button>
  );
}

function SubmissionEngagementStats(props: {
  submission: SubmissionCard;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${props.className ?? ""}`}
    >
      <span className="inline-flex items-center gap-1">
        <Eye size={props.compact ? 12 : 14} />
        {formatCompactCount(props.submission.viewsCount)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Star
          size={props.compact ? 12 : 14}
          className={
            props.submission.favorite
              ? "fill-current text-[#F4C542]"
              : "text-current"
          }
        />
        {formatCompactCount(props.submission.favoritesCount)}
      </span>
    </div>
  );
}

function formatCompactCount(value?: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value && value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value && value >= 1000 ? 1 : 0,
  }).format(Math.max(0, value ?? 0));
}

function PreviewFallback(props: {
  submission: SubmissionCard;
  className: string;
}) {
  const { icon, label } = getPreviewFallbackContent(props.submission);

  return (
    <div
      className={`${props.className} flex items-center justify-center bg-linear-to-br from-[var(--theme-page-soft)] via-[var(--theme-surface-strong)] to-[var(--theme-surface-soft)] text-[var(--theme-title)]`}
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

function clampIndex(value: number, size: number) {
  if (size <= 0) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = Math.round(value);
  return ((normalized % size) + size) % size;
}

function getVirtualGridColumnCount(
  containerWidth: number,
  targetCardWidth: number,
) {
  if (containerWidth <= 0) {
    return 1;
  }
  return Math.max(
    1,
    Math.floor(
      (containerWidth + RESULT_GRID_GAP) / (targetCardWidth + RESULT_GRID_GAP),
    ),
  );
}

function estimateResultRowHeight(
  containerWidth: number,
  columnCount: number,
  targetCardWidth: number,
) {
  const cardWidth = getVirtualGridCardWidth(
    containerWidth,
    columnCount,
    targetCardWidth,
  );

  return cardWidth * 0.8 + RESULT_CARD_CHROME_HEIGHT;
}

function getVirtualGridCardWidth(
  containerWidth: number,
  columnCount: number,
  targetCardWidth: number,
) {
  const totalGapWidth = Math.max(0, columnCount - 1) * RESULT_GRID_GAP;

  return Math.max(
    targetCardWidth,
    containerWidth > 0
      ? (containerWidth - totalGapWidth) / columnCount
      : targetCardWidth,
  );
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

function selectPanelPreviewImages(
  results: SubmissionCard[],
  preferCustomThumbnails: boolean,
) {
  const previewImages = results
    .map((result) =>
      getPreviewSources(result, "full", preferCustomThumbnails).map(
        (source) => source.src,
      ),
    )
    .filter((value) => value.length > 0);

  if (previewImages.length <= 3) {
    return previewImages;
  }

  const shuffled = [...previewImages];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled.slice(0, 3);
}

function getPanelWindowStart(resultCount: number, activeIndex: number) {
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;
  return Math.max(0, Math.min(safeIndex - 2, resultCount - PANEL_WINDOW_SIZE));
}

function buildSubmissionDownloadSummaries(
  queue: QueueSnapshot,
  downloadedSubmissionIds: ReadonlySet<string>,
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
    ...downloadedSubmissionIds,
    ...pendingSubmissionIds,
    ...jobsBySubmission.keys(),
  ]);

  for (const submissionId of submissionIds) {
    const jobs = jobsBySubmission.get(submissionId) ?? [];
    const relevantJobs = jobs.filter((job) => job.status !== "cancelled");

    if (jobs.length === 0) {
      if (downloadedSubmissionIds.has(submissionId)) {
        summaries.set(submissionId, {
          state: "downloaded",
          progress: 1,
        });
        continue;
      }
      summaries.set(submissionId, {
        state: "queued",
        progress: 0,
      });
      continue;
    }

    if (relevantJobs.length === 0) {
      if (downloadedSubmissionIds.has(submissionId)) {
        summaries.set(submissionId, {
          state: "downloaded",
          progress: 1,
        });
        continue;
      }
      summaries.set(submissionId, IDLE_DOWNLOAD_SUMMARY);
      continue;
    }

    if (relevantJobs.every((job) => job.status === "completed")) {
      summaries.set(submissionId, {
        state: "downloaded",
        progress: 1,
      });
      continue;
    }
    if (relevantJobs.every((job) => job.status === "failed")) {
      summaries.set(submissionId, {
        state: "failed",
        progress: 0,
      });
      continue;
    }

    const anyActive = relevantJobs.some((job) => job.status === "active");
    const anyQueued = relevantJobs.some((job) => job.status === "queued");
    const state = anyActive
      ? "downloading"
      : anyQueued || pendingSubmissionIds.has(submissionId)
        ? "queued"
        : "idle";

    summaries.set(submissionId, {
      state,
      progress: getSubmissionProgress(relevantJobs),
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

function renderDownloadIcon(state: SubmissionDownloadState, size: number) {
  if (state === "queued" || state === "downloading") {
    return <LoaderCircle className="animate-spin" size={size} />;
  }
  if (state === "downloaded") {
    return <Check size={size} />;
  }
  if (state === "failed") {
    return <RefreshCw size={size} />;
  }
  return <Download size={size} />;
}

function isSubmissionCancellable(state: SubmissionDownloadState) {
  return state === "queued" || state === "downloading";
}

function isSubmissionRetryable(state: SubmissionDownloadState) {
  return state === "failed";
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
  cancellable: boolean;
  retryable: boolean;
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
      aria-label={
        props.cancellable
          ? `Cancel download for ${props.title}`
          : props.retryable
            ? `Retry download for ${props.title}`
            : `Download ${props.title}`
      }
      disabled={props.summary.state === "downloaded"}
      className={`${props.cancellable ? "group/grid-download" : ""} relative flex h-8 w-8 items-center justify-center rounded-full shadow-sm backdrop-blur-md transition-all duration-300 ${
        props.summary.state === "downloaded"
          ? "translate-x-10 bg-[var(--theme-accent)] text-white"
          : props.retryable
            ? "bg-[var(--theme-danger)] text-white hover:scale-105 hover:bg-[#A84600]"
            : props.cancellable
              ? "bg-[var(--theme-info)] text-white hover:bg-[var(--theme-danger)]"
              : "bg-[var(--theme-info)] text-white hover:scale-105"
      } disabled:cursor-default disabled:hover:scale-100`}
    >
      {props.cancellable ? (
        <>
          <span className="transition-opacity duration-150 group-hover/grid-download:opacity-0">
            <CircularProgressIcon progress={progress} />
          </span>
          <span className="pointer-events-none absolute opacity-0 transition-opacity duration-150 group-hover/grid-download:opacity-100">
            <Square size={12} className="fill-current" strokeWidth={2.5} />
          </span>
        </>
      ) : props.summary.state === "downloaded" ? (
        <Check size={14} />
      ) : props.retryable ? (
        <RefreshCw size={14} />
      ) : (
        <Download size={14} />
      )}
    </button>
  );
}

function getDownloadActionButtonClass(
  mode: ResultsShowcaseProps["downloadButtonMode"],
  baseClassName: string,
) {
  const tone =
    mode === "stop"
      ? "theme-button-danger"
      : mode === "default"
        ? "theme-button-accent"
        : "theme-button-secondary";
  return `${tone} flex items-center gap-2 transition-all disabled:opacity-60 ${baseClassName}`;
}

function renderDownloadActionButtonContent(
  mode: ResultsShowcaseProps["downloadButtonMode"],
  label: string,
  iconSize: number,
) {
  if (mode === "stop") {
    return (
      <>
        <Square
          size={Math.max(12, iconSize - 2)}
          className="fill-current"
          strokeWidth={2.5}
        />
        {label}
      </>
    );
  }
  if (mode === "searching") {
    return (
      <>
        <LoaderCircle className="animate-spin" size={iconSize} />
        {label}
      </>
    );
  }
  if (mode === "timer") {
    return (
      <>
        <Eye size={iconSize} />
        {label}
      </>
    );
  }
  return (
    <>
      <Download size={iconSize} />
      {label}
    </>
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
