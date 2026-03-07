import { Moon, Sun, Waves } from 'lucide-react'
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
      className={`static md:fixed mt-5 md:mt-0 md:top-6 left-0 right-0 mx-auto w-[92%] max-w-6xl z-50 rounded-full border border-[#b8beb1]/95 bg-[#f1f2eb]/92 px-6 py-3 backdrop-blur-xl shadow-pop dark:border-[#4a5360]/95 dark:bg-[#252a31]/88 flex justify-between items-center transition-all duration-300 ${
        isHidden ? 'opacity-0 -translate-y-10 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute -top-3 -left-3 text-2xl drop-shadow-md">✨</div>
      <div className="absolute -bottom-3 -right-3 text-2xl drop-shadow-md">🐇</div>
      <div className="flex items-center gap-3">
        <div className="relative flex items-center">
          <img
            src="/inkbunny.png"
            alt="Inkbunny"
            className="h-12 w-12 rounded-full border border-white/70 bg-white object-cover shadow-pop"
          />
          <img
            src={props.session.avatarUrl || DEFAULT_AVATAR_URL}
            alt={props.session.hasSession ? props.session.username : 'signed out'}
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR_URL
            }}
            className="absolute -bottom-1 -right-2 h-7 w-7 rounded-full border border-white bg-white object-cover shadow-md"
          />
        </div>
        <div className="flex flex-col leading-tight">
          <div className="font-display font-bold text-xl md:text-2xl tracking-tight text-[#4E9A06] dark:text-[#8AE234]">
            Inkbunny downloader
          </div>
          <div className="text-xs font-bold text-[#555753] dark:text-white/70">
            {props.session.hasSession ? `Session: ${props.session.username}` : 'Search and queue downloads'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <button
          onClick={props.onToggleMotion}
          className={`p-2 rounded-full text-[#333333] hover:bg-[#dbe4ca] dark:text-white dark:hover:bg-[#2f353a] transition-colors ${
            !props.motionEnabled ? 'opacity-50' : ''
          }`}
          title="Toggle motion"
        >
          <Waves size={22} />
        </button>
        <button
          onClick={props.onToggleDarkMode}
          className="p-2 rounded-full text-[#333333] hover:bg-[#dfe6cf] dark:text-white dark:hover:bg-[#2f353a] transition-colors"
          title="Toggle theme"
        >
          {props.darkMode ? <Sun size={22} /> : <Moon size={22} />}
        </button>
        {props.session.hasSession ? (
          <button
            onClick={props.onLogout}
            className="hidden md:block bg-[#76B900] hover:bg-[#4E9A06] text-white cursor-pointer font-display font-bold px-6 py-2 rounded-full shadow-pop hover:shadow-pop-hover transition-all"
          >
            Logout
          </button>
        ) : (
          <button
            onClick={props.onOpenLogin}
            className="hidden md:block bg-[#3465A4] hover:bg-[#204A87] text-white cursor-pointer font-display font-bold px-6 py-2 rounded-full shadow-pop hover:shadow-pop-hover transition-all"
          >
            Sign In
          </button>
        )}
      </div>
    </nav>
  )
}
