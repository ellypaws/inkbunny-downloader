import { Moon, Sparkles, Sun, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DEFAULT_AVATAR_URL } from '../lib/constants'
import type { SessionInfo } from '../lib/types'

type NavigationPillProps = {
  darkMode: boolean
  motionEnabled: boolean
  session: SessionInfo
  onToggleDarkMode: () => void
  onToggleMotion: () => void
  onOpenLogin: () => void
  onLogout: () => void
}

export function NavigationPill(props: NavigationPillProps) {
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    const onScroll = () => setIsHidden(window.scrollY > 220)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`static md:fixed mt-5 md:mt-0 md:top-6 left-0 right-0 mx-auto w-[92%] max-w-6xl z-50 bg-white/85 dark:bg-[#1A1733]/82 backdrop-blur-xl rounded-full border-2 border-[#E0BBE4]/70 dark:border-[#89CFF0]/60 shadow-pop px-6 py-3 flex justify-between items-center transition-all duration-300 ${
        isHidden ? 'opacity-0 -translate-y-10 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute -top-3 -left-3 text-2xl drop-shadow-md">✨</div>
      <div className="absolute -bottom-3 -right-3 text-2xl drop-shadow-md">🐇</div>
      <div className="flex items-center gap-3">
        <div className="relative flex items-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFB7B2] via-[#E0BBE4] to-[#73D216] border-2 border-white/70 shadow-pop flex items-center justify-center text-white">
            <Sparkles size={22} />
          </div>
          <img
            src={props.session.avatarUrl || DEFAULT_AVATAR_URL}
            alt={props.session.hasSession ? props.session.username : 'signed out'}
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR_URL
            }}
            className="absolute -bottom-1 -right-2 h-7 w-7 rounded-full border-2 border-white bg-white object-cover shadow-md"
          />
        </div>
        <div className="flex flex-col leading-tight">
          <div className="font-display font-bold text-xl md:text-2xl tracking-tight text-[#2A7FA6] dark:text-[#FFB7B2]">
            Inkbunny downloader
          </div>
          <div className="text-xs font-bold text-[#2D2D44]/65 dark:text-white/70">
            {props.session.hasSession ? `Session: ${props.session.username}` : 'Search and queue downloads'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <button
          onClick={props.onToggleMotion}
          className={`p-2 rounded-full text-[#2D2D44] dark:text-white hover:bg-[#B5EAD7]/30 transition-colors ${
            !props.motionEnabled ? 'opacity-50' : ''
          }`}
          title="Toggle motion"
        >
          <Waves size={22} />
        </button>
        <button
          onClick={props.onToggleDarkMode}
          className="p-2 rounded-full text-[#2D2D44] dark:text-white hover:bg-[#FFFACD]/30 transition-colors"
          title="Toggle theme"
        >
          {props.darkMode ? <Sun size={22} /> : <Moon size={22} />}
        </button>
        {props.session.hasSession ? (
          <button
            onClick={props.onLogout}
            className="hidden md:block bg-[#73D216] hover:bg-[#4E9A06] text-white cursor-pointer font-display font-bold px-6 py-2 rounded-full shadow-pop hover:shadow-pop-hover transition-all"
          >
            {`Logout ${props.session.username}`}
          </button>
        ) : (
          <button
            onClick={props.onOpenLogin}
            className="hidden md:block bg-[#FFB7B2] hover:bg-[#CC5E00] text-white cursor-pointer font-display font-bold px-6 py-2 rounded-full shadow-pop hover:shadow-pop-hover transition-all"
          >
            Sign In
          </button>
        )}
      </div>
    </nav>
  )
}
