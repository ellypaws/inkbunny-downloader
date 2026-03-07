import { Star } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

type StarBackgroundProps = {
  darkMode: boolean
  motionEnabled: boolean
}

export function StarBackground(props: StarBackgroundProps) {
  const bgRef = useRef<HTMLDivElement | null>(null)
  const requestRef = useRef<number | null>(null)
  const currentY = useRef(0)
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, index) => ({
        id: index,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: 6 + Math.random() * 10,
        reverse: index % 2 === 0,
      })),
    [],
  )

  useEffect(() => {
    const animate = () => {
      if (props.motionEnabled && bgRef.current) {
        const target = window.scrollY
        currentY.current += (target - currentY.current) * 0.05
        bgRef.current.style.transform = `translateY(${-currentY.current * 0.02}px) scale(1.08)`
      }
      requestRef.current = window.requestAnimationFrame(animate)
    }
    requestRef.current = window.requestAnimationFrame(animate)
    return () => {
      if (requestRef.current !== null) {
        window.cancelAnimationFrame(requestRef.current)
      }
    }
  }, [props.motionEnabled])

  return (
    <>
      <div
        ref={bgRef}
        className="fixed inset-0 z-0 pointer-events-none transition-transform duration-500"
        style={{
          background: props.darkMode
            ? 'radial-gradient(circle at 20% 20%, rgba(137,207,240,0.18), transparent 28%), radial-gradient(circle at 80% 15%, rgba(224,187,228,0.18), transparent 22%), linear-gradient(180deg, #17142F 0%, #14112C 32%, #0f1017 100%)'
            : 'radial-gradient(circle at 20% 20%, rgba(137,207,240,0.24), transparent 28%), radial-gradient(circle at 80% 15%, rgba(255,183,178,0.24), transparent 22%), linear-gradient(180deg, #EEF4FB 0%, #DCE8F7 38%, #C8D9EA 100%)',
        }}
      />
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden opacity-55 dark:opacity-80">
        {stars.map((star) => (
          <div key={star.id} className="absolute" style={{ left: star.left, top: star.top }}>
            <Star
              size={star.size}
              className={`fill-current text-[#E0BBE4] dark:text-[#89CFF0] ${
                props.motionEnabled
                  ? star.reverse
                    ? 'animate-spin-slow'
                    : 'animate-spin-reverse-slow'
                  : ''
              }`}
            />
          </div>
        ))}
      </div>
    </>
  )
}
