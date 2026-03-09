import { ChevronDown, ChevronsDown, LoaderCircle, Square } from "lucide-react";
import type { ReactNode } from "react";

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
  if (!props.canLoadMore) {
    return null;
  }

  const containerClassName = props.className
    ? `flex justify-center ${props.className}`
    : "flex justify-center";

  return (
    <div className={containerClassName}>
      {props.state.mode === "idle" ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LoadMoreActionButton
            icon={<ChevronDown size={18} />}
            label={props.moreLabel ?? "More"}
            hoverLabel={props.moreHoverLabel ?? "Load More"}
            onClick={props.onLoadMore}
            disabled={Boolean(props.disabled)}
          />
          <LoadMoreActionButton
            icon={<ChevronsDown size={18} />}
            label={props.allLabel ?? "All"}
            hoverLabel={props.allHoverLabel ?? "Load All"}
            onClick={props.onLoadAll}
            disabled={Boolean(props.disabled)}
          />
        </div>
      ) : (
        <LoadMoreStatusButton
          label={
            props.loadedLabel?.(props.state.pagesLoaded) ??
            `Loaded ${props.state.pagesLoaded} ${
              props.state.pagesLoaded === 1 ? "page" : "pages"
            }`
          }
          stopLabel={props.stopLabel ?? "Stop"}
          onClick={props.onStop}
        />
      )}
    </div>
  );
}

function LoadMoreActionButton(props: {
  label: string;
  hoverLabel: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="theme-button-accent group flex w-[5.9rem] items-center justify-start gap-2 overflow-hidden rounded-xl border px-4 py-3 font-bold shadow-pop transition-[width,box-shadow] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:w-[9.9rem] hover:shadow-pop-hover disabled:opacity-60"
    >
      <span className="shrink-0">{props.icon}</span>
      <span className="relative h-5 w-[2.35rem] overflow-hidden transition-[width] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:w-[5.95rem]">
        <span className="absolute inset-y-0 left-0 flex items-center gap-[1.4rem] whitespace-nowrap transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-[3.75rem]">
          <span>{props.label}</span>
          <span>{props.hoverLabel}</span>
        </span>
      </span>
    </button>
  );
}

function LoadMoreStatusButton(props: {
  label: string;
  stopLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="theme-button-accent group flex min-w-[12rem] items-center justify-center gap-2 overflow-hidden rounded-xl border px-5 py-3 font-bold shadow-pop transition-all hover:shadow-pop-hover"
      title="Stop loading more results"
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <LoaderCircle
          className="animate-spin transition-opacity duration-150 group-hover:opacity-0"
          size={18}
        />
        <Square
          size={14}
          className="absolute fill-current opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          strokeWidth={2.5}
        />
      </span>
      <span className="relative inline-flex h-5 items-center justify-center overflow-hidden whitespace-nowrap">
        <span className="transition-all duration-200 group-hover:-translate-y-5 group-hover:opacity-0">
          {props.label}
        </span>
        <span className="absolute inset-0 translate-y-5 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          {props.stopLabel}
        </span>
      </span>
    </button>
  );
}
