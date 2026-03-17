import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

type NewSubmissionsBadgeProps = {
  unreadTotal?: number;
  newUnreadCount?: number;
  unreadActive?: boolean;
  onOpenUnread: () => void;
  className?: string;
};

export function NewSubmissionsBadge({
  unreadTotal = 0,
  newUnreadCount = 0,
  unreadActive = false,
  onOpenUnread,
  className,
}: NewSubmissionsBadgeProps) {
  const burstRef = useRef<HTMLSpanElement | null>(null);
  const countRef = useRef<HTMLSpanElement | null>(null);
  const spinTweenRef = useRef<gsap.core.Timeline | null>(null);
  const burstRotationRef = useRef(0);
  const previousUnreadRef = useRef(unreadTotal);
  const initializedRef = useRef(false);

  useLayoutEffect(() => {
    const burst = burstRef.current;
    const count = countRef.current;
    if (!burst || !count) {
      return;
    }

    const ctx = gsap.context(() => {
      gsap.set(burst, {
        rotate: burstRotationRef.current,
        scale: 1,
        transformOrigin: "50% 50%",
      });
      gsap.set(count, {
        rotate: -burstRotationRef.current,
        transformOrigin: "50% 50%",
      });
    });

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const burst = burstRef.current;
    const count = countRef.current;
    if (!burst || !count) {
      return;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      previousUnreadRef.current = unreadTotal;
      return;
    }

    const previousUnread = previousUnreadRef.current;
    const delta = unreadTotal - previousUnread;
    previousUnreadRef.current = unreadTotal;

    if (delta === 0) {
      return;
    }

    const currentRotation = Number(gsap.getProperty(burst, "rotation"));
    if (Number.isFinite(currentRotation)) {
      burstRotationRef.current = currentRotation;
    }

    spinTweenRef.current?.kill();

    const direction = delta > 0 ? 1 : -1;
    const spinDistance =
      direction *
      Math.min(1080, 240 + Math.max(1, Math.abs(delta)) * 110);
    const targetRotation = burstRotationRef.current + spinDistance;
    burstRotationRef.current = targetRotation;

    spinTweenRef.current = gsap
      .timeline()
      .to(
        burst,
        {
          scale: 1.14,
          duration: 0.16,
          ease: "power2.out",
        },
        0,
      )
      .to(
        burst,
        {
          rotate: targetRotation,
          duration: 0.88,
          ease: "back.out(1.45)",
        },
        0,
      )
      .to(
        count,
        {
          rotate: -targetRotation,
          duration: 0.88,
          ease: "back.out(1.45)",
        },
        0,
      )
      .to(
        burst,
        {
          scale: 1,
          duration: 0.5,
          ease: "elastic.out(1, 0.5)",
        },
        0.18,
      );

    return () => {
      spinTweenRef.current?.kill();
      spinTweenRef.current = null;
    };
  }, [unreadTotal]);

  return (
    <div
      className={`relative z-10 flex flex-col items-center ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={onOpenUnread}
        className={`group relative flex min-w-[148px] cursor-pointer items-start justify-start bg-transparent px-0 pt-1 text-left transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.1] active:scale-[1.1] ${
          unreadActive ? "scale-[1.03]" : ""
        }`}
        title="Open unread submissions"
        aria-pressed={unreadActive}
      >
        <span className="relative block h-[75px] w-[160px] md:h-[80px] md:w-[170px]">
          <span
            className={`absolute left-[28px] top-[26px] drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)] transition-all duration-300 md:left-[34px] md:top-[30px] ${
              unreadActive ? "brightness-110" : ""
            }`}
          >
            <span
              className="flex h-[22px] w-[145px] translate-y-2 rotate-[6deg] items-center bg-gradient-to-r from-[#3e4345] via-[#6d7578] to-[#25282b] pl-[26px] pr-[16px] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] md:h-[24px] md:w-[155px] md:pl-[30px]"
              style={{
                clipPath: "polygon(0 0, 100% 0, 92% 50%, 100% 100%, 0 100%)",
              }}
            >
              <span className="font-sans text-[12px] font-black uppercase tracking-[0.08em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] md:text-[13px] translate-x-2">
                Submissions
              </span>
            </span>
          </span>

          <span
            className={`absolute left-[40px] top-[12px] drop-shadow-[0_4px_4px_rgba(0,0,0,0.45)] transition-all duration-300 md:left-[46px] md:top-[14px] ${
              unreadActive ? "brightness-110" : ""
            }`}
          >
            <span
              className="flex h-[20px] w-[65px] rotate-[-12deg] items-center bg-gradient-to-r from-[#3e4345] via-[#6d7578] to-[#25282b] pl-[20px] pr-[15px] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] md:h-[22px] md:w-[75px] md:pl-[24px]"
              style={{
                clipPath: "polygon(0 0, 100% 0, 88% 50%, 100% 100%, 0 100%)",
              }}
            >
              <span className="font-sans text-[12px] font-black uppercase tracking-[0.1em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] md:text-[13px]">
                New
              </span>
            </span>
          </span>

          <span
            className={`absolute left-0 top-[6px] cursor-pointer drop-shadow-[0_4px_5px_rgba(0,0,0,0.4)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-[1.06] md:top-[8px] ${
              unreadActive ? "scale-110" : ""
            }`}
          >
            <span
              ref={burstRef}
              className="flex h-[56px] w-[56px] items-center justify-center bg-gradient-to-b from-[#875d8a] to-[#6a446d] md:h-[60px] md:w-[60px]"
              style={{
                clipPath:
                  "polygon(50% 0%, 61% 10%, 75% 6%, 80% 20%, 93% 25%, 90% 39%, 100% 50%, 90% 61%, 93% 75%, 80% 80%, 75% 94%, 61% 90%, 50% 100%, 39% 90%, 25% 94%, 20% 80%, 7% 75%, 10% 61%, 0% 50%, 10% 39%, 7% 25%, 20% 20%, 25% 6%, 39% 10%)",
              }}
            >
              <span
                ref={countRef}
                className="font-sans text-[18px] font-black leading-none tracking-tight text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] md:text-[20px]"
              >
                {unreadTotal}
              </span>
            </span>
          </span>

          {newUnreadCount > 0 ? (
            <span className="absolute left-[36px] top-[48px] cursor-pointer drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-[1.08] md:left-[42px] md:top-[52px]">
              <span
                className="flex items-center justify-center rounded-full border-[2px] border-[#fdf0a6]/60 bg-[#ffe975] px-[10px] py-[2px] transition-colors duration-300 md:px-[12px] md:py-[2px]"
              >
                <span className="font-sans text-[12px] font-bold leading-none text-[#4c5361] drop-shadow-[0_1px_1px_rgba(255,255,255,0.2)] md:text-[14px]">
                  {newUnreadCount}
                </span>
              </span>
            </span>
          ) : null}
        </span>
      </button>
    </div>
  );
}
