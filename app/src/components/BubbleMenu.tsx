import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { gsap } from "gsap";

export type BubbleMenuItem = {
  id: string;
  label: string;
  subtitle?: string;
  active?: boolean;
  ariaLabel?: string;
  rotation?: number;
  hoverStyles?: {
    bgColor?: string;
    textColor?: string;
  };
};

export type BubbleMenuProps = {
  open: boolean;
  items: BubbleMenuItem[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onOpenChange: (open: boolean) => void;
  className?: string;
  style?: CSSProperties;
  menuBg?: string;
  menuContentColor?: string;
  animationEase?: string;
  animationDuration?: number;
  staggerDelay?: number;
};

type RenderedBubbleItem =
  | (BubbleMenuItem & { kind: "tab"; closeable: boolean })
  | {
      id: "__add__";
      kind: "add";
      label: "+";
      subtitle: string;
      ariaLabel: string;
      rotation: number;
      hoverStyles: {
        bgColor: string;
        textColor: string;
      };
    };

export default function BubbleMenu({
  open,
  items,
  onSelect,
  onClose,
  onAdd,
  onOpenChange,
  className,
  style,
  menuBg = "#fff",
  menuContentColor = "#111",
  animationEase = "back.out(1.5)",
  animationDuration = 0.5,
  staggerDelay = 0.12,
}: BubbleMenuProps) {
  const [showOverlay, setShowOverlay] = useState(open);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<(HTMLButtonElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const previousItemIdsRef = useRef<string[]>(items.map((item) => item.id));

  const menuItems = useMemo<RenderedBubbleItem[]>(
    () => [
      ...items.map((item, index) => ({
        ...item,
        kind: "tab" as const,
        closeable: true,
        rotation:
          item.rotation ?? DEFAULT_ROTATIONS[index % DEFAULT_ROTATIONS.length],
        hoverStyles: item.hoverStyles ?? getDefaultHoverStyles(item.active),
      })),
      {
        id: "__add__",
        kind: "add" as const,
        label: "+",
        subtitle: "new tab",
        ariaLabel: "Add search session",
        rotation: 8,
        hoverStyles: {
          bgColor: "#2A7FA6",
          textColor: "#ffffff",
        },
      },
    ],
    [items],
  );
  const useCenteredLayout = menuItems.length <= 3;

  useEffect(() => {
    if (open) {
      setShowOverlay(true);
    }
  }, [open]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const bubbles = bubblesRef.current.filter(Boolean);
    const labels = labelRefs.current.filter(Boolean);
    if (!overlay || bubbles.length === 0) {
      return;
    }

    if (open) {
      gsap.set(overlay, { display: "flex" });
      gsap.killTweensOf([...bubbles, ...labels]);
      gsap.set(bubbles, { scale: 0, transformOrigin: "50% 50%" });
      gsap.set(labels, { y: 24, autoAlpha: 0 });

      bubbles.forEach((bubble, index) => {
        const delay = index * staggerDelay + gsap.utils.random(-0.05, 0.05);
        const tl = gsap.timeline({ delay });
        tl.to(bubble, {
          scale: 1,
          duration: animationDuration,
          ease: animationEase,
        });
        if (labels[index]) {
          tl.to(
            labels[index],
            {
              y: 0,
              autoAlpha: 1,
              duration: animationDuration,
              ease: "power3.out",
            },
            `-=${animationDuration * 0.9}`,
          );
        }
      });
      return;
    }

    if (!showOverlay) {
      return;
    }

    gsap.killTweensOf([...bubbles, ...labels]);
    gsap.to(labels, {
      y: 24,
      autoAlpha: 0,
      duration: 0.2,
      ease: "power3.in",
    });
    gsap.to(bubbles, {
      scale: 0,
      duration: 0.2,
      ease: "power3.in",
      onComplete: () => {
        gsap.set(overlay, { display: "none" });
        setShowOverlay(false);
      },
    });
  }, [animationDuration, animationEase, open, showOverlay, staggerDelay]);

  useEffect(() => {
    const handleResize = () => {
      if (!open) {
        return;
      }
      const bubbles = bubblesRef.current.filter(Boolean);
      const isDesktop = window.innerWidth >= 900;
      bubbles.forEach((bubble, index) => {
        const item = menuItems[index];
        if (!bubble || !item) {
          return;
        }
        gsap.set(bubble, { rotation: isDesktop ? (item.rotation ?? 0) : 0 });
      });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [menuItems, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    const previousIds = previousItemIdsRef.current;
    previousItemIdsRef.current = items.map((item) => item.id);

    if (!open || !showOverlay) {
      return;
    }

    const newItemId = items.find((item) => !previousIds.includes(item.id))?.id;
    if (!newItemId) {
      return;
    }

    const newItemIndex = menuItems.findIndex(
      (item) => item.kind === "tab" && item.id === newItemId,
    );
    const bubble = newItemIndex >= 0 ? bubblesRef.current[newItemIndex] : null;
    const label = newItemIndex >= 0 ? labelRefs.current[newItemIndex] : null;
    if (!bubble) {
      return;
    }

    gsap.killTweensOf(bubble);
    if (label) {
      gsap.killTweensOf(label);
    }

    const timeline = gsap.timeline({ delay: 0.04 });
    timeline
      .set(bubble, { scale: 0.3, autoAlpha: 1, transformOrigin: "50% 50%" })
      .to(bubble, {
        scale: 1.14,
        duration: 0.28,
        ease: "back.out(2.4)",
      })
      .to(
        bubble,
        {
          scale: 1,
          duration: 0.16,
          ease: "power2.out",
        },
        ">-0.01",
      );

    if (label) {
      timeline
        .set(label, { y: 18, autoAlpha: 0 })
        .to(
          label,
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.22,
            ease: "power3.out",
          },
          0.1,
        );
    }
  }, [items, menuItems, open, showOverlay]);

  if (!showOverlay) {
    return null;
  }

  return (
    <>
      <style>{`
        .bubble-menu-items .pill-list .pill-col:nth-child(4):nth-last-child(2) {
          margin-left: calc(100% / 6);
        }
        .bubble-menu-items .pill-list .pill-col:nth-child(4):last-child {
          margin-left: calc(100% / 3);
        }
        @media (min-width: 900px) {
          .bubble-menu-items .pill-link {
            transform: rotate(var(--item-rot));
          }
          .bubble-menu-items .pill-link:hover {
            transform: rotate(var(--item-rot)) scale(1.06);
            background: var(--hover-bg) !important;
            color: var(--hover-color) !important;
          }
          .bubble-menu-items .pill-link:active {
            transform: rotate(var(--item-rot)) scale(.94);
          }
        }
        @media (max-width: 899px) {
          .bubble-menu-items {
            padding-top: 120px;
            align-items: flex-start;
          }
          .bubble-menu-items .pill-list {
            row-gap: 16px;
          }
          .bubble-menu-items .pill-list .pill-col {
            flex: 0 0 100% !important;
            margin-left: 0 !important;
            overflow: visible;
          }
          .bubble-menu-items .pill-list .pill-col[data-add-item='true'] {
            flex: 0 0 auto !important;
          }
          .bubble-menu-items .pill-link {
            font-size: clamp(1.2rem, 3vw, 4rem);
            padding: clamp(1rem, 2vw, 2rem) 0;
            min-height: 88px !important;
          }
          .bubble-menu-items .pill-link:hover {
            transform: scale(1.06);
            background: var(--hover-bg);
            color: var(--hover-color);
          }
          .bubble-menu-items .pill-link:active {
            transform: scale(.94);
          }
        }
      `}</style>

      <div
        ref={overlayRef}
        className={[
          "bubble-menu-items fixed inset-0 z-[1000] flex items-center justify-center px-3 pointer-events-none",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={style}
        aria-hidden={!open}
      >
        <button
          type="button"
          aria-label="Close search sessions"
          className="absolute inset-0 bg-[#f0f3eb]/62 backdrop-blur-[10px] dark:bg-[#090813]/70 pointer-events-auto"
          onClick={() => onOpenChange(false)}
        />

        <ul
          className={`pill-list relative z-10 list-none m-0 w-full max-w-[1600px] px-6 mx-auto flex flex-wrap gap-x-0 gap-y-1 pointer-events-auto ${
            useCenteredLayout ? "justify-center" : ""
          }`}
          role="menu"
          aria-label="Search sessions"
        >
          {menuItems.map((item, index) => {
            const isAddItem = item.kind === "add";
            const hoverStyles = item.hoverStyles ?? {};

            return (
              <li
                key={item.id}
                role="none"
                data-add-item={isAddItem ? "true" : "false"}
                className={`pill-col flex justify-center items-stretch box-border ${
                  isAddItem
                    ? "w-[160px] [flex:0_0_160px]"
                    : useCenteredLayout
                      ? "w-[min(440px,calc(100vw-4rem))] [flex:0_1_440px]"
                      : "[flex:0_0_calc(100%/3)]"
                }`}
              >
                <div
                  className={`group relative ${isAddItem ? "h-[160px] w-[160px]" : "w-full"}`}
                >
                  <button
                    ref={(element) => {
                      bubblesRef.current[index] = element;
                    }}
                    type="button"
                    role="menuitem"
                    aria-label={item.ariaLabel || item.label}
                    aria-pressed={!isAddItem ? item.active : undefined}
                    onClick={() => {
                      if (isAddItem) {
                        onAdd();
                        window.setTimeout(
                          () => onOpenChange(false),
                          ADD_CLOSE_DELAY_MS,
                        );
                      } else {
                        onSelect(item.id);
                        onOpenChange(false);
                      }
                    }}
                    className={[
                      "pill-link border-0 bg-white text-inherit",
                      "shadow-[0_4px_14px_rgba(0,0,0,0.10)] flex items-center justify-center relative",
                      "transition-[background,color] duration-300 ease-in-out box-border whitespace-nowrap overflow-hidden",
                      isAddItem
                        ? "h-[160px] w-[160px] rounded-full p-0"
                        : "w-full rounded-[999px]",
                      item.kind === "tab" && item.active
                        ? "ring-2 ring-[#73D216]/55 dark:ring-[#8AE234]/45"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      {
                        ["--item-rot"]: `${item.rotation ?? 0}deg`,
                        ["--pill-bg"]:
                          item.kind === "tab" && item.active
                            ? "#eff7d2"
                            : menuBg,
                        ["--pill-color"]:
                          item.kind === "tab" && item.active
                            ? "#21400f"
                            : menuContentColor,
                        ["--hover-bg"]: hoverStyles.bgColor || "#f3f4f6",
                        ["--hover-color"]:
                          hoverStyles.textColor || menuContentColor,
                        background: "var(--pill-bg)",
                        color: "var(--pill-color)",
                        minHeight: isAddItem
                          ? "160px"
                          : "var(--pill-min-h, 160px)",
                        minWidth: isAddItem ? "160px" : undefined,
                        padding: isAddItem ? 0 : "clamp(1.5rem, 3vw, 8rem) 0",
                        fontSize: "clamp(1.5rem, 4vw, 4rem)",
                        fontWeight: 400,
                        lineHeight: 0,
                        willChange: "transform",
                        height: isAddItem ? "160px" : 10,
                      } as CSSProperties
                    }
                  >
                    <span
                      className={`pill-label inline-flex ${
                        isAddItem
                          ? "h-full w-full items-center justify-center"
                          : "flex-col items-center gap-2"
                      }`}
                      style={{
                        willChange: "transform, opacity",
                        minHeight: isAddItem ? "100%" : "1.2em",
                        lineHeight: isAddItem ? 1 : 1.2,
                      }}
                      ref={(element) => {
                        labelRefs.current[index] = element;
                      }}
                    >
                      {isAddItem ? (
                        <Plus size={36} strokeWidth={2.4} />
                      ) : (
                        <>
                          <span className="block truncate px-10">
                            {item.label}
                          </span>
                          <span className="block max-w-[80%] truncate text-[0.22em] font-black uppercase tracking-[0.28em] opacity-55">
                            {item.subtitle || "new search"}
                          </span>
                        </>
                      )}
                    </span>
                  </button>

                  {!isAddItem ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose(item.id);
                      }}
                      className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#14112C]/10 text-[#14112C] opacity-0 shadow-sm transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[#CC5E00] hover:text-white dark:bg-white/10 dark:text-white dark:hover:bg-[#CC5E00]"
                      aria-label={`Close ${item.label}`}
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

const DEFAULT_ROTATIONS = [-8, 8, 6, -7, 9, -6];
const ADD_CLOSE_DELAY_MS = 320;

function getDefaultHoverStyles(active?: boolean) {
  if (active) {
    return {
      bgColor: "#73D216",
      textColor: "#ffffff",
    };
  }

  return {
    bgColor: "#89CFF0",
    textColor: "#102539",
  };
}
