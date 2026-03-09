import { useState } from "react";
import { ChevronDown, ChevronsDown, LoaderCircle, Square } from "lucide-react";

export type LoadMoreControlState = {
  mode: "idle" | "more" | "all";
  pagesLoaded: number;
};

type LoadMoreControlProps = {
  canLoadMore: boolean;
  disabled?: boolean;
  state: LoadMoreControlState;
  onLoadMore: () => void;
  onLoadAll: () => void;
  onStop: () => void;
  className?: string;
  moreLabel?: string;
  moreHoverLabel?: string;
  allLabel?: string;
  allHoverLabel?: string;
  stopLabel?: string;
  loadedLabel?: (pagesLoaded: number) => string;
};

export function LoadMoreControl(props: LoadMoreControlProps) {
  const [hovered, setHovered] = useState<"more" | "all" | null>(null);

  if (!props.canLoadMore) {
    return null;
  }

  const moreLabel = props.moreLabel ?? "More";
  const moreHoverLabel = props.moreHoverLabel ?? "Load More";
  const allLabel = props.allLabel ?? "All";
  const allHoverLabel = props.allHoverLabel ?? "Load All";
  const stopLabel = props.stopLabel ?? "Stop";
  const loadingLabel =
    props.loadedLabel?.(props.state.pagesLoaded) ??
    (props.state.mode === "more"
      ? "Loading"
      : `Loading ${props.state.pagesLoaded} ${
          props.state.pagesLoaded === 1 ? "page" : "pages"
        }`);

  const isIdle = props.state.mode === "idle";
  const containerClassName = props.className
    ? `flex justify-center ${props.className}`
    : "flex justify-center";

  // Scale widths with the active labels so longer counts don't clip.
  const LEFT_IDLE_W = estimateButtonWidth(moreLabel, {
    iconWidth: 18,
    gapWidth: 6,
    paddingWidth: 32,
    minWidth: 84,
  });
  const LEFT_HOVER_W = estimateButtonWidth(moreHoverLabel, {
    iconWidth: 18,
    gapWidth: 6,
    paddingWidth: 32,
    minWidth: 124,
  });
  const RIGHT_IDLE_W = estimateButtonWidth(allLabel, {
    iconWidth: 0,
    gapWidth: 0,
    paddingWidth: 28,
    minWidth: 52,
  });
  const RIGHT_HOVER_W = estimateButtonWidth(allHoverLabel, {
    iconWidth: 18,
    gapWidth: 6,
    paddingWidth: 30,
    minWidth: 110,
  });
  const STOP_W = Math.max(
    estimateButtonWidth(loadingLabel, {
      iconWidth: 18,
      gapWidth: 8,
      paddingWidth: 38,
      minWidth: 160,
    }),
    estimateButtonWidth(stopLabel, {
      iconWidth: 18,
      gapWidth: 8,
      paddingWidth: 38,
      minWidth: 160,
    }),
  );

  const leftWidth = hovered === "more" ? LEFT_HOVER_W : LEFT_IDLE_W;
  const rightWidth = hovered === "all" ? RIGHT_HOVER_W : RIGHT_IDLE_W;

  // The outer container perfectly wraps the internal buttons, handling the expanding layout seamlessly
  const containerWidth = isIdle
    ? leftWidth + rightWidth + (hovered ? 0 : 1) // +1 for the divider when not hovered
    : STOP_W;

  return (
    <div className={containerClassName}>
      <div
        className="theme-button-accent relative flex h-11 items-center overflow-hidden rounded-xl border shadow-pop transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-pop-hover"
        style={{ width: `${containerWidth}px` }}
        onMouseLeave={() => setHovered(null)}
      >
        {isIdle ? (
          <>
            {/* Sliding Highlight Background */}
            <div
              className="pointer-events-none absolute bottom-[4px] top-[4px] rounded-[7px] bg-black/5 transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-white/10"
              style={{
                left: hovered === "all" ? `${leftWidth + 2}px` : "2px",
                width:
                  hovered === "more"
                    ? `${leftWidth - 4}px`
                    : hovered === "all"
                      ? `${rightWidth - 4}px`
                      : "0px",
                opacity: hovered ? 1 : 0,
              }}
            />

            {/* Left Action (More) */}
            <button
              type="button"
              onClick={props.onLoadMore}
              disabled={props.disabled}
              onMouseEnter={() => setHovered("more")}
              className="relative z-10 flex h-full items-center justify-center bg-transparent text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-60"
              style={{ width: `${leftWidth}px` }}
              title="Load More"
            >
              <div className="flex w-max items-center gap-1.5">
                <ChevronDown size={18} className="shrink-0" />
                <div
                  className="relative h-6 overflow-hidden"
                  style={{
                    width: hovered === "more" ? `${LEFT_HOVER_W - 44}px` : `${LEFT_IDLE_W - 44}px`,
                    transition: "width 400ms cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
                  <span
                    className={`absolute inset-0 flex items-center justify-start transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      hovered === "more"
                        ? "-translate-y-6 opacity-0"
                        : "translate-y-0 opacity-100"
                    }`}
                  >
                    {moreLabel}
                  </span>
                  <span
                    className={`absolute inset-0 flex items-center justify-start whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      hovered === "more"
                        ? "translate-y-0 opacity-100"
                        : "translate-y-6 opacity-0"
                    }`}
                  >
                    {moreHoverLabel}
                  </span>
                </div>
              </div>
            </button>

            {/* Subtle Divider (disappears on hover to solidify the split) */}
            <div
              className={`h-6 bg-neutral-200 transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-neutral-700 ${
                hovered ? "w-0 opacity-0" : "w-[1px] opacity-100"
              }`}
            />

            {/* Right Action (All) */}
            <button
              type="button"
              onClick={props.onLoadAll}
              disabled={props.disabled}
              onMouseEnter={() => setHovered("all")}
              className="relative z-10 flex h-full items-center justify-center bg-transparent text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] disabled:opacity-60"
              style={{ width: `${rightWidth}px` }}
              title="Load All"
            >
              <div className="flex w-max items-center">
                <div
                  className={`${hovered === "all" ? "mr-1.5" : "mr-0"}`}
                  style={{
                    width: hovered === "all" ? "18px" : "0px",
                    opacity: hovered === "all" ? 1 : 0,
                    transition: "all 400ms cubic-bezier(0.22,1,0.36,1)",
                    overflow: "hidden",
                  }}
                >
                  <ChevronsDown size={18} className="shrink-0" />
                </div>
                <div
                  className="relative h-6 overflow-hidden"
                  style={{
                    width: hovered === "all" ? `${RIGHT_HOVER_W - 36}px` : `${RIGHT_IDLE_W - 28}px`,
                    transition: "width 400ms cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
                  <span
                    className={`absolute inset-0 flex items-center justify-start transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      hovered === "all"
                        ? "-translate-y-6 opacity-0"
                        : "translate-y-0 opacity-100"
                    }`}
                  >
                    {allLabel}
                  </span>
                  <span
                    className={`absolute inset-0 flex items-center justify-start whitespace-nowrap transition-all duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      hovered === "all"
                        ? "translate-y-0 opacity-100"
                        : "translate-y-6 opacity-0"
                    }`}
                  >
                    {allHoverLabel}
                  </span>
                </div>
              </div>
            </button>
          </>
        ) : (
          /* Status/Stop Button Content */
          <div className="h-full w-full animate-in fade-in duration-300">
            <button
              type="button"
              onClick={props.onStop}
              className="group/stop flex h-full w-full items-center justify-center gap-2 bg-transparent transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              title={props.stopLabel ?? "Stop loading more results"}
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <LoaderCircle
                  className="animate-spin transition-opacity duration-150 group-hover/stop:opacity-0"
                  size={18}
                />
                <Square
                  size={14}
                  className="absolute fill-current opacity-0 transition-opacity duration-150 group-hover/stop:opacity-100"
                  strokeWidth={2.5}
                />
              </span>
              <span className="relative inline-flex h-5 items-center justify-center overflow-hidden whitespace-nowrap">
                <span className="transition-all duration-200 group-hover/stop:-translate-y-5 group-hover/stop:opacity-0">
                  {loadingLabel}
                </span>
                <span className="absolute inset-0 translate-y-5 opacity-0 transition-all duration-200 group-hover/stop:translate-y-0 group-hover/stop:opacity-100">
                  {stopLabel}
                </span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function estimateButtonWidth(
  label: string,
  options: {
    iconWidth: number;
    gapWidth: number;
    paddingWidth: number;
    minWidth: number;
  },
) {
  const textWidth = Math.ceil(label.length * 7.6);
  return Math.max(
    options.minWidth,
    textWidth + options.iconWidth + options.gapWidth + options.paddingWidth,
  );
}
