import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ChevronsDown,
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
  Video,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type MouseEventHandler,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent,
} from "react";

import {
  ContextMenu,
  type ContextMenuSection,
} from "./ContextMenu";
import ElasticSlider from "./ElasticSlider";
import { LoadMoreControl, type LoadMoreControlState } from "./LoadMoreControl";
import {
  SubmissionImageModal,
  type SubmissionModalMediaItem,
} from "./SubmissionImageModal";
import { DEFAULT_AVATAR_URL } from "../lib/constants";
import { accentClass } from "../lib/format";
import {
  backend,
  MEDIA_REFERRER_POLICY,
  resolveMediaSrcSet,
  resolveMediaURL,
} from "../lib/wails";
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
  unreadModeActive: boolean;
  activeSubmissionId: string;
  selectedSubmissionIds: string[];
  showCustomThumbnails: boolean;
  showSubmissionDetails: boolean;
  showEngagementStats?: boolean;
  allSelected: boolean;
  loading: boolean;
  searchPhase: "idle" | "searching" | "processing";
  searchActivity: "idle" | "search" | "refresh";
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
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  onToggleSelection: (submissionId: string) => void;
  onShowCustomThumbnailsChange: (enabled: boolean) => void;
  onShowSubmissionDetailsChange: (enabled: boolean) => void;
  onDownloadSubmission: (submissionId: string) => void;
  onCancelSubmission: (submissionId: string) => void;
  onRetrySubmission: (submissionId: string) => void;
  onStopAll: () => void;
  onRefresh: () => void;
  onStopSearch: () => void;
  onDisableUnreadMode: () => void;
  onStartNewSearch: () => void;
  onDownloadAction: () => void;
  onLoadMore: () => void;
  onLoadAll: () => void;
  onStopLoadMore: () => void;
  onSearchArtist: (username: string, avatarUrl?: string) => void;
  onSearchFavoritesBy: (username: string) => void;
  onSearchKeyword: (keywordId: string, keywordName: string) => void;
  onDownloadSubmissionFile: (submissionId: string, fileId?: string) => void;
  onOpenJobInFolder: (jobId: string) => void;
  onCancelDownloadJob: (jobId: string) => void;
  onRedownloadJob: (jobId: string) => void;
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

type ContextMenuState =
  | {
      kind: "gallery";
      x: number;
      y: number;
    }
  | {
      kind: "submission";
      submissionId: string;
      x: number;
      y: number;
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
  previewUrl?: string;
  screenUrl?: string;
  fullUrl?: string;
};

const PANEL_WINDOW_SIZE = 5;
const RESULT_GRID_GAP = 12;
const RESULT_CARD_CHROME_HEIGHT = 152;
const RESULT_CARD_COMPACT_CHROME_HEIGHT = 116;
const AUTO_SCROLL_IGNORE_MS = 400;
const USER_SCROLL_INTENT_WINDOW_MS = 1200;
const USER_SCROLL_DISABLE_THRESHOLD_PX = 4;
const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
  " ",
]);
const IDLE_DOWNLOAD_SUMMARY: SubmissionDownloadSummary = {
  state: "idle",
  progress: 0,
};

export function ResultsShowcase(props: ResultsShowcaseProps) {
  const { onPanelPreviewImagesChange } = props;
  const panelAnimationRef = useRef<number | null>(null);
  const resultsScrollRef = useRef<HTMLDivElement | null>(null);
  const resultsGridMeasureRef = useRef<HTMLDivElement | null>(null);
  const autoScrollIgnoreUntilRef = useRef(0);
  const userScrollIntentUntilRef = useRef(0);
  const lastObservedScrollTopRef = useRef(0);
  const previousResultsLengthRef = useRef(props.results.length);
  const previousFollowLatestResultsRef = useRef(false);
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
  const [followLatestResults, setFollowLatestResults] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const panelItems = useMemo(
    () => getPanelItems(props.results, panelStart),
    [props.results, panelStart],
  );
  const panelPreviewImages = useMemo(
    () => selectPanelPreviewImages(panelItems, props.showCustomThumbnails),
    [panelItems, props.showCustomThumbnails],
  );
  const panelPreviewImagesKey = useMemo(
    () => JSON.stringify(panelPreviewImages),
    [panelPreviewImages],
  );
  const reportedPanelPreviewImagesKeyRef = useRef("");
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
  const hasSelectedResults = selectedCount > 0;
  const canSelectAll = selectableCount > 0 && !props.allSelected;
  const canDeselectAll = hasSelectedResults;
  const canInvertSelection = selectableCount > 0;
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
        props.showSubmissionDetails,
      ),
    [
      gridCardWidth,
      props.showSubmissionDetails,
      resultColumnCount,
      resultsGridWidth,
    ],
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
  const hasResults = props.results.length > 0;
  const emptyState = getEmptyResultsState(
    props.searchResponse,
    props.searchPhase,
    props.unreadModeActive,
  );
  const refreshButtonState = getRefreshButtonState(
    props.searchPhase,
    props.searchActivity,
    props.searchResponse,
  );
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
  const activeModalJob = useMemo(
    () =>
      activeModalSubmission && activeModalItem
        ? findQueueJobForModalItem(
            props.queue,
            activeModalSubmission.submissionId,
            activeModalItem.fileId,
            activeModalItem.fileName,
          )
        : null,
    [activeModalItem, activeModalSubmission, props.queue],
  );
  const activeModalCancellable = isSubmissionCancellable(
    activeModalDownloadSummary?.state ?? "idle",
  );
  const activeModalRetryable = isSubmissionRetryable(
    activeModalDownloadSummary?.state ?? "idle",
  );
  const activeModalFileDownloadState = getQueueJobDownloadState(activeModalJob);
  const activeModalCanOpenCurrentFile =
    backend.capabilities.openLocalPaths && Boolean(activeModalJob?.fileExists);
  const activeModalCanRedownloadCurrentFile =
    backend.isDesktopRuntime && Boolean(activeModalJob?.id);
  const contextSubmission =
    contextMenu?.kind === "submission"
      ? props.results.find(
          (item) => item.submissionId === contextMenu.submissionId,
        ) ?? null
      : null;
  const contextDownloadSummary =
    contextSubmission
      ? (downloadSummaries.get(contextSubmission.submissionId) ??
        IDLE_DOWNLOAD_SUMMARY)
      : null;
  const contextSubmissionSelected = contextSubmission
    ? props.selectedSubmissionIds.includes(contextSubmission.submissionId)
    : false;
  const contextSubmissionDownloaded =
    contextDownloadSummary?.state === "downloaded";
  const contextSubmissionCancellable = isSubmissionCancellable(
    contextDownloadSummary?.state ?? "idle",
  );
  const contextSubmissionRetryable = isSubmissionRetryable(
    contextDownloadSummary?.state ?? "idle",
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
    lastObservedScrollTopRef.current = resultsScrollRef.current?.scrollTop ?? 0;
  }, [followLatestResults, props.results.length, resultColumnCount]);

  useEffect(() => {
    const previousResultsLength = previousResultsLengthRef.current;
    const followJustEnabled =
      followLatestResults && !previousFollowLatestResultsRef.current;
    const resultsAppended =
      previousResultsLength > 0 && props.results.length > previousResultsLength;

    previousResultsLengthRef.current = props.results.length;
    previousFollowLatestResultsRef.current = followLatestResults;

    if (!followLatestResults || !hasResults) {
      return;
    }
    if (resultRowCount <= 0) {
      return;
    }
    if (!followJustEnabled && !resultsAppended) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      autoScrollIgnoreUntilRef.current =
        performance.now() + AUTO_SCROLL_IGNORE_MS;
      resultRowVirtualizer.scrollToIndex(resultRowCount - 1, {
        align: "end",
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    followLatestResults,
    hasResults,
    resultRowCount,
    props.results.length,
    resultRowVirtualizer,
  ]);

  useEffect(() => {
    if (reportedPanelPreviewImagesKeyRef.current === panelPreviewImagesKey) {
      return;
    }
    reportedPanelPreviewImagesKeyRef.current = panelPreviewImagesKey;
    onPanelPreviewImagesChange(panelPreviewImages);
  }, [onPanelPreviewImagesChange, panelPreviewImages, panelPreviewImagesKey]);

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
    if (contextMenu?.kind === "submission" && !contextSubmission) {
      setContextMenu(null);
    }
  }, [contextMenu, contextSubmission]);

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

  function markUserScrollIntent() {
    userScrollIntentUntilRef.current =
      performance.now() + USER_SCROLL_INTENT_WINDOW_MS;
  }

  function handleResultsPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
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

  function handleResultsKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!SCROLL_KEYS.has(event.key)) {
      return;
    }
    markUserScrollIntent();
  }

  function handleResultsScroll(event: ReactUIEvent<HTMLDivElement>) {
    const nextScrollTop = event.currentTarget.scrollTop;
    const scrollDelta = Math.abs(nextScrollTop - lastObservedScrollTopRef.current);
    lastObservedScrollTopRef.current = nextScrollTop;

    if (!followLatestResults) {
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
    setFollowLatestResults(false);
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  function openGalleryContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      kind: "gallery",
      x: event.clientX,
      y: event.clientY,
    });
  }

  function openSubmissionContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    submissionId: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      kind: "submission",
      submissionId,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleSubmissionDownloadAction(
    submissionId: string,
    summary: SubmissionDownloadSummary,
  ) {
    if (summary.state === "downloaded") {
      return;
    }
    if (isSubmissionCancellable(summary.state)) {
      props.onCancelSubmission(submissionId);
      return;
    }
    if (isSubmissionRetryable(summary.state)) {
      props.onRetrySubmission(submissionId);
      return;
    }
    props.onDownloadSubmission(submissionId);
  }

  const galleryContextSections: ContextMenuSection[] = [
    {
      id: "selection",
      label: "Selection",
      items: [
        {
          id: "select-all",
          label: "Select all",
          leftSection: <Check size={14} />,
          disabled: !canSelectAll,
          onClick: props.onSelectAll,
        },
        {
          id: "deselect-all",
          label: "Deselect all",
          leftSection: <Square size={14} />,
          disabled: !canDeselectAll,
          onClick: props.onDeselectAll,
        },
        {
          id: "invert-selection",
          label: "Invert selection",
          leftSection: <RefreshCw size={14} />,
          disabled: !canInvertSelection,
          onClick: props.onInvertSelection,
        },
        {
          id: "download-selected",
          label: "Download now",
          leftSection: <Download size={14} />,
          disabled: props.downloadButtonDisabled,
          onClick: props.onDownloadAction,
        },
      ],
    },
    {
      id: "search",
      label: "Search",
      items: [
        {
          id: "refresh-results",
          label: refreshButtonState.stoppable ? "Stop search" : "Refresh results",
          leftSection: refreshButtonState.stoppable ? (
            <Square size={14} />
          ) : refreshButtonState.busy ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          ),
          disabled: refreshButtonState.disabled,
          onClick: refreshButtonState.stoppable ? props.onStopSearch : props.onRefresh,
        },
        {
          id: "stop-all",
          label: "Stop all downloads",
          leftSection: <Square size={14} />,
          disabled: !props.canStopAll,
          color: "red",
          onClick: props.onStopAll,
        },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        {
          id: "toggle-details",
          label: props.showSubmissionDetails ? "Hide details" : "Show details",
          leftSection: <Eye size={14} />,
          onClick: () =>
            props.onShowSubmissionDetailsChange(!props.showSubmissionDetails),
        },
        {
          id: "toggle-thumbnails",
          label: props.showCustomThumbnails
            ? "Use standard thumbnails"
            : "Use custom thumbnails",
          leftSection: <ChevronsDown size={14} />,
          onClick: () =>
            props.onShowCustomThumbnailsChange(!props.showCustomThumbnails),
        },
      ],
    },
  ];

  const submissionContextSections: ContextMenuSection[] = contextSubmission
    ? [
        {
          id: "submission-actions",
          label: "Submission",
          items: [
            {
              id: "open-preview",
              label: "Open preview",
              leftSection: <Eye size={14} />,
              onClick: () => openSubmissionModal(contextSubmission.submissionId),
            },
            {
              id: "focus-submission",
              label: "Focus submission",
              leftSection: <Check size={14} />,
              disabled: contextSubmission.submissionId === props.activeSubmissionId,
              onClick: () => props.onSelectActive(contextSubmission.submissionId),
            },
            {
              id: "toggle-selection",
              label: contextSubmissionDownloaded
                ? "Selection unavailable"
                : contextSubmissionSelected
                  ? "Deselect submission"
                  : "Select submission",
              leftSection: contextSubmissionSelected ? (
                <Check size={14} />
              ) : (
                <Plus size={14} />
              ),
              disabled: contextSubmissionDownloaded,
              onClick: () => props.onToggleSelection(contextSubmission.submissionId),
            },
            {
              id: "download-submission",
              label:
                contextDownloadSummary?.state === "downloaded"
                  ? "Already downloaded"
                  : contextSubmissionCancellable
                    ? "Cancel download"
                    : contextSubmissionRetryable
                      ? "Retry download"
                      : "Download now",
              leftSection: contextSubmissionCancellable ? (
                <Square size={14} />
              ) : contextSubmissionRetryable ? (
                <RefreshCw size={14} />
              ) : (
                <Download size={14} />
              ),
              disabled: contextSubmissionDownloaded,
              onClick: () =>
                handleSubmissionDownloadAction(
                  contextSubmission.submissionId,
                  contextDownloadSummary ?? IDLE_DOWNLOAD_SUMMARY,
                ),
            },
          ],
        },
        {
          id: "artist-actions",
          label: (
            <span className="flex items-center gap-2">
              <img
                src={
                  resolveMediaURL(
                    contextSubmission.userIconUrlSmall ||
                      contextSubmission.userIconUrlMedium ||
                      contextSubmission.userIconUrlLarge ||
                      DEFAULT_AVATAR_URL,
                  ) ?? DEFAULT_AVATAR_URL
                }
                alt={contextSubmission.username}
                className="h-5 w-5 rounded-full border border-white/70 bg-white object-cover"
                onError={(event) => {
                  event.currentTarget.src = DEFAULT_AVATAR_URL;
                }}
              />
              <span>{contextSubmission.username}</span>
            </span>
          ),
          items: [
            {
              id: "search-artist",
              label: "Search for artist",
              leftSection: <SearchIcon size={14} />,
              disabled: !contextSubmission.username.trim(),
              onClick: () =>
                props.onSearchArtist(
                  contextSubmission.username,
                  contextSubmission.userIconUrlMedium ||
                    contextSubmission.userIconUrlSmall ||
                    contextSubmission.userIconUrlLarge ||
                    "",
                ),
            },
            {
              id: "search-favorites",
              label: "Search favorites",
              leftSection: <Star size={14} />,
              disabled: !contextSubmission.username.trim(),
              onClick: () =>
                props.onSearchFavoritesBy(contextSubmission.username),
            },
          ],
        },
        {
          id: "links",
          label: "Links",
          items: [
            {
              id: "open-submission-page",
              label: "Open submission page",
              leftSection: <Eye size={14} />,
              disabled: !contextSubmission.submissionUrl,
              onClick: () => openExternal(contextSubmission.submissionUrl),
            },
            {
              id: "open-artist-page",
              label: "Open artist page",
              leftSection: <SearchIcon size={14} />,
              disabled: !contextSubmission.userUrl,
              onClick: () => openExternal(contextSubmission.userUrl),
            },
          ],
        },
      ]
    : [];

  return (
    <section className="relative mt-4">
      <h1 className="pointer-events-none relative z-20 -mb-12 -translate-y-10 block w-full max-w-[945px] break-words text-left font-teko text-[68px] leading-[0.82] font-bold text-white drop-shadow-sm antialiased sm:-mb-16 sm:translate-y-0 sm:text-[92px] lg:-mb-[130px] lg:text-[144px] lg:leading-[118.8px] -rotate-2 lg:tracking-[-0.02em] lg:origin-left">
        Preview
      </h1>

      <div className="relative z-10 mb-3 flex flex-wrap items-center justify-end gap-2 px-0 sm:mb-5 sm:gap-4 sm:px-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="theme-panel-soft rounded-full border px-3 py-1.5 text-xs font-bold backdrop-blur-md sm:px-4 sm:py-2 sm:text-sm">
            {selectedCount} selected
          </div>
          <button
            type="button"
            onClick={props.allSelected ? props.onDeselectAll : props.onSelectAll}
            disabled={selectAllDisabled}
            className="theme-button-secondary rounded-2xl border px-3.5 py-2 text-xs font-black shadow-sm backdrop-blur-md transition-all disabled:opacity-50 sm:px-5 sm:py-3 sm:text-sm"
          >
            {selectAllLabel}
          </button>
          <button
            type="button"
            onClick={refreshButtonState.stoppable ? props.onStopSearch : props.onRefresh}
            disabled={refreshButtonState.disabled}
            className={`${refreshButtonState.stoppable ? "theme-button-danger" : "theme-button-secondary"} flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-black shadow-sm backdrop-blur-md transition-all disabled:opacity-50 sm:px-5 sm:py-3 sm:text-sm`}
            title={refreshButtonState.title}
          >
            {refreshButtonState.stoppable ? (
              <Square size={14} className="fill-current" strokeWidth={2.5} />
            ) : refreshButtonState.busy ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            {refreshButtonState.label}
          </button>
          <button
            type="button"
            onClick={props.onStopAll}
            disabled={!props.canStopAll}
            className="theme-button-danger flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-black shadow-sm backdrop-blur-md transition-all disabled:opacity-50 sm:px-5 sm:py-3 sm:text-sm"
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
              "rounded-2xl border-b-8 px-4 py-2.5 text-xs font-black shadow-xl sm:px-6 sm:py-3 sm:text-sm",
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

      <div className="theme-panel flex h-[44rem] w-full flex-col overflow-hidden rounded-toy-sm border-2 shadow-pop sm:h-[52rem] md:h-[600px] md:flex-row" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 600px" }}>
        {props.results.length === 0 ? (
          <div className="theme-panel-soft flex h-full w-full flex-col items-center justify-center px-6 text-center">
            {emptyState.busy ? (
              <LoaderCircle
                className="animate-spin text-[var(--theme-info)]"
                size={42}
              />
            ) : (
              <SearchIcon className="text-[var(--theme-info)]" size={42} />
            )}
            <p className="theme-title mt-4 max-w-md text-lg font-bold">
              {emptyState.title}
            </p>
            <p className="mt-2 max-w-lg text-sm text-[var(--theme-text-soft)]">
              {emptyState.description}
            </p>
            {emptyState.showUnreadWarning ? (
              <div className="mt-4 max-w-xl rounded-3xl border border-[color-mix(in_srgb,var(--theme-danger)_35%,var(--theme-border-strong))] bg-[color-mix(in_srgb,var(--theme-danger-soft)_55%,transparent)] px-4 py-3 text-sm text-[var(--theme-text)] shadow-sm">
                <div className="flex items-start justify-center gap-2 text-left">
                  <AlertTriangle
                    size={16}
                    className="mt-0.5 shrink-0 text-[var(--theme-danger)]"
                  />
                  <p>
                    Did you mean to{" "}
                    <button
                      type="button"
                      onClick={props.onDisableUnreadMode}
                      className="font-black text-[var(--theme-accent-strong)] underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--theme-danger)]"
                    >
                      turn off unread mode
                    </button>{" "}
                    or{" "}
                    <button
                      type="button"
                      onClick={props.onStartNewSearch}
                      className="font-black text-[var(--theme-accent-strong)] underline decoration-dotted underline-offset-4 transition-colors hover:text-[var(--inkbunny-green)] dark:hover:text-[var(--theme-info)]"
                    >
                      start a new search
                    </button>
                    ?
                  </p>
                </div>
              </div>
            ) : null}
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
                onContextMenu={(event) =>
                  openSubmissionContextMenu(event, item.submissionId)
                }
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

                <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-5 sm:top-5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSubmissionDownloadAction(
                        item.submissionId,
                        downloadSummary,
                      );
                    }}
                    aria-label={
                      cancellable
                        ? `Cancel download for ${item.title}`
                        : retryable
                          ? `Retry download for ${item.title}`
                          : `Download ${item.title}`
                    }
                    disabled={downloaded}
                    className={`${cancellable ? "group/download-action" : ""} flex h-9 w-9 items-center justify-center rounded-full shadow-pop backdrop-blur-md transition-all duration-300 sm:h-11 sm:w-11 ${
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
                    className={`flex h-9 w-9 items-center justify-center rounded-full shadow-pop backdrop-blur-md transition-all duration-300 sm:h-11 sm:w-11 ${
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

                <div className="absolute bottom-5 left-5 z-10 max-w-[78%] sm:bottom-8 sm:left-8 sm:max-w-[72%]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-block rounded-full bg-white px-3 py-1 text-xs font-black shadow-sm transform sm:px-4 sm:text-sm ${
                        index % 2 === 0
                          ? "-rotate-3 text-[#3465A4]"
                          : "rotate-2 text-[#CC5E00]"
                      }`}
                    >
                      {item.badgeText || item.typeName || "Submission"}
                    </span>
                    <span className="rounded-full border border-white/55 bg-[#14112C]/35 px-2.5 py-1 text-[11px] font-bold text-white/92 backdrop-blur-sm sm:px-3 sm:text-xs">
                      {formatFileCount(item.pageCount)}
                    </span>
                  </div>
                  <h4 className="text-xl font-display font-black text-white drop-shadow-md sm:text-3xl">
                    {item.title}
                  </h4>
                  <p className="text-sm font-bold text-white opacity-95 sm:text-xl">
                    @{item.username}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {props.results.length > 0 ? (
        <div className="theme-panel-soft mt-6 overflow-hidden rounded-toy-sm border-2 shadow-pop backdrop-blur-2xl" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 80vh" }}>
          <div className="border-b border-[var(--theme-border-soft)] bg-[color:var(--theme-surface)]/92 px-4 py-3 backdrop-blur-2xl">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={props.allSelected ? props.onDeselectAll : props.onSelectAll}
                  disabled={selectAllDisabled}
                  className="theme-button-secondary rounded-2xl border px-4 py-2 text-xs font-black backdrop-blur-md transition-colors disabled:opacity-50"
                >
                  {selectAllLabel}
                </button>
                <button
                  type="button"
                  onClick={refreshButtonState.stoppable ? props.onStopSearch : props.onRefresh}
                  disabled={refreshButtonState.disabled}
                  className={`${refreshButtonState.stoppable ? "theme-button-danger" : "theme-button-secondary"} flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-black backdrop-blur-md transition-colors disabled:opacity-50`}
                  title={refreshButtonState.title}
                >
                  {refreshButtonState.stoppable ? (
                    <Square size={12} className="fill-current" strokeWidth={2.5} />
                  ) : refreshButtonState.busy ? (
                    <LoaderCircle className="animate-spin" size={14} />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {refreshButtonState.label}
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
                <label className="theme-panel-strong flex items-center gap-3 rounded-2xl border px-4 py-2 text-xs font-black backdrop-blur-md">
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 items-center justify-center rounded-[0.35rem] border ${
                      props.showSubmissionDetails
                        ? "border-[#76B900] bg-[#76B900] text-white"
                        : "border-[var(--theme-subtle)] bg-transparent text-transparent"
                    }`}
                  >
                    <Check size={12} />
                  </span>
                  <input
                    type="checkbox"
                    checked={props.showSubmissionDetails}
                    onChange={(event) =>
                      props.onShowSubmissionDetailsChange(
                        event.target.checked,
                      )
                    }
                    className="sr-only"
                  />
                  <span className="inline-flex items-center gap-2">
                    <FileText
                      size={14}
                      className="text-[var(--theme-info)]"
                    />
                    Submission Details
                  </span>
                </label>
                <button
                  type="button"
                  aria-pressed={followLatestResults}
                  disabled={!hasResults}
                  onClick={() =>
                    setFollowLatestResults((current) =>
                      hasResults ? !current : false,
                    )
                  }
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm transition-all motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 ${
                    followLatestResults
                      ? "border-[var(--theme-accent)] bg-[var(--theme-accent)] text-white"
                      : "theme-button-secondary"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  title={
                    followLatestResults
                      ? "Following the latest results"
                      : "Follow the latest results"
                  }
                >
                  <ChevronsDown size={18} strokeWidth={2.6} />
                </button>
              </div>
            </div>
          </div>
          <div
            ref={resultsScrollRef}
            onContextMenu={openGalleryContextMenu}
            onScroll={handleResultsScroll}
            onWheelCapture={() => markUserScrollIntent()}
            onTouchMoveCapture={() => markUserScrollIntent()}
            onPointerDownCapture={handleResultsPointerDown}
            onKeyDownCapture={handleResultsKeyDown}
            className="h-[68vh] overflow-x-hidden overflow-y-auto sm:h-[75vh]"
          >
            <div ref={resultsGridMeasureRef} className="p-2 sm:p-4">
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
                      className="absolute left-0 top-0 w-full pb-2 sm:pb-3"
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
                              onContextMenu={(event) =>
                                openSubmissionContextMenu(
                                  event,
                                  item.submissionId,
                                )
                              }
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

                              <SubmissionDetails
                                submission={item}
                                summary={downloadSummary}
                                cancellable={cancellable}
                                retryable={retryable}
                                downloaded={downloaded}
                                selected={selected}
                                showEngagementStats={props.showEngagementStats}
                                showDetails={props.showSubmissionDetails}
                                isFirstSelectable={
                                  item.submissionId ===
                                  firstSelectableSubmissionId
                                }
                                onDownload={(event) => {
                                  event.stopPropagation();
                                  handleSubmissionDownloadAction(
                                    item.submissionId,
                                    downloadSummary,
                                  );
                                }}
                                onToggleSelection={(event) => {
                                  event.stopPropagation();
                                  props.onToggleSelection(item.submissionId);
                                }}
                                onAuthorContextMenu={(event) =>
                                  openSubmissionContextMenu(
                                    event,
                                    item.submissionId,
                                  )
                                }
                              />
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
          onDownloadCurrentFile={() =>
            props.onDownloadSubmissionFile(
              activeModalSubmission.submissionId,
              activeModalItem.fileId,
            )
          }
          onStopCurrentFileDownload={() => {
            if (!activeModalJob?.id) {
              return;
            }
            props.onCancelDownloadJob(activeModalJob.id);
          }}
          onRedownloadCurrentFile={() => {
            if (!activeModalJob?.id) {
              return;
            }
            props.onRedownloadJob(activeModalJob.id);
          }}
          canRedownloadCurrentFile={activeModalCanRedownloadCurrentFile}
          canOpenCurrentFileInFolder={activeModalCanOpenCurrentFile}
          currentFileDownloadState={activeModalFileDownloadState}
          onOpenCurrentFileInFolder={() => {
            if (!activeModalJob?.id) {
              return;
            }
            props.onOpenJobInFolder(activeModalJob.id);
          }}
          onSearchArtist={props.onSearchArtist}
          onSearchFavoritesBy={props.onSearchFavoritesBy}
          onSearchKeyword={props.onSearchKeyword}
        />
      ) : null}

      <ContextMenu
        opened={contextMenu !== null}
        position={
          contextMenu
            ? {
                x: contextMenu.x,
                y: contextMenu.y,
              }
            : null
        }
        sections={
          contextMenu?.kind === "submission"
            ? submissionContextSections
            : galleryContextSections
        }
        onClose={closeContextMenu}
      />

      <LoadMoreControl
        canLoadMore={canLoadMore}
        disabled={props.loading}
        state={props.loadMoreState}
        onLoadMore={props.onLoadMore}
        onLoadAll={props.onLoadAll}
        onStop={props.onStopLoadMore}
        className="mt-6"
        loadedLabel={(pagesLoaded) =>
          getLoadMoreStatusLabel(
            props.loadMoreState.mode,
            props.searchPhase,
            pagesLoaded,
          )
        }
      />
    </section>
  );
}

function getEmptyResultsState(
  searchResponse: SearchResponse | null,
  searchPhase: ResultsShowcaseProps["searchPhase"],
  unreadModeActive: boolean,
) {
  if (searchPhase === "searching") {
    return {
      busy: true,
      title: "Searching...",
      description: searchResponse
        ? "Checking the next page of matches."
        : "Checking Inkbunny for matching submissions.",
      showUnreadWarning: false,
    };
  }
  if (searchPhase === "processing") {
    return {
      busy: true,
      title: "Processing results...",
      description: "Preparing matches for display.",
      showUnreadWarning: false,
    };
  }
  if (searchResponse) {
    return {
      busy: false,
      title: "No results found.",
      description: unreadModeActive
        ? "Unread Mode only shows new submissions, so this search may be empty even when older matches exist."
        : "Try broader keywords, different artists, or looser filters.",
      showUnreadWarning: unreadModeActive,
    };
  }
  return {
    busy: false,
    title: "Search results appear here.",
    description: "Run a search to fill this panel.",
    showUnreadWarning: false,
  };
}

function getLoadMoreStatusLabel(
  mode: LoadMoreControlState["mode"],
  searchPhase: ResultsShowcaseProps["searchPhase"],
  pagesLoaded: number,
) {
  if (searchPhase === "processing") {
    return "Processing results";
  }
  if (mode === "more") {
    return "Searching for more";
  }
  if (pagesLoaded <= 0) {
    return "Searching";
  }
  return `Searching ${pagesLoaded} ${pagesLoaded === 1 ? "page" : "pages"}`;
}

function getRefreshButtonState(
  searchPhase: ResultsShowcaseProps["searchPhase"],
  searchActivity: ResultsShowcaseProps["searchActivity"],
  searchResponse: SearchResponse | null,
) {
  const busy = searchPhase !== "idle";
  if (busy) {
    const label = searchActivity === "refresh" ? "Refreshing" : "Searching";
    return {
      busy: true,
      stoppable: true,
      disabled: false,
      label,
      title: `Stop ${label.toLowerCase()}`,
    };
  }
  return {
    busy: false,
    stoppable: false,
    disabled: !searchResponse,
    label: "Refresh",
    title: "Refresh the current search",
  };
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
  const videoSources =
    props.variant === "full"
      ? getSubmissionPrimaryVideoSources(props.submission)
      : [];

  if (videoSources.length > 0) {
    return (
      <SubmissionPreviewVideo
        key={getSubmissionPreviewKey(
          props.submission,
          props.refreshToken,
          props.preferCustomThumbnails,
        )}
        submission={props.submission}
        sources={videoSources}
        poster={sources[0] ?? null}
        className={props.className}
        refreshToken={props.refreshToken}
      />
    );
  }

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

function SubmissionDetails(props: {
  submission: SubmissionCard;
  summary: SubmissionDownloadSummary;
  cancellable: boolean;
  retryable: boolean;
  downloaded: boolean;
  selected: boolean;
  showEngagementStats?: boolean;
  showDetails: boolean;
  isFirstSelectable: boolean;
  onDownload: MouseEventHandler<HTMLButtonElement>;
  onToggleSelection: MouseEventHandler<HTMLButtonElement>;
  onAuthorContextMenu: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <div className="p-3">
      <div className="min-w-0">
        <ExternalActionButton
          url={props.submission.submissionUrl}
          className="theme-title block truncate text-left text-[13px] font-black transition-colors hover:text-[var(--theme-info)]"
        >
          {props.submission.title}
        </ExternalActionButton>
        <div className="mt-1 flex items-center justify-between gap-2">
          <SubmissionAuthorButton
            submission={props.submission}
            compact
            className="theme-muted min-w-0 flex-1 text-[10px] font-bold"
            onContextMenu={props.onAuthorContextMenu}
          />
          <div className="theme-subtle shrink-0 text-[10px] font-semibold">
            {props.submission.ratingName || "Unrated"}
          </div>
        </div>
      </div>

      <div
        className={`flex items-center gap-3 ${
          props.showDetails ? "mt-2.5 justify-between" : "mt-2 justify-end"
        }`}
      >
        {props.showDetails ? (
          props.showEngagementStats ? (
            <SubmissionEngagementStats
              submission={props.submission}
              compact
              className="theme-subtle text-[10px] font-semibold"
            />
          ) : (
            <div className="h-5" />
          )
        ) : null}
        <div className="flex items-center gap-2">
          <GridDownloadButton
            title={props.submission.title}
            summary={props.summary}
            cancellable={props.cancellable}
            retryable={props.retryable}
            onClick={props.onDownload}
          />
          <button
            type="button"
            onClick={props.onToggleSelection}
            disabled={props.downloaded}
            aria-label={
              props.selected
                ? `Remove ${props.submission.title} from selection`
                : `Select ${props.submission.title}`
            }
            className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-all duration-300 ${
              props.downloaded
                ? "pointer-events-none w-0 scale-75 opacity-0"
                : props.selected
                  ? "bg-[#73D216] text-white"
                  : "bg-[#D9DDD3]/92 text-[#555753] hover:bg-[#CFE8AE] hover:text-[#4E9A06]"
            }`}
            data-tour-anchor={
              props.isFirstSelectable ? "select-result" : undefined
            }
          >
            {props.downloaded ? (
              <Check size={14} />
            ) : props.selected ? (
              <Check size={14} />
            ) : (
              <Plus size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SubmissionPreviewVideo(props: {
  submission: SubmissionCard;
  sources: PreviewSource[];
  poster: PreviewSource | null;
  className: string;
  refreshToken: number;
}) {
  const sourcesKey = useMemo(
    () =>
      props.sources
        .map((item) => `${item.src}|${item.srcSet ?? ""}`)
        .join("||"),
    [props.sources],
  );
  const previewKey = `${props.submission.submissionId}:${props.refreshToken}:${sourcesKey}`;

  return <SubmissionPreviewVideoInner key={previewKey} {...props} />;
}

function SubmissionPreviewVideoInner(props: {
  submission: SubmissionCard;
  sources: PreviewSource[];
  poster: PreviewSource | null;
  className: string;
  refreshToken: number;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = props.sources[sourceIndex];

  if (!source?.src) {
    return props.poster?.src ? (
      <SubmissionPreviewImage
        submission={props.submission}
        sources={[props.poster]}
        alt={props.submission.title}
        className={props.className}
        sizes="100vw"
        refreshToken={props.refreshToken}
      />
    ) : (
      <PreviewFallback
        submission={props.submission}
        className={props.className}
      />
    );
  }

  return (
    <video
      key={`${props.submission.submissionId}-${props.refreshToken}-${sourceIndex}`}
      src={source.src}
      poster={props.poster?.src}
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
      ref={(element) => {
        element?.setAttribute("referrerpolicy", MEDIA_REFERRER_POLICY);
      }}
      aria-hidden="true"
      onError={() => {
        setSourceIndex((current) => current + 1);
      }}
      className={props.className}
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
      decoding="async"
      referrerPolicy={MEDIA_REFERRER_POLICY}
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
): SubmissionModalMediaItem[] {
  const mediaFiles = submission.mediaFiles ?? [];
  if (mediaFiles.length > 0) {
    return mediaFiles.map((file, index) => {
      const kind = isVideoAsset(file) ? "video" : "image";
      const thumbnailSources =
        kind === "video"
          ? []
          : getThumbnailFallbackSources(file, preferCustomThumbnails);

      return {
        key: file.fileId || `${submission.submissionId}-${index}`,
        fileId:
          file.fileId ||
          submission.fileIds?.[index] ||
          (submission.fileIds?.length === 1 ? submission.fileIds[0] : undefined),
        alt: `${submission.title} - page ${index + 1}`,
        label: `Page ${index + 1}`,
        fileName: file.fileName,
        mimeType: file.mimeType,
        kind,
        sources:
          kind === "video"
            ? getVideoPlaybackSources(file)
            : getMediaFilePreviewSources(file, preferCustomThumbnails),
        thumbnailSources,
        thumbnail: thumbnailSources[0] ?? null,
      };
    });
  }

  const kind = isVideoAsset(submission) ? "video" : "image";
  const thumbnailSources =
    kind === "video"
      ? []
      : getThumbnailFallbackSources(submission, preferCustomThumbnails);

  return [
    {
      key: `${submission.submissionId}-fallback`,
      fileId:
        submission.fileIds?.[0] ||
        (submission.mediaFiles?.length === 1
          ? submission.mediaFiles[0]?.fileId
          : undefined),
      alt: submission.title,
      label: "Page 1",
      fileName: submission.fileName,
      mimeType: submission.mimeType,
      kind,
      sources:
        kind === "video"
          ? getVideoPlaybackSources(submission)
          : getSubmissionModalPreviewSources(
              submission,
              preferCustomThumbnails,
            ),
      thumbnailSources,
      thumbnail: thumbnailSources[0] ?? null,
    },
  ];
}

function getSubmissionModalPreviewSources(
  submission: SubmissionCard,
  preferCustomThumbnails: boolean,
) {
  return dedupePreviewSources([
    toPreviewSourceIfImage(submission.fullUrl),
    getThumbnailPreviewSource(submission, preferCustomThumbnails),
    toPreviewSourceIfImage(submission.latestThumbnailUrl),
  ]);
}

function getMediaFilePreviewSources(
  file: SubmissionMediaFile,
  preferCustomThumbnails: boolean,
) {
  return dedupePreviewSources([
    toPreviewSourceIfImage(file.fullUrl),
    getThumbnailPreviewSource(file, preferCustomThumbnails),
  ]);
}

function getPreviewSources(
  submission: SubmissionCard,
  variant: "full" | "card" = "card",
  preferCustomThumbnails = true,
  preferredWidth = 0,
) {
  return dedupePreviewSources([
    ...getThumbnailFallbackSources(
      submission,
      preferCustomThumbnails,
      variant === "full",
      preferredWidth,
    ),
    toPreviewSourceIfImage(submission.latestThumbnailUrl),
    variant === "full" ? toPreviewSourceIfImage(submission.fullUrl) : null,
  ]);
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
    submission.fullUrl,
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

type VideoAssetLike = {
  fileName?: string;
  mimeType?: string;
  latestMimeType?: string;
  fullUrl?: string;
  screenUrl?: string;
  previewUrl?: string;
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
    return toPreviewSourceIfImage(item.thumbnailUrl);
  }

  const srcSetVariants = variants
    .filter((variant) => variant.width > 0)
    .sort((left, right) => left.width - right.width);
  const fullWidth = Math.max(
    ...srcSetVariants.map((variant) => variant.width),
    0,
  );
  const srcSet = [
    ...srcSetVariants.map(
      (variant) =>
        `${resolveMediaURL(variant.src) ?? variant.src} ${variant.width}w`,
    ),
    includeFullFileURL && item.fullUrl && !isVideoURL(item.fullUrl)
      ? `${resolveMediaURL(item.fullUrl) ?? item.fullUrl} ${Math.max(fullWidth + 1, 4096)}w`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");
  return {
    src: primary.src,
    srcSet: srcSet || undefined,
  };
}

function getThumbnailFallbackSources(
  item: ThumbnailSourceInput,
  preferCustomThumbnails: boolean,
  includeFullFileURL = false,
  preferredWidth = 0,
) {
  return dedupePreviewSources([
    getThumbnailPreviewSource(
      item,
      preferCustomThumbnails,
      includeFullFileURL,
      preferredWidth,
    ),
  ]);
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
  return { src: resolveMediaURL(src) ?? src };
}

function toPreviewSourceIfImage(src?: string): PreviewSource | null {
  if (!src || isVideoURL(src)) {
    return null;
  }
  return toPreviewSource(src);
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
    .map(([src, descriptor]) => `${resolveMediaURL(src) ?? src} ${descriptor}`)
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
      title={props.url}
    >
      {props.children}
    </button>
  );
}

function SubmissionAuthorButton(props: {
  submission: SubmissionCard;
  className?: string;
  compact?: boolean;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
}) {
  const avatarKey = [
    props.submission.submissionId,
    props.submission.userIconUrlLarge,
    props.submission.userIconUrlMedium,
    props.submission.userIconUrlSmall,
  ].join("|");

  return <SubmissionAuthorButtonInner key={avatarKey} {...props} />;
}

function SubmissionAuthorButtonInner(props: {
  submission: SubmissionCard;
  className?: string;
  compact?: boolean;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
}) {
  const preferredAvatarSrc =
    props.submission.userIconUrlMedium ||
    props.submission.userIconUrlSmall ||
    props.submission.userIconUrlLarge ||
    DEFAULT_AVATAR_URL;
  const preferredAvatarSrcSet = buildAvatarSrcSet(props.submission);
  const [avatarErrored, setAvatarErrored] = useState(false);

  return (
    <button
      type="button"
      onContextMenu={props.onContextMenu}
      onClick={(event) => {
        event.stopPropagation();
        openExternal(props.submission.userUrl);
      }}
      className={`inline-flex min-w-0 items-center text-left transition-opacity hover:opacity-85 ${
        props.compact ? "gap-1.5" : "gap-2"
      } ${props.className ?? ""}`}
    >
      <img
        src={
          avatarErrored
            ? DEFAULT_AVATAR_URL
            : (resolveMediaURL(preferredAvatarSrc) ?? preferredAvatarSrc)
        }
        srcSet={
          avatarErrored
            ? undefined
            : resolveMediaSrcSet(preferredAvatarSrcSet || undefined)
        }
        sizes={props.compact ? "24px" : "32px"}
        alt={props.submission.username}
        loading="lazy"
        decoding="async"
        referrerPolicy={MEDIA_REFERRER_POLICY}
        onError={() => setAvatarErrored(true)}
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
  const primaryMime = (
    submission.mimeType ||
    submission.latestMimeType ||
    ""
  ).toLowerCase();
  const typeName = submission.typeName.toLowerCase();

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

  if (isVideoAsset(submission)) {
    return {
      icon: <Video size={30} />,
      label: "Video",
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
  showSubmissionDetails: boolean,
) {
  const cardWidth = getVirtualGridCardWidth(
    containerWidth,
    columnCount,
    targetCardWidth,
  );

  return (
    cardWidth * 0.8 +
    (showSubmissionDetails
      ? RESULT_CARD_CHROME_HEIGHT
      : RESULT_CARD_COMPACT_CHROME_HEIGHT)
  );
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

function getSubmissionPrimaryVideoSources(submission: SubmissionCard) {
  const primaryFile = submission.mediaFiles?.[0];
  if (primaryFile && isVideoAsset(primaryFile)) {
    return getVideoPlaybackSources(primaryFile);
  }
  if (isVideoAsset(submission)) {
    return getVideoPlaybackSources(submission);
  }
  return [];
}

function getVideoPlaybackSources(
  item: VideoAssetLike,
) {
  return dedupePreviewSources([toPreviewSource(item.fullUrl)]);
}

function isVideoAsset(
  item: VideoAssetLike,
) {
  return (
    isVideoMimeType(item.mimeType || item.latestMimeType) ||
    hasVideoExtension(item.fileName) ||
    isVideoURL(item.fullUrl)
  );
}

function isVideoMimeType(mimeType?: string) {
  return (mimeType || "").toLowerCase().startsWith("video/");
}

function hasVideoExtension(value?: string) {
  return /\.(mp4|webm|ogg|mov)(?:$|[?#])/i.test(value || "");
}

function isVideoURL(value?: string) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if (hasVideoExtension(parsed.pathname)) {
      return true;
    }

    const proxiedTarget = parsed.searchParams.get("url");
    if (proxiedTarget) {
      return isVideoURL(proxiedTarget);
    }

    return hasVideoExtension(parsed.href);
  } catch {
    return hasVideoExtension(value);
  }
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

  return previewImages.slice(0, 3);
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
  const aggregates = new Map<
    string,
    {
      totalJobs: number;
      relevantJobs: number;
      anyActive: boolean;
      anyQueued: boolean;
      allCompleted: boolean;
      allFailed: boolean;
      knownBytes: number;
      writtenBytes: number;
      fallbackProgressTotal: number;
      fallbackProgressCount: number;
    }
  >();

  for (const job of queue.jobs) {
    if (!job.submissionId) {
      continue;
    }
    const aggregate = aggregates.get(job.submissionId) ?? {
      totalJobs: 0,
      relevantJobs: 0,
      anyActive: false,
      anyQueued: false,
      allCompleted: true,
      allFailed: true,
      knownBytes: 0,
      writtenBytes: 0,
      fallbackProgressTotal: 0,
      fallbackProgressCount: 0,
    };

    aggregate.totalJobs++;
    if (job.status !== "cancelled") {
      aggregate.relevantJobs++;
      aggregate.anyActive = aggregate.anyActive || job.status === "active";
      aggregate.anyQueued = aggregate.anyQueued || job.status === "queued";
      aggregate.allCompleted =
        aggregate.allCompleted && job.status === "completed";
      aggregate.allFailed = aggregate.allFailed && job.status === "failed";

      const totalBytes = Math.max(0, job.totalBytes || 0);
      const bytesWritten = Math.max(0, job.bytesWritten || 0);
      if (totalBytes > 0) {
        aggregate.knownBytes += totalBytes;
        aggregate.writtenBytes += Math.min(bytesWritten, totalBytes);
      } else {
        aggregate.fallbackProgressTotal +=
          job.status === "completed" ? 1 : clampProgress(job.progress);
        aggregate.fallbackProgressCount++;
      }
    }

    aggregates.set(job.submissionId, aggregate);
  }

  const submissionIds = new Set([
    ...downloadedSubmissionIds,
    ...pendingSubmissionIds,
    ...aggregates.keys(),
  ]);

  for (const submissionId of submissionIds) {
    const aggregate = aggregates.get(submissionId);

    if (!aggregate || aggregate.totalJobs === 0) {
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

    if (aggregate.relevantJobs === 0) {
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

    if (aggregate.allCompleted) {
      summaries.set(submissionId, {
        state: "downloaded",
        progress: 1,
      });
      continue;
    }
    if (aggregate.allFailed) {
      summaries.set(submissionId, {
        state: "failed",
        progress: 0,
      });
      continue;
    }

    const state = aggregate.anyActive
      ? "downloading"
      : aggregate.anyQueued || pendingSubmissionIds.has(submissionId)
        ? "queued"
        : "idle";

    summaries.set(submissionId, {
      state,
      progress: getAggregateSubmissionProgress(aggregate),
    });
  }

  return summaries;
}

function getAggregateSubmissionProgress(aggregate: {
  knownBytes: number;
  writtenBytes: number;
  fallbackProgressTotal: number;
  fallbackProgressCount: number;
}) {
  if (aggregate.knownBytes > 0) {
    return clampProgress(aggregate.writtenBytes / aggregate.knownBytes);
  }
  if (aggregate.fallbackProgressCount > 0) {
    return clampProgress(
      aggregate.fallbackProgressTotal / aggregate.fallbackProgressCount,
    );
  }
  return 0;
}

function getQueueJobDownloadState(
  job: DownloadJobSnapshot | null,
): SubmissionDownloadState {
  if (!job) {
    return "idle";
  }
  if (job.status === "queued") {
    return "queued";
  }
  if (job.status === "active") {
    return "downloading";
  }
  if (job.status === "completed") {
    return "downloaded";
  }
  if (job.status === "failed") {
    return "failed";
  }
  return "idle";
}

function findQueueJobForModalItem(
  queue: QueueSnapshot,
  submissionId: string,
  fileId?: string,
  fileName?: string,
) {
  const matchingJobs = queue.jobs.filter(
    (job) => job.submissionId === submissionId,
  );
  if (matchingJobs.length === 0) {
    return null;
  }

  if (fileId) {
    const exactFileIdMatch = [...matchingJobs]
      .reverse()
      .find((job) => job.fileId === fileId);
    if (exactFileIdMatch) {
      return exactFileIdMatch;
    }
  }

  if (fileName) {
    const exactFileNameMatch = [...matchingJobs]
      .reverse()
      .find((job) => job.fileName === fileName);
    if (exactFileNameMatch) {
      return exactFileNameMatch;
    }
  }

  return matchingJobs.length === 1 ? matchingJobs[0] ?? null : null;
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
