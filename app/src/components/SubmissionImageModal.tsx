import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Eye,
  File,
  FileImage,
  FileText,
  LoaderCircle,
  RefreshCw,
  Square,
  Star,
  X,
} from "lucide-react";
import { gsap } from "gsap";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DEFAULT_AVATAR_URL } from "../lib/constants";
import type { SubmissionCard } from "../lib/types";
import { backend } from "../lib/wails";

export type SubmissionModalPreviewSource = {
  src: string;
  srcSet?: string;
};

export type SubmissionModalMediaItem = {
  key: string;
  alt: string;
  label: string;
  fileName?: string;
  mimeType?: string;
  sources: SubmissionModalPreviewSource[];
  thumbnail: SubmissionModalPreviewSource | null;
};

type SubmissionImageModalProps = {
  submission: SubmissionCard;
  item: SubmissionModalMediaItem;
  items: SubmissionModalMediaItem[];
  activeIndex: number;
  downloadState: "idle" | "queued" | "downloading" | "downloaded" | "failed";
  cancellable: boolean;
  retryable: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDownload: () => void;
};

export function SubmissionImageModal(props: SubmissionImageModalProps) {
  const hasMultipleItems = props.items.length > 1;
  const modalRootRef = useRef<HTMLDivElement | null>(null);
  const panelShellRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const preLayersRef = useRef<HTMLDivElement | null>(null);
  const [sidebarMode, setSidebarMode] = useState<
    "open" | "opening" | "closing" | "closed"
  >(() =>
    typeof window === "undefined" || window.innerWidth >= 1180
      ? "open"
      : "closed",
  );
  const sidebarTweenRef = useRef<gsap.core.Timeline | null>(null);
  const initialSidebarOpenRef = useRef(sidebarMode !== "closed");
  const avatarCandidates = useMemo(
    () => getAvatarCandidates(props.submission),
    [props.submission],
  );
  const avatarSrcSet = useMemo(
    () => buildAvatarSrcSet(props.submission),
    [props.submission],
  );
  const [avatarIndex, setAvatarIndex] = useState(0);
  const avatarSrc = avatarCandidates[avatarIndex] ?? DEFAULT_AVATAR_URL;
  const [resolvedAvatarSrc, setResolvedAvatarSrc] = useState(avatarSrc);
  const isSidebarRendered = sidebarMode !== "closed";

  useEffect(() => {
    setAvatarIndex(0);
  }, [props.submission.submissionId]);

  useEffect(() => {
    let cancelled = false;
    setResolvedAvatarSrc(avatarSrc);

    void resolveAvatarImageURL(avatarSrc).then((resolved) => {
      if (cancelled) {
        return;
      }
      setResolvedAvatarSrc(resolved || avatarSrc);
    });

    return () => {
      cancelled = true;
    };
  }, [avatarSrc]);

  useEffect(() => {
    const navigationPill = document.querySelector<HTMLElement>(
      "[data-navigation-pill='true']",
    );
    if (!navigationPill) {
      return;
    }

    const previousDisplay = navigationPill.style.display;
    const previousPointerEvents = navigationPill.style.pointerEvents;
    const previousAriaHidden = navigationPill.getAttribute("aria-hidden");

    navigationPill.style.display = "none";
    navigationPill.style.pointerEvents = "none";
    navigationPill.setAttribute("aria-hidden", "true");

    return () => {
      navigationPill.style.display = previousDisplay;
      navigationPill.style.pointerEvents = previousPointerEvents;
      if (previousAriaHidden === null) {
        navigationPill.removeAttribute("aria-hidden");
      } else {
        navigationPill.setAttribute("aria-hidden", previousAriaHidden);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const shell = panelShellRef.current;
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;

      if (!shell || !panel) {
        return;
      }

      const reduceMotion =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.documentElement.classList.contains("motion-reduced") ||
        document.body.classList.contains("motion-reduced");
      const preLayers = preContainer
        ? (Array.from(
            preContainer.querySelectorAll(".sim-prelayer"),
          ) as HTMLElement[])
        : [];
      const panelItems = Array.from(
        panel.querySelectorAll(".sim-panel-item"),
      ) as HTMLElement[];
      const dimensionProp = getSidebarDimensionProperty();
      const setClosedState = () => {
        gsap.set(shell, { [dimensionProp]: 0 });
        gsap.set([...preLayers, panel], { xPercent: -100 });
        if (panelItems.length) {
          gsap.set(panelItems, { yPercent: 140, rotate: 10, opacity: 0 });
        }
      };

      if (reduceMotion) {
        if (initialSidebarOpenRef.current) {
          gsap.set(shell, { clearProps: dimensionProp });
          gsap.set([...preLayers, panel], { xPercent: 0 });
          if (panelItems.length) {
            gsap.set(panelItems, { yPercent: 0, rotate: 0, opacity: 1 });
          }
        } else {
          setClosedState();
        }
        return;
      }

      if (!initialSidebarOpenRef.current) {
        setClosedState();
        return;
      }

      setClosedState();

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.set(shell, { clearProps: dimensionProp });
          setSidebarMode("open");
        },
      });
      shell.style.overflow = "hidden";
      tl.to(
        shell,
        {
          [dimensionProp]: measureSidebarExpandedSize(shell),
          duration: 0.6,
          ease: "power4.out",
        },
        0,
      );
      preLayers.forEach((layer, index) => {
        tl.to(
          layer,
          {
            xPercent: 0,
            duration: 0.5,
            ease: "power4.out",
          },
          index * 0.07,
        );
      });

      const lastLayerTime = preLayers.length
        ? (preLayers.length - 1) * 0.07
        : 0;
      const panelInsertTime = lastLayerTime + (preLayers.length ? 0.08 : 0);
      const panelDuration = 0.65;

      tl.to(
        panel,
        {
          xPercent: 0,
          duration: panelDuration,
          ease: "power4.out",
        },
        panelInsertTime,
      );

      if (panelItems.length) {
        tl.to(
          panelItems,
          {
            yPercent: 0,
            rotate: 0,
            opacity: 1,
            duration: 1,
            ease: "power4.out",
            stagger: { each: 0.1, from: "start" },
          },
          panelInsertTime + panelDuration * 0.15,
        );
      }
      sidebarTweenRef.current = tl;
    }, modalRootRef);

    return () => {
      sidebarTweenRef.current?.kill();
      sidebarTweenRef.current = null;
      ctx.revert();
    };
  }, []);

  const runSidebarOpenAnimation = useCallback(() => {
    const shell = panelShellRef.current;
    const panel = panelRef.current;
    const preContainer = preLayersRef.current;
    if (!shell || !panel) {
      setSidebarMode("open");
      return;
    }

    const reduceMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("motion-reduced") ||
      document.body.classList.contains("motion-reduced");
    const preLayers = preContainer
      ? (Array.from(
          preContainer.querySelectorAll(".sim-prelayer"),
        ) as HTMLElement[])
      : [];
    const panelItems = Array.from(
      panel.querySelectorAll(".sim-panel-item"),
    ) as HTMLElement[];
    const dimensionProp = getSidebarDimensionProperty();

    sidebarTweenRef.current?.kill();

    if (reduceMotion) {
      gsap.set(shell, { clearProps: dimensionProp });
      gsap.set([...preLayers, panel], { xPercent: 0 });
      if (panelItems.length) {
        gsap.set(panelItems, { yPercent: 0, rotate: 0, opacity: 1 });
      }
      setSidebarMode("open");
      return;
    }

    shell.style.overflow = "hidden";
    gsap.set(shell, { [dimensionProp]: 0 });
    gsap.set([...preLayers, panel], { xPercent: -100 });
    if (panelItems.length) {
      gsap.set(panelItems, { yPercent: 140, rotate: 10, opacity: 0 });
    }

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(shell, { clearProps: dimensionProp });
        setSidebarMode("open");
      },
    });
    tl.to(
      shell,
      {
        [dimensionProp]: measureSidebarExpandedSize(shell),
        duration: 0.6,
        ease: "power4.out",
      },
      0,
    );
    preLayers.forEach((layer, index) => {
      tl.to(
        layer,
        {
          xPercent: 0,
          duration: 0.5,
          ease: "power4.out",
        },
        index * 0.07,
      );
    });

    const lastLayerTime = preLayers.length
      ? (preLayers.length - 1) * 0.07
      : 0;
    const panelInsertTime = lastLayerTime + (preLayers.length ? 0.08 : 0);
    const panelDuration = 0.65;

    tl.to(
      panel,
      {
        xPercent: 0,
        duration: panelDuration,
        ease: "power4.out",
      },
      panelInsertTime,
    );

    if (panelItems.length) {
      tl.to(
        panelItems,
        {
          yPercent: 0,
          rotate: 0,
          opacity: 1,
          duration: 1,
          ease: "power4.out",
          stagger: { each: 0.1, from: "start" },
        },
        panelInsertTime + panelDuration * 0.15,
      );
    }
    sidebarTweenRef.current = tl;
  }, []);

  const runSidebarCloseAnimation = useCallback(() => {
    const shell = panelShellRef.current;
    const panel = panelRef.current;
    const preContainer = preLayersRef.current;
    if (!shell || !panel) {
      setSidebarMode("closed");
      return;
    }

    const reduceMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("motion-reduced") ||
      document.body.classList.contains("motion-reduced");
    const preLayers = preContainer
      ? (Array.from(
          preContainer.querySelectorAll(".sim-prelayer"),
        ) as HTMLElement[])
      : [];
    const panelItems = Array.from(
      panel.querySelectorAll(".sim-panel-item"),
    ) as HTMLElement[];
    const dimensionProp = getSidebarDimensionProperty();

    sidebarTweenRef.current?.kill();

    if (reduceMotion) {
      gsap.set(shell, { [dimensionProp]: 0 });
      gsap.set([...preLayers, panel], { xPercent: -100 });
      if (panelItems.length) {
        gsap.set(panelItems, { yPercent: 140, rotate: 10, opacity: 0 });
      }
      setSidebarMode("closed");
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        setSidebarMode("closed");
      },
    });

    if (panelItems.length) {
      tl.to(
        panelItems,
        {
          yPercent: 140,
          rotate: 10,
          opacity: 0,
          duration: 0.28,
          ease: "power3.in",
          stagger: { each: 0.04, from: "end" },
        },
        0,
      );
    }

    gsap.set(shell, { [dimensionProp]: measureSidebarExpandedSize(shell) });
    tl.to(
      [panel, ...preLayers],
      {
        xPercent: -100,
        duration: 0.34,
        ease: "power3.in",
        stagger: 0.05,
      },
      0.08,
    );
    tl.to(
      shell,
      {
        [dimensionProp]: 0,
        duration: 0.52,
        ease: "power4.inOut",
      },
      0.02,
    );
    sidebarTweenRef.current = tl;
  }, []);

  const showSidebar = useCallback(() => {
    if (sidebarMode === "open" || sidebarMode === "opening") {
      return;
    }
    setSidebarMode("opening");
  }, [sidebarMode]);

  const hideSidebar = useCallback(() => {
    if (sidebarMode !== "open") {
      return;
    }
    setSidebarMode("closing");
  }, [sidebarMode]);

  useEffect(() => {
    if (sidebarMode !== "opening") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      runSidebarOpenAnimation();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [runSidebarOpenAnimation, sidebarMode]);

  useEffect(() => {
    if (sidebarMode !== "closing") {
      return;
    }
    runSidebarCloseAnimation();
  }, [runSidebarCloseAnimation, sidebarMode]);

  return (
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-[200] text-[var(--theme-text)] backdrop-blur-md"
      style={{ backgroundColor: "rgba(10, 14, 20, 0.82)" }}
      onClick={props.onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${props.submission.title} image viewer`}
    >
      <div className="flex h-full w-full flex-col md:flex-row">
        <div
          ref={panelShellRef}
          className={`relative min-h-0 overflow-hidden border-b border-[var(--theme-border-soft)] transition-[max-width,opacity,border-color] duration-300 md:border-b-0 ${
            isSidebarRendered
              ? "w-full shrink-0 opacity-100 md:w-[clamp(14rem,20vw,22rem)] md:border-r"
              : "pointer-events-none w-0 shrink-0 opacity-0 md:border-r-0"
          }`}
          aria-hidden={!isSidebarRendered}
        >
          <div
            ref={preLayersRef}
            className="pointer-events-none absolute inset-0 z-0"
            aria-hidden="true"
          >
            <div
              className="sim-prelayer absolute inset-0"
              style={{ background: "var(--theme-surface-muted)" }}
            />
            <div
              className="sim-prelayer absolute inset-0"
              style={{ background: "var(--theme-surface-soft)" }}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 z-[1] opacity-90"
            style={{
              background:
                "radial-gradient(circle at top right, var(--theme-accent-soft), transparent 34%), radial-gradient(circle at bottom left, var(--theme-border-soft), transparent 28%)",
            }}
          />
          <aside
            ref={panelRef}
            onClick={(event) => {
              event.stopPropagation();
            }}
            className="theme-panel-strong relative z-10 flex h-full flex-col px-5 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-2xl md:px-6 md:py-7"
          >
            <div className="sim-panel-item flex items-start gap-3">
              <img
                src={resolvedAvatarSrc}
                srcSet={
                  avatarIndex === 0 && !isUserIconURL(avatarSrc)
                    ? avatarSrcSet || undefined
                    : undefined
                }
                sizes="48px"
                alt={props.submission.username}
                referrerPolicy="no-referrer"
                onError={(event) => {
                  setAvatarIndex((current) => {
                    if (current < avatarCandidates.length - 1) {
                      return current + 1;
                    }
                    event.currentTarget.src = DEFAULT_AVATAR_URL;
                    event.currentTarget.srcset = "";
                    return current;
                  });
                }}
                className="h-12 w-12 shrink-0 rounded-full border border-[var(--theme-border-soft)] bg-white object-cover"
              />
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openExternal(props.submission.userUrl);
                  }}
                  className="theme-title truncate text-left text-base font-semibold transition-colors hover:text-[var(--theme-info-strong)]"
                >
                  @{props.submission.username}
                </button>
                <div className="theme-muted mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Eye size={14} />
                    {formatCompactCount(props.submission.viewsCount)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Star
                      size={14}
                      className={
                        props.submission.favorite
                          ? "fill-[#F4C542] text-[#F4C542]"
                          : "text-current"
                      }
                    />
                    {formatCompactCount(props.submission.favoritesCount)}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void openExternal(props.submission.submissionUrl);
                    }}
                    className="text-left transition-colors hover:text-[var(--theme-info-strong)]"
                  >
                    Open submission
                  </button>
                </div>
              </div>
            </div>

            <h2 className="sim-panel-item theme-title mt-6 font-display text-3xl font-black leading-tight md:text-[2.7rem]">
              {props.submission.title}
            </h2>

            <SubmissionDescription
              className="sim-panel-item theme-muted mt-5 max-h-[30vh] overflow-y-auto pr-1 text-[15px] leading-7 md:max-h-[calc(100vh-12rem)] [&_a]:text-[var(--theme-info-strong)] [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:hover]:text-[var(--theme-title)] [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--theme-border-soft)] [&_blockquote]:pl-4 [&_em]:italic [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-5 [&_li]:list-disc [&_ol]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-3 [&_strong]:font-bold [&_ul]:my-3"
              descriptionHtml={props.submission.descriptionHtml}
              description={props.submission.description}
            />
            <div className="sim-panel-item mt-auto flex justify-end pt-4">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  hideSidebar();
                }}
                aria-label="Hide information panel"
                className="theme-muted inline-flex items-center justify-center transition-colors hover:text-[var(--theme-title)]"
              >
                <ChevronsLeft size={24} />
              </button>
            </div>
          </aside>
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 28%, rgba(0,0,0,0.2) 100%)",
            }}
          />
          {!isSidebarRendered ? (
            <div className="absolute bottom-4 left-4 z-30">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  showSidebar();
                }}
                aria-label="Show information panel"
                className="theme-muted inline-flex items-center justify-center transition-colors hover:text-[var(--theme-title)]"
              >
                <ChevronsRight size={26} />
              </button>
            </div>
          ) : null}
          <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onDownload();
              }}
              aria-label={getDownloadAriaLabel(
                props.submission.title,
                props.downloadState,
                props.retryable,
              )}
              className={`${props.cancellable ? "group/modal-download" : ""} theme-panel-strong theme-hover relative flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-[var(--theme-title)] shadow-sm transition-colors`}
            >
              {props.cancellable ? (
                <>
                  <span className="transition-opacity duration-150 group-hover/modal-download:opacity-0">
                    {renderDownloadStateIcon(props.downloadState, 18)}
                  </span>
                  <span className="pointer-events-none absolute opacity-0 transition-opacity duration-150 group-hover/modal-download:opacity-100">
                    <Square
                      size={14}
                      className="fill-current"
                      strokeWidth={2.5}
                    />
                  </span>
                </>
              ) : (
                renderDownloadStateIcon(props.downloadState, 18)
              )}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onClose();
              }}
              aria-label="Close image viewer"
              className="theme-panel-strong theme-hover flex h-11 w-11 items-center justify-center rounded-full border text-[var(--theme-title)] shadow-sm transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden px-2 py-2 md:px-4 md:py-4">
            {hasMultipleItems ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onNavigate(props.activeIndex - 1);
                }}
                aria-label="Previous image"
                className="theme-panel-strong theme-hover absolute left-3 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border text-[var(--theme-title)] shadow-sm transition-colors md:left-5"
              >
                <ChevronLeft size={22} />
              </button>
            ) : null}

            <SubmissionModalImage
              submission={props.submission}
              sources={props.item.sources}
              thumbnail={props.item.thumbnail}
              alt={props.item.alt}
            />

            {hasMultipleItems ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onNavigate(props.activeIndex + 1);
                }}
                aria-label="Next image"
                className="theme-panel-strong theme-hover absolute right-3 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border text-[var(--theme-title)] shadow-sm transition-colors md:right-5"
              >
                <ChevronRight size={22} />
              </button>
            ) : null}
          </div>

          {hasMultipleItems ? (
            <div className="px-4 pb-4 md:px-6 md:pb-5">
              <div className="flex justify-center">
                <div className="flex max-w-full gap-3 overflow-x-auto px-2">
                  {props.items.map((item, index) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onNavigate(index);
                      }}
                      aria-label={`View ${item.label}`}
                      className={`theme-panel-strong h-20 w-20 shrink-0 overflow-hidden rounded-xl border transition-all md:h-24 md:w-24 ${
                        index === props.activeIndex
                          ? "border-[var(--theme-info-strong)] opacity-100 shadow-[0_0_0_1px_var(--theme-accent-soft)]"
                          : "border-[var(--theme-border-soft)] opacity-75 hover:border-[var(--theme-border)] hover:opacity-100"
                      }`}
                    >
                      {item.thumbnail?.src ? (
                        <img
                          src={item.thumbnail.src}
                          srcSet={item.thumbnail.srcSet}
                          alt={item.alt}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="theme-panel-muted theme-subtle flex h-full w-full items-center justify-center border">
                          <FileImage size={18} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SubmissionModalImage(props: {
  submission: SubmissionCard;
  sources: SubmissionModalPreviewSource[];
  thumbnail: SubmissionModalPreviewSource | null;
  alt: string;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const source = props.sources[sourceIndex];
  const sourcesKey = useMemo(
    () =>
      props.sources
        .map((item) => `${item.src}|${item.srcSet ?? ""}`)
        .join("||"),
    [props.sources],
  );

  useEffect(() => {
    setSourceIndex(0);
    setLoaded(false);
  }, [sourcesKey]);

  useEffect(() => {
    setLoaded(false);
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [source?.src, source?.srcSet]);

  if (!source?.src) {
    return (
      <ModalPreviewFallback
        submission={props.submission}
        className="h-[min(86vh,72rem)] w-full max-w-full"
      />
    );
  }

  return (
    <div
      className="relative flex h-[min(90vh,80rem)] w-full max-w-full items-center justify-center"
      onClick={(event) => event.stopPropagation()}
    >
      {props.thumbnail?.src ? (
        <img
          src={props.thumbnail.src}
          srcSet={props.thumbnail.srcSet}
          alt={props.alt}
          aria-hidden={loaded}
          referrerPolicy="no-referrer"
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-[250ms] ${
            loaded ? "opacity-0" : "opacity-100"
          }`}
        />
      ) : null}
      {!loaded ? (
        <div className="theme-panel-strong absolute z-10 flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold text-[var(--theme-title)] shadow-sm">
          <LoaderCircle size={18} className="animate-spin" />
          <span>Loading full image</span>
        </div>
      ) : null}
      <img
        ref={imageRef}
        key={`${source.src}-${source.srcSet ?? ""}-${sourceIndex}`}
        src={source.src}
        srcSet={source.srcSet}
        alt={props.alt}
        referrerPolicy="no-referrer"
        onLoad={() => {
          setLoaded(true);
        }}
        onError={() => {
          setLoaded(false);
          setSourceIndex((current) => current + 1);
        }}
        className={`relative z-[1] max-h-[min(90vh,80rem)] max-w-full min-w-0 object-contain transition-opacity duration-[250ms] ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

const SubmissionDescription = memo(function SubmissionDescription(props: {
  className: string;
  descriptionHtml?: string;
  description?: string;
}) {
  const [resolvedDescriptionHtml, setResolvedDescriptionHtml] = useState(
    props.descriptionHtml,
  );

  useEffect(() => {
    let cancelled = false;

    if (!props.descriptionHtml) {
      setResolvedDescriptionHtml(props.descriptionHtml);
      return;
    }
    if (!props.descriptionHtml.includes("/usericons/")) {
      setResolvedDescriptionHtml(props.descriptionHtml);
      return;
    }

    const documentFragment = new DOMParser().parseFromString(
      props.descriptionHtml,
      "text/html",
    );
    const userIconImages = Array.from(documentFragment.querySelectorAll("img"))
      .map((image) => ({
        image,
        src: image.getAttribute("src") || "",
      }))
      .filter((entry) => isUserIconURL(entry.src));

    if (userIconImages.length === 0) {
      setResolvedDescriptionHtml(props.descriptionHtml);
      return;
    }

    void Promise.all(
      userIconImages.map(async ({ image, src }) => {
        const proxiedSource = await resolveAvatarImageURL(src);
        if (proxiedSource) {
          image.setAttribute("src", proxiedSource);
        }
      }),
    ).then(() => {
      if (cancelled) {
        return;
      }
      setResolvedDescriptionHtml(documentFragment.body.innerHTML);
    });

    return () => {
      cancelled = true;
    };
  }, [props.descriptionHtml]);

  return (
    <div
      className={props.className}
      onClick={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (!anchor) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void openExternal(anchor.getAttribute("href") || undefined);
      }}
    >
      {resolvedDescriptionHtml ? (
        <div dangerouslySetInnerHTML={{ __html: resolvedDescriptionHtml }} />
      ) : props.description ? (
        <p className="whitespace-pre-wrap">{props.description}</p>
      ) : (
        <p className="theme-subtle">No description available.</p>
      )}
    </div>
  );
});

function ModalPreviewFallback(props: {
  submission: SubmissionCard;
  className: string;
}) {
  const { icon, label } = getPreviewFallbackContent(props.submission);

  return (
    <div
      className={`${props.className} theme-panel-soft theme-title flex items-center justify-center rounded-[1.25rem] border`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="rounded-full border border-[var(--theme-border-soft)] bg-[var(--theme-surface)] p-4">
          {icon}
        </div>
        <div className="text-sm font-semibold">{label}</div>
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

function renderDownloadStateIcon(
  state: SubmissionImageModalProps["downloadState"],
  size: number,
) {
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

function getDownloadAriaLabel(
  title: string,
  state: SubmissionImageModalProps["downloadState"],
  retryable: boolean,
) {
  if (state === "queued" || state === "downloading") {
    return `Cancel download for ${title}`;
  }
  if (retryable) {
    return `Retry download for ${title}`;
  }
  return `Download ${title}`;
}

function formatCompactCount(value?: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value && value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value && value >= 1000 ? 1 : 0,
  }).format(Math.max(0, value ?? 0));
}

function getAvatarCandidates(submission: SubmissionCard) {
  const seen = new Set<string>();
  return [
    submission.userIconUrlMedium,
    submission.userIconUrlLarge,
    submission.userIconUrlSmall,
  ].filter((src): src is string => {
    if (!src || seen.has(src)) {
      return false;
    }
    seen.add(src);
    return true;
  });
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

function getSidebarDimensionProperty() {
  return window.innerWidth >= 768 ? "width" : "height";
}

function measureSidebarExpandedSize(element: HTMLElement) {
  const dimensionProp = getSidebarDimensionProperty();
  const previousValue = element.style.getPropertyValue(dimensionProp);
  element.style.removeProperty(dimensionProp);
  const measured =
    dimensionProp === "width" ? element.scrollWidth : element.scrollHeight;
  if (previousValue) {
    element.style.setProperty(dimensionProp, previousValue);
  } else {
    element.style.removeProperty(dimensionProp);
  }
  return measured;
}

const proxiedAvatarImageRequests = new Map<string, Promise<string>>();

function isUserIconURL(src?: string) {
  return (src || "").toLowerCase().includes("/usericons/");
}

function resolveAvatarImageURL(src?: string) {
  if (!src) {
    return Promise.resolve("");
  }
  if (!isUserIconURL(src)) {
    return Promise.resolve(src);
  }

  const cached = proxiedAvatarImageRequests.get(src);
  if (cached) {
    return cached;
  }

  const request = backend
    .proxyAvatarImageURL(src)
    .catch(() => src);
  proxiedAvatarImageRequests.set(src, request);
  return request;
}

async function openExternal(url?: string) {
  if (!url) {
    return;
  }
  try {
    await backend.openExternalURL(url);
  } catch {
    return;
  }
}
