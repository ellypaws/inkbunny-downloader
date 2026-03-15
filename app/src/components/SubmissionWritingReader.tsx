import {
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { SubmissionContent } from "./SubmissionContent";

type SubmissionWritingReaderProps = {
  submissionId: string;
  className?: string;
};

type ReaderBackground = "white" | "sepia" | "gray" | "black";
type ReaderFontGroup = "serif" | "sans" | "mono";
type ReaderFontFamily =
  | "georgia"
  | "times"
  | "sf"
  | "roboto"
  | "jetbrains"
  | "cascadia";

const MIN_READER_WIDTH = 520;
const MAX_READER_WIDTH = 1120;
const DEFAULT_READER_WIDTH = 1000;
const DEFAULT_FONT_SIZE = 18;

const backgroundPresets: Record<
  ReaderBackground,
  {
    label: string;
    panelClassName: string;
    toolbarClassName: string;
    textColor: string;
    borderColor: string;
    shadow: string;
  }
> = {
  white: {
    label: "White",
    panelClassName: "bg-[#FCFBF7]",
    toolbarClassName: "bg-[rgba(255,255,255,0.94)]",
    textColor: "#1C1B18",
    borderColor: "rgba(24, 24, 21, 0.14)",
    shadow: "0 28px 72px rgba(0,0,0,0.22)",
  },
  sepia: {
    label: "Sepia",
    panelClassName: "bg-[#F2E7D0]",
    toolbarClassName: "bg-[rgba(245,235,214,0.95)]",
    textColor: "#3A2D1F",
    borderColor: "rgba(74, 57, 37, 0.18)",
    shadow: "0 28px 72px rgba(60,42,23,0.2)",
  },
  gray: {
    label: "Gray",
    panelClassName: "bg-[#23272E]",
    toolbarClassName: "bg-[rgba(35,39,46,0.94)]",
    textColor: "#ECE8DF",
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadow: "0 28px 72px rgba(0,0,0,0.34)",
  },
  black: {
    label: "Black",
    panelClassName: "bg-[#111315]",
    toolbarClassName: "bg-[rgba(18,20,22,0.94)]",
    textColor: "#F3F0E8",
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadow: "0 28px 72px rgba(0,0,0,0.42)",
  },
};

const fontFamilyGroups: Record<
  ReaderFontGroup,
  {
    label: string;
    options: ReaderFontFamily[];
  }
> = {
  serif: {
    label: "Serif",
    options: ["georgia", "times"],
  },
  sans: {
    label: "Sans",
    options: ["sf", "roboto"],
  },
  mono: {
    label: "Mono",
    options: ["jetbrains", "cascadia"],
  },
};

const fontFamilyOptions: Record<
  ReaderFontFamily,
  {
    label: string;
    group: ReaderFontGroup;
    fontFamily: string;
  }
> = {
  georgia: {
    label: "Georgia",
    group: "serif",
    fontFamily: '"Georgia", "Times New Roman", serif',
  },
  times: {
    label: "Times New Roman",
    group: "serif",
    fontFamily: '"Times New Roman", Georgia, serif',
  },
  sf: {
    label: "San Francisco",
    group: "sans",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", sans-serif',
  },
  roboto: {
    label: "Roboto",
    group: "sans",
    fontFamily: 'Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  },
  jetbrains: {
    label: "JetBrains Mono",
    group: "mono",
    fontFamily:
      '"JetBrains Mono", "Cascadia Mono", Consolas, "Courier New", monospace',
  },
  cascadia: {
    label: "Cascadia Mono",
    group: "mono",
    fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
  },
};

export function SubmissionWritingReader(props: SubmissionWritingReaderProps) {
  return <SubmissionWritingReaderInner key={props.submissionId} {...props} />;
}

function SubmissionWritingReaderInner(props: SubmissionWritingReaderProps) {
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [readerWidth, setReaderWidth] = useState(DEFAULT_READER_WIDTH);
  const [background, setBackground] = useState<ReaderBackground>("white");
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>("georgia");
  const [openFontGroup, setOpenFontGroup] =
    useState<ReaderFontGroup | null>(null);
  const [containerWidth, setContainerWidth] = useState(DEFAULT_READER_WIDTH);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const readerFrameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const nextWidth = clampReaderWidth(
        dragState.startWidth + (event.clientX - dragState.startX) * 1.15,
      );
      setReaderWidth(nextWidth);
    };

    const stopDragging = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  useEffect(() => {
    const element = readerFrameRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setContainerWidth(element.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const backgroundPreset = backgroundPresets[background];
  const fontFamilyPreset = fontFamilyOptions[fontFamily];
  const activeFontGroup = fontFamilyPreset.group;
  const compactToolbar = containerWidth < 920;
  const readerStyle = useMemo(
    () => ({
      color: backgroundPreset.textColor,
      borderColor: backgroundPreset.borderColor,
      boxShadow: backgroundPreset.shadow,
      width: `min(calc(100vw - 1.5rem), ${readerWidth}px)`,
    }),
    [backgroundPreset, readerWidth],
  );

  const contentStyle = useMemo(
    () => ({
      fontSize: `${fontSize}px`,
      lineHeight: activeFontGroup === "mono" ? 1.9 : 1.82,
      fontFamily: fontFamilyPreset.fontFamily,
    }),
    [activeFontGroup, fontFamilyPreset.fontFamily, fontSize],
  );

  return (
    <div className={`relative flex max-w-full items-center justify-center ${props.className ?? ""}`}>
      <div
        ref={readerFrameRef}
        className={`relative grid max-h-[min(92vh,82rem)] max-w-full grid-rows-[auto,minmax(0,1fr)] overflow-hidden rounded-[0.9rem] border ${backgroundPreset.panelClassName}`}
        style={readerStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`relative z-[2] flex flex-wrap items-center gap-2 border-b px-3 py-3 sm:px-4 ${backgroundPreset.toolbarClassName}`}
          style={{ borderColor: backgroundPreset.borderColor }}
        >
          <div className="mr-1 inline-flex items-center gap-1 rounded-full border px-1 py-1" style={{ borderColor: backgroundPreset.borderColor }}>
            <ReaderControlButton
              label="Decrease font size"
              onClick={() => setFontSize((current) => Math.max(14, current - 1))}
              toneColor={backgroundPreset.textColor}
            >
              <Minus size={16} />
            </ReaderControlButton>
            <div className="min-w-10 text-center text-xs font-semibold uppercase tracking-[0.14em]">
              {fontSize}px
            </div>
            <ReaderControlButton
              label="Increase font size"
              onClick={() => setFontSize((current) => Math.min(28, current + 1))}
              toneColor={backgroundPreset.textColor}
            >
              <Plus size={16} />
            </ReaderControlButton>
          </div>

          <div className="inline-flex items-center gap-1 rounded-full border px-1 py-1" style={{ borderColor: backgroundPreset.borderColor }}>
            {(
              Object.entries(fontFamilyGroups) as Array<
                [ReaderFontGroup, (typeof fontFamilyGroups)[ReaderFontGroup]]
              >
            ).map(([key, group]) => (
              <div
                key={key}
                className="relative"
                onMouseLeave={() => {
                  setOpenFontGroup((current) =>
                    current === key ? null : current,
                  );
                }}
              >
                <ReaderChipButton
                  active={activeFontGroup === key}
                  label={group.label}
                  compactLabel={getCompactFontFamilyLabel(key)}
                  onClick={() =>
                    setOpenFontGroup((current) =>
                      current === key ? null : key,
                    )
                  }
                  toneColor={backgroundPreset.textColor}
                  style={{ fontFamily: fontFamilyPresetForGroup(key).fontFamily }}
                  compact={compactToolbar}
                />
                {openFontGroup === key ? (
                  <div
                    className="absolute left-0 top-full z-20 min-w-52 pt-2"
                  >
                    <div
                      className={`rounded-2xl border p-2 shadow-xl backdrop-blur-xl ${backgroundPreset.toolbarClassName}`}
                      style={{
                        borderColor: backgroundPreset.borderColor,
                      }}
                    >
                      <div className="mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                        {group.label}
                      </div>
                      <div className="flex flex-col gap-1">
                        {group.options.map((optionKey) => {
                          const option = fontFamilyOptions[optionKey];
                          return (
                            <button
                              key={optionKey}
                              type="button"
                              onClick={() => {
                                setFontFamily(optionKey);
                                setOpenFontGroup(null);
                              }}
                              className={`rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                                fontFamily === optionKey
                                  ? "bg-black/10"
                                  : "hover:bg-black/6"
                              }`}
                              style={{
                                color: backgroundPreset.textColor,
                                fontFamily: option.fontFamily,
                              }}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="inline-flex items-center gap-1 rounded-full border px-1 py-1" style={{ borderColor: backgroundPreset.borderColor }}>
            {(
              Object.entries(backgroundPresets) as Array<
                [ReaderBackground, (typeof backgroundPresets)[ReaderBackground]]
              >
            ).map(([key, preset]) => (
              <ReaderChipButton
                key={key}
                active={background === key}
                label={preset.label}
                onClick={() => setBackground(key)}
                toneColor={backgroundPreset.textColor}
                compact
                swatchClassName={preset.panelClassName}
              />
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReaderWidth((current) => clampReaderWidth(current - 80))}
              className="inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors hover:bg-black/6"
              style={{ borderColor: backgroundPreset.borderColor, color: backgroundPreset.textColor }}
              aria-label="Make reader narrower"
              title="Make reader narrower"
            >
              <ReaderWidthGlyph glyph="><" />
              {!compactToolbar ? <span>Narrow</span> : null}
            </button>
            <button
              type="button"
              onClick={() => setReaderWidth((current) => clampReaderWidth(current + 80))}
              className="inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors hover:bg-black/6"
              style={{ borderColor: backgroundPreset.borderColor, color: backgroundPreset.textColor }}
              aria-label="Make reader wider"
              title="Make reader wider"
            >
              <ReaderWidthGlyph glyph="<>" />
              {!compactToolbar ? <span>Wider</span> : null}
            </button>
            <button
              type="button"
              onClick={() => {
                setFontSize(DEFAULT_FONT_SIZE);
                setReaderWidth(DEFAULT_READER_WIDTH);
                setBackground("white");
                setFontFamily("georgia");
              }}
              className="inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors hover:bg-black/6"
              style={{ borderColor: backgroundPreset.borderColor, color: backgroundPreset.textColor }}
              aria-label="Reset reader settings"
              title="Reset reader settings"
            >
              <RotateCcw size={14} />
              {!compactToolbar ? <span>Reset</span> : null}
            </button>
          </div>
        </div>

        <div className="relative min-h-0 overflow-hidden">
          <SubmissionContent
            submissionId={props.submissionId}
            mode="writing"
            interactive
            loadingLabel="Loading writing"
            className="relative z-[1] max-h-[min(84vh,74rem)] overflow-y-auto px-5 py-5 text-left sm:px-8 sm:py-7 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:opacity-80 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_code]:rounded-[0.35rem] [&_code]:px-1.5 [&_code]:py-0.5 [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-5 [&_li]:list-disc [&_ol]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-[0.45rem] [&_pre]:p-3 [&_ul]:my-3"
            style={contentStyle}
          />
          <div
            className="absolute right-0 top-0 hidden h-full w-4 cursor-ew-resize items-center justify-center lg:flex"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dragStateRef.current = {
                startX: event.clientX,
                startWidth: readerWidth,
              };
            }}
          >
            <div
              className="h-18 w-1.5 rounded-full"
              style={{ backgroundColor: backgroundPreset.borderColor }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReaderControlButton(props: {
  label: string;
  onClick: () => void;
  toneColor: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/6"
      style={{ color: props.toneColor }}
    >
      {props.children}
    </button>
  );
}

function ReaderChipButton(props: {
  active: boolean;
  label: string;
  compactLabel?: string;
  onClick: () => void;
  toneColor: string;
  style?: CSSProperties;
  compact?: boolean;
  swatchClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
        props.active ? "bg-black/10" : "hover:bg-black/6"
      }`}
      style={{
        color: props.toneColor,
        ...props.style,
      }}
    >
      {props.swatchClassName ? (
        <span
          className={`h-4 w-4 rounded-full border ${props.swatchClassName}`}
          style={{
            borderColor: props.active
              ? "currentColor"
              : "rgba(0,0,0,0.18)",
          }}
          aria-hidden="true"
        />
      ) : props.compact ? (
        props.compactLabel ?? props.label.slice(0, 2)
      ) : (
        props.label
      )}
    </button>
  );
}

function ReaderWidthGlyph(props: { glyph: string }) {
  return (
    <span
      className="inline-flex min-w-4 justify-center font-mono text-[13px] font-bold tracking-[-0.12em]"
      aria-hidden="true"
    >
      {props.glyph}
    </span>
  );
}

function getCompactFontFamilyLabel(fontFamily: ReaderFontGroup) {
  if (fontFamily === "serif") {
    return "Se";
  }
  if (fontFamily === "sans") {
    return "Sa";
  }
  return "Mo";
}

function fontFamilyPresetForGroup(group: ReaderFontGroup) {
  return fontFamilyOptions[fontFamilyGroups[group].options[0]];
}

function clampReaderWidth(value: number) {
  const viewportLimit =
    typeof window === "undefined" ? MAX_READER_WIDTH : window.innerWidth - 24;
  const maxWidth = Math.max(
    MIN_READER_WIDTH,
    Math.min(MAX_READER_WIDTH, viewportLimit),
  );
  return Math.min(maxWidth, Math.max(MIN_READER_WIDTH, value));
}
