import { ArrowRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type TourStepPresentation = {
  id: string;
  anchor: string;
  title: string;
  body: string;
  helper?: string;
  nagText: string;
  canAdvance: boolean;
  advanceLabel: string;
  final?: boolean;
};

type OnboardingTourProps = {
  open: boolean;
  step: TourStepPresentation;
  motionEnabled: boolean;
  anchorRefreshKey: string;
  isAdvancing: boolean;
  onAdvance: () => void;
  onSkip: () => void;
};

type TourLayout = {
  cutout: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  popover: {
    left: number;
    top: number;
    width: number;
  };
  line: {
    left: number;
    top: number;
    width: number;
    rotation: number;
  };
};

type TourLayoutState = {
  key: string;
  value: TourLayout | null;
};

const VIEWPORT_MARGIN = 16;
const POPOVER_GAP = 24;
const CUTOUT_PADDING = 10;

export function OnboardingTour(props: OnboardingTourProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const layoutKey = props.open
    ? `${props.anchorRefreshKey}:${props.step.anchor}`
    : "";
  const [layoutState, setLayoutState] = useState<TourLayoutState>({
    key: "",
    value: null,
  });
  const layout = layoutState.key === layoutKey ? layoutState.value : null;

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const anchor = document.querySelector<HTMLElement>(
      `[data-tour-anchor="${props.step.anchor}"]`,
    );
    if (!anchor) {
      return;
    }

    anchor.classList.add("tour-target-emphasis");
    let shakeTimeout = 0;
    let shakeInterval = 0;

    const runShake = () => {
      if (!props.motionEnabled || typeof anchor.animate !== "function") {
        return;
      }
      anchor.animate(
        [
          { transform: "translate3d(0, 0, 0) rotate(0deg)" },
          { transform: "translate3d(-5px, 0, 0) rotate(-1deg)" },
          { transform: "translate3d(7px, 0, 0) rotate(1deg)" },
          { transform: "translate3d(-4px, 0, 0) rotate(-0.7deg)" },
          { transform: "translate3d(2px, 0, 0) rotate(0.35deg)" },
          { transform: "translate3d(0, 0, 0) rotate(0deg)" },
        ],
        {
          duration: 700,
          easing: "ease-in-out",
        },
      );
    };

    shakeTimeout = window.setTimeout(runShake, 250);
    shakeInterval = window.setInterval(runShake, 3200);

    return () => {
      window.clearTimeout(shakeTimeout);
      window.clearInterval(shakeInterval);
      anchor.classList.remove("tour-target-emphasis");
    };
  }, [props.anchorRefreshKey, props.motionEnabled, props.open, props.step.anchor]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const measure = () => {
      const anchor = document.querySelector<HTMLElement>(
        `[data-tour-anchor="${props.step.anchor}"]`,
      );
      const popover = popoverRef.current;
      if (!anchor || !popover) {
        setLayoutState({
          key: layoutKey,
          value: null,
        });
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const popoverWidth = Math.min(360, viewportWidth - VIEWPORT_MARGIN * 2);
      const popoverHeight = popover.offsetHeight;
      const cutout = {
        left: Math.max(VIEWPORT_MARGIN, rect.left - CUTOUT_PADDING),
        top: Math.max(VIEWPORT_MARGIN, rect.top - CUTOUT_PADDING),
        width: Math.min(
          viewportWidth - VIEWPORT_MARGIN * 2,
          rect.width + CUTOUT_PADDING * 2,
        ),
        height: Math.min(
          viewportHeight - VIEWPORT_MARGIN * 2,
          rect.height + CUTOUT_PADDING * 2,
        ),
      };
      const preferAbove =
        rect.bottom + popoverHeight + POPOVER_GAP > viewportHeight - VIEWPORT_MARGIN &&
        rect.top > popoverHeight + POPOVER_GAP;
      const popoverLeft = clamp(
        rect.left + rect.width / 2 - popoverWidth / 2,
        VIEWPORT_MARGIN,
        viewportWidth - popoverWidth - VIEWPORT_MARGIN,
      );
      const popoverTop = preferAbove
        ? Math.max(VIEWPORT_MARGIN, rect.top - popoverHeight - POPOVER_GAP)
        : Math.min(
            viewportHeight - popoverHeight - VIEWPORT_MARGIN,
            rect.bottom + POPOVER_GAP,
          );
      const popoverAnchorX = clamp(
        rect.left + rect.width / 2,
        popoverLeft + 36,
        popoverLeft + popoverWidth - 36,
      );
      const popoverAnchorY = preferAbove ? popoverTop + popoverHeight : popoverTop;
      const targetX = rect.left + rect.width / 2;
      const targetY = preferAbove ? rect.top : rect.bottom;
      const dx = targetX - popoverAnchorX;
      const dy = targetY - popoverAnchorY;

      setLayoutState({
        key: layoutKey,
        value: {
          cutout,
          popover: {
            left: popoverLeft,
            top: popoverTop,
            width: popoverWidth,
          },
          line: {
            left: popoverAnchorX,
            top: popoverAnchorY,
            width: Math.max(0, Math.sqrt(dx * dx + dy * dy)),
            rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
          },
        },
      });
    };

    const frame = window.requestAnimationFrame(() => {
      const anchor = document.querySelector<HTMLElement>(
        `[data-tour-anchor="${props.step.anchor}"]`,
      );
      anchor?.scrollIntoView({
        behavior: props.motionEnabled ? "smooth" : "auto",
        block: "center",
        inline: "center",
      });
      window.requestAnimationFrame(measure);
    });

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [layoutKey, props.motionEnabled, props.open, props.step.anchor]);

  if (!props.open) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[1100]">
      {layout ? (
        <>
          <div
            className="absolute left-0 top-0 bg-[rgba(17,18,24,0.58)] backdrop-blur-[2px]"
            style={{ width: "100%", height: layout.cutout.top }}
          />
          <div
            className="absolute left-0 bg-[rgba(17,18,24,0.58)] backdrop-blur-[2px]"
            style={{
              top: layout.cutout.top,
              width: layout.cutout.left,
              height: layout.cutout.height,
            }}
          />
          <div
            className="absolute bg-[rgba(17,18,24,0.58)] backdrop-blur-[2px]"
            style={{
              top: layout.cutout.top,
              left: layout.cutout.left + layout.cutout.width,
              right: 0,
              height: layout.cutout.height,
            }}
          />
          <div
            className="absolute left-0 bg-[rgba(17,18,24,0.58)] backdrop-blur-[2px]"
            style={{
              top: layout.cutout.top + layout.cutout.height,
              width: "100%",
              bottom: 0,
            }}
          />
          <div
            className={`pointer-events-none absolute rounded-[1.75rem] border border-white/70 bg-transparent ${
              props.motionEnabled ? "animate-tutorial-spotlight" : ""
            }`}
            style={{
              left: layout.cutout.left,
              top: layout.cutout.top,
              width: layout.cutout.width,
              height: layout.cutout.height,
            }}
          />
          <div
            className="absolute h-[3px] origin-left rounded-full bg-linear-to-r from-[#89CFF0] via-[#FFFACD] to-[#73D216] opacity-95 shadow-[0_0_20px_rgba(137,207,240,0.35)]"
            style={{
              left: layout.line.left,
              top: layout.line.top,
              width: layout.line.width,
              transform: `rotate(${layout.line.rotation}deg)`,
            }}
          />
        </>
      ) : null}

      <div
        ref={popoverRef}
        className="pointer-events-auto absolute rounded-[1.75rem] border border-white/60 bg-[rgba(255,255,255,0.97)] p-5 text-[#2D2D44] shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl dark:bg-[rgba(20,17,44,0.96)] dark:text-white"
        style={
          layout
            ? {
                left: layout.popover.left,
                top: layout.popover.top,
                width: layout.popover.width,
              }
            : {
                left: VIEWPORT_MARGIN,
                right: VIEWPORT_MARGIN,
                top: "50%",
                transform: "translateY(-50%)",
                maxWidth: 360,
                margin: "0 auto",
              }
        }
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-3xl font-black text-[var(--theme-accent-strong)]">
            {props.step.title}
          </h2>
          <button
            type="button"
            onClick={props.onSkip}
            className="theme-button-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
            aria-label="Skip"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3">
          <p className="theme-muted mt-3 text-sm font-semibold leading-6">
            {props.step.body}
          </p>
          {props.step.helper ? (
            <p className="mt-3 rounded-2xl border border-[var(--theme-border-soft)] bg-[var(--theme-surface-soft)] px-4 py-3 text-sm font-bold text-[var(--theme-info)]">
              {props.step.helper}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={props.onSkip}
            className="rounded-2xl px-4 py-3 text-sm font-black text-[#555753] transition-[color,transform,box-shadow,background-color] duration-150 hover:bg-[#CC5E00]/10 hover:text-[#CC5E00] active:translate-y-0.5 active:shadow-none"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={props.onAdvance}
            disabled={!props.step.canAdvance || props.isAdvancing}
            className="theme-button-accent flex items-center gap-2 rounded-2xl border-b-8 px-5 py-3 text-sm font-black shadow-xl disabled:opacity-55"
          >
            {props.isAdvancing
              ? "Continuing..."
              : props.step.final
                ? "Finish"
                : props.step.advanceLabel}
            {!props.step.final && !props.isAdvancing ? <ArrowRight size={16} /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (max <= min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
