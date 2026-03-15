import { Star } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

type StarBackgroundProps = {
  darkMode: boolean;
  motionEnabled: boolean;
};

export function StarBackground(props: StarBackgroundProps) {
  const bgRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const currentY = useRef(0);
  const overscan = "10vh";
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, index) => ({
        id: index,
        left: `${seededUnit(index, 1) * 100}%`,
        top: `${seededUnit(index, 2) * 100}%`,
        size: 6 + seededUnit(index, 3) * 10,
        reverse: index % 2 === 0,
      })),
    [],
  );

  useEffect(() => {
    const animate = () => {
      if (props.motionEnabled && bgRef.current) {
        const target = window.scrollY;
        currentY.current += (target - currentY.current) * 0.05;
        bgRef.current.style.transform = `translateY(${-currentY.current * 0.02}px) scale(1.08)`;
      }
      requestRef.current = window.requestAnimationFrame(animate);
    };
    requestRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (requestRef.current !== null) {
        window.cancelAnimationFrame(requestRef.current);
      }
    };
  }, [props.motionEnabled]);

  return (
    <>
      <div
        ref={bgRef}
        className="fixed z-0 pointer-events-none transition-transform duration-500"
        style={{ inset: `-${overscan}` }}
      >
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${props.darkMode ? "opacity-0" : "opacity-100"}`}
          style={{
            backgroundImage:
              "var(--theme-image-overlay), url(/3404_Lando_1275330202.lando_nobear.jpg)",
            backgroundPosition: "center center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }}
        />
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${props.darkMode ? "opacity-100" : "opacity-0"}`}
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(12, 12, 20, 0.44) 0%, rgba(20, 17, 44, 0.68) 42%, rgba(8, 8, 12, 0.84) 100%), url(/1159286_Lando_1080.jpg)",
            backgroundPosition: "center center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }}
        />
      </div>
      <div
        className={`fixed z-[1] pointer-events-none overflow-hidden transition-opacity duration-500 ${props.darkMode ? "opacity-80" : "opacity-22"}`}
        style={{ inset: `-${overscan}` }}
      >
        {stars.map((star) => (
          <div
            key={star.id}
            className="absolute"
            style={{ left: star.left, top: star.top }}
          >
            <Star
              size={star.size}
              className={`fill-current ${props.darkMode ? "text-[var(--theme-info-strong)]" : "text-[var(--theme-accent)]"} ${
                props.motionEnabled
                  ? star.reverse
                    ? "animate-spin-slow"
                    : "animate-spin-reverse-slow"
                  : ""
              }`}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function seededUnit(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
