import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";

const MAX_OVERFLOW = 50;

type ElasticSliderProps = {
  defaultValue?: number;
  value?: number;
  onChange?: (value: number) => void;
  valueFormatter?: (value: number) => string;
  startingValue?: number;
  maxValue?: number;
  className?: string;
  isStepped?: boolean;
  stepSize?: number;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export default function ElasticSlider({
  defaultValue = 50,
  value,
  onChange,
  valueFormatter,
  startingValue = 0,
  maxValue = 100,
  className = "",
  isStepped = false,
  stepSize = 1,
  leftIcon = <>-</>,
  rightIcon = <>+</>,
}: ElasticSliderProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<"left" | "middle" | "right">("middle");
  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);
  const currentValue = value ?? internalValue;

  useEffect(() => {
    if (value === undefined) {
      setInternalValue(defaultValue);
    }
  }, [defaultValue, value]);

  useMotionValueEvent(clientX, "change", (latest) => {
    if (!sliderRef.current) {
      return;
    }

    const { left, right } = sliderRef.current.getBoundingClientRect();
    let nextOverflow = 0;
    if (latest < left) {
      setRegion("left");
      nextOverflow = left - latest;
    } else if (latest > right) {
      setRegion("right");
      nextOverflow = latest - right;
    } else {
      setRegion("middle");
    }
    overflow.jump(decay(nextOverflow, MAX_OVERFLOW));
  });

  function commitValue(nextValue: number) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  }

  function normalizeValue(rawValue: number) {
    let nextValue = rawValue;
    if (isStepped) {
      nextValue = Math.round(nextValue / stepSize) * stepSize;
    }
    return Math.min(Math.max(nextValue, startingValue), maxValue);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.buttons <= 0 || !sliderRef.current) {
      return;
    }

    const { left, width } = sliderRef.current.getBoundingClientRect();
    const nextValue = normalizeValue(
      startingValue + ((event.clientX - left) / width) * (maxValue - startingValue),
    );
    commitValue(nextValue);
    clientX.jump(event.clientX);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    handlePointerMove(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp() {
    animate(overflow, 0, { type: "spring", bounce: 0.5 });
  }

  function getRangePercentage() {
    const totalRange = maxValue - startingValue;
    if (totalRange === 0) {
      return 0;
    }
    return ((currentValue - startingValue) / totalRange) * 100;
  }

  return (
    <div className={`relative flex w-48 flex-col items-center justify-center gap-4 ${className}`}>
      <motion.div
        onHoverStart={() => animate(scale, 1.2)}
        onHoverEnd={() => animate(scale, 1)}
        onTouchStart={() => animate(scale, 1.2)}
        onTouchEnd={() => animate(scale, 1)}
        style={{
          scale,
          opacity: useTransform(scale, [1, 1.2], [0.7, 1]),
        }}
        className="flex w-full touch-none select-none items-center justify-center gap-4"
      >
        <motion.div
          animate={{
            scale: region === "left" ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 },
          }}
          style={{
            x: useTransform(() =>
              region === "left" ? -overflow.get() / scale.get() : 0,
            ),
          }}
        >
          {leftIcon}
        </motion.div>

        <div
          ref={sliderRef}
          className="relative flex w-full max-w-xs flex-grow cursor-grab touch-none select-none items-center py-4"
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <motion.div
            style={{
              scaleX: useTransform(() => {
                if (!sliderRef.current) {
                  return 1;
                }
                const { width } = sliderRef.current.getBoundingClientRect();
                return 1 + overflow.get() / width;
              }),
              scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
              transformOrigin: useTransform(() => {
                if (!sliderRef.current) {
                  return "center";
                }
                const { left, width } = sliderRef.current.getBoundingClientRect();
                return clientX.get() < left + width / 2 ? "right" : "left";
              }),
              height: useTransform(scale, [1, 1.2], [6, 12]),
              marginTop: useTransform(scale, [1, 1.2], [0, -3]),
              marginBottom: useTransform(scale, [1, 1.2], [0, -3]),
            }}
            className="flex flex-grow"
          >
            <div className="relative h-full flex-grow overflow-hidden rounded-full bg-gray-300/80 dark:bg-white/20">
              <div
                className="absolute h-full rounded-full bg-[#2A7FA6]"
                style={{ width: `${getRangePercentage()}%` }}
              />
            </div>
          </motion.div>
        </div>

        <motion.div
          animate={{
            scale: region === "right" ? [1, 1.4, 1] : 1,
            transition: { duration: 0.25 },
          }}
          style={{
            x: useTransform(() =>
              region === "right" ? overflow.get() / scale.get() : 0,
            ),
          }}
        >
          {rightIcon}
        </motion.div>
      </motion.div>

      <p className="absolute -translate-y-4 text-xs font-medium tracking-wide text-[#2D2D44]/70 dark:text-white/70">
        {valueFormatter ? valueFormatter(currentValue) : Math.round(currentValue)}
      </p>
    </div>
  );
}

function decay(value: number, max: number) {
  if (max === 0) {
    return 0;
  }
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}
