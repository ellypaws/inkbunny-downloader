"use client";

import { Brush, Image, Video } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";

type FolderPopoutProps = {
  images: string[][];
  className?: string;
  folderSize?: { width: number; height: number };
  teaserCardSize?: { width: number; height: number };
  hoverCardSize?: { width: number; height: number };
  hydratedHoverCardSize?: { width: number; height: number };
  hoverTranslateY?: number;
  hoverSpread?: number;
  hoverRotation?: number;
};

type FolderCard =
  | {
      kind: "image";
      sources: string[];
      placeholder: PlaceholderKind;
    }
  | {
      kind: "placeholder";
      placeholder: PlaceholderKind;
    };

type PlaceholderKind = "image" | "brush" | "video";

const PLACEHOLDER_KINDS: PlaceholderKind[] = ["image", "brush", "video"];

export default function FolderPopout({
  images,
  className,
  folderSize = { width: 40, height: 28 },
  teaserCardSize = { width: 22, height: 16 },
  hoverCardSize = { width: 50, height: 36 },
  hydratedHoverCardSize = { width: 140, height: 108 },
  hoverTranslateY = -110,
  hoverSpread = 20,
  hoverRotation = 14,
}: FolderPopoutProps) {
  const [isHovered, setIsHovered] = useState(false);
  const cards = useMemo(() => buildFolderCards(images), [images]);
  const hasHydratedImages = cards.some((card) => card.kind === "image");
  const activeHoverCardSize = hasHydratedImages
    ? hydratedHoverCardSize
    : hoverCardSize;
  const tabWidth = folderSize.width * 0.38;
  const tabHeight = folderSize.height * 0.26;

  return (
    <div
      className={`inline-flex items-center justify-center perspective-[1000px] transform-3d ${className ?? ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        className="relative"
        style={{
          width: folderSize.width,
          height: folderSize.height,
          transformStyle: "preserve-3d",
        }}
      >
        <div className="absolute inset-0 rounded-[5px] bg-gradient-to-b from-amber-400 to-amber-500 shadow-sm dark:from-amber-500 dark:to-amber-600">
          <div
            className="absolute left-0.5 rounded-t-[3px] bg-gradient-to-b from-amber-300 to-amber-400 dark:from-amber-400 dark:to-amber-500"
            style={{
              top: -tabHeight * 0.65,
              width: tabWidth,
              height: tabHeight,
            }}
          />
        </div>

        {cards.map((card, index) => {
          const totalCards = cards.length;
          const baseRotation =
            totalCards === 1
              ? 0
              : totalCards === 2
                ? (index - 0.5) * hoverRotation
                : (index - 1) * hoverRotation;
          const hoverY = hoverTranslateY - (totalCards - 1 - index) * 3;
          const hoverX =
            totalCards === 1
              ? 0
              : totalCards === 2
                ? (index - 0.5) * hoverSpread
                : (index - 1) * hoverSpread;
          const teaseY = -5 - (totalCards - 1 - index) * 1;
          const teaseRotation =
            totalCards === 1
              ? 0
              : totalCards === 2
                ? (index - 0.5) * 3
                : (index - 1) * 3;

          return (
            <motion.div
              key={
                card.kind === "image"
                  ? `${card.sources[0] ?? "image"}-${index}`
                  : `${card.placeholder}-${index}`
              }
              className="absolute left-1/2 top-0.5 origin-bottom overflow-hidden rounded-[4px] border border-black/10 bg-white shadow-sm shadow-black/10 ring-1 ring-black/8 dark:border-white/10 dark:bg-neutral-900 dark:shadow-white/8 dark:ring-white/8"
              animate={{
                x: `calc(-50% + ${isHovered ? hoverX : 0}px)`,
                y: isHovered ? hoverY : teaseY,
                rotate: isHovered ? baseRotation : teaseRotation,
                width: isHovered
                  ? activeHoverCardSize.width
                  : teaserCardSize.width,
                height: isHovered
                  ? activeHoverCardSize.height
                  : teaserCardSize.height,
              }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 24,
                delay: index * 0.03,
              }}
              style={{
                zIndex: 10 + index,
              }}
            >
              <FolderCardFace card={card} />
            </motion.div>
          );
        })}

        <motion.div
          className="absolute inset-x-0 bottom-0 h-[85%] origin-bottom rounded-[5px] bg-gradient-to-b from-amber-300 to-amber-400 shadow-sm dark:from-amber-400 dark:to-amber-500"
          animate={{
            rotateX: isHovered ? -45 : -25,
            scaleY: isHovered ? 0.8 : 1,
          }}
          transition={{
            type: "spring",
            stiffness: 380,
            damping: 24,
          }}
          style={{
            transformStyle: "preserve-3d",
            zIndex: 20,
          }}
        >
          <div className="absolute left-1 right-1 top-1 h-px bg-amber-200/50 dark:bg-amber-300/50" />
        </motion.div>
      </motion.div>
    </div>
  );
}

function FolderCardFace(props: { card: FolderCard }) {
  const [sourceIndex, setSourceIndex] = useState(0);

  if (props.card.kind === "image") {
    const source = props.card.sources[sourceIndex];
    if (source) {
      return (
        <img
          src={source}
          alt=""
          aria-hidden="true"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setSourceIndex((current) => current + 1)}
          className="h-full w-full object-cover"
        />
      );
    }
  }

  if (props.card.kind === "image" && props.card.sources.length > 0) {
    return <FolderPlaceholderCard placeholder={props.card.placeholder} />;
  }

  return <FolderPlaceholderCard placeholder={props.card.placeholder} />;
}

function FolderPlaceholderCard(props: { placeholder: PlaceholderKind }) {
  const icon =
    props.placeholder === "image" ? (
      <Image size={14} strokeWidth={2.2} />
    ) : props.placeholder === "brush" ? (
      <Brush size={14} strokeWidth={2.2} />
    ) : (
      <Video size={14} strokeWidth={2.2} />
    );

  return (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(155deg,#f8fafc,#e5edf5)] text-[#5A6D7E] dark:bg-[linear-gradient(155deg,#151a24,#242c39)] dark:text-[#C4D0DD]">
      {icon}
    </div>
  );
}

function buildFolderCards(images: string[][]) {
  const uniqueImages = dedupeImageSources(images).slice(0, 3);
  const cards: FolderCard[] = uniqueImages.map((sources, index) => ({
    kind: "image",
    sources,
    placeholder: PLACEHOLDER_KINDS[index] ?? "image",
  }));

  for (let index = cards.length; index < 3; index += 1) {
    cards.push({
      kind: "placeholder",
      placeholder: PLACEHOLDER_KINDS[index] ?? "image",
    });
  }

  return cards;
}

function dedupeImageSources(images: string[][]) {
  const seen = new Set<string>();
  const unique: string[][] = [];

  for (const sources of images) {
    const normalized = [...new Set(sources.filter(Boolean))];
    if (normalized.length === 0) {
      continue;
    }
    const key = normalized.join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}
