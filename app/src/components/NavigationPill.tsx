import { Moon, PanelsTopLeft, Sun, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DEFAULT_AVATAR_URL } from '../lib/constants'
import type { SessionInfo } from '../lib/types'

type NavigationPillProps = {
  darkMode: boolean
  motionEnabled: boolean
  tabsOpen: boolean
  session: SessionInfo
  onToggleDarkMode: () => void
  onToggleMotion: () => void
  onToggleTabs: () => void
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
      className={`theme-panel static md:fixed mt-5 md:mt-0 md:top-6 left-0 right-0 mx-auto flex w-[92%] max-w-6xl items-center justify-between rounded-full border px-6 py-3 backdrop-blur-xl shadow-pop transition-all duration-300 z-50 ${
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
          <div className="font-display font-bold text-xl md:text-2xl tracking-tight text-[var(--theme-accent-strong)]">
            Inkbunny downloader
          </div>
          <div className="theme-muted text-xs font-bold">
            {props.session.hasSession ? `Session: ${props.session.username}` : 'Search and queue downloads'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <button
          onClick={props.onToggleTabs}
          className={`theme-title theme-hover p-2 rounded-full transition-colors ${
            props.tabsOpen ? 'theme-panel-soft' : ''
          }`}
          title="Toggle tabs"
          aria-pressed={props.tabsOpen}
        >
          <PanelsTopLeft size={22} />
        </button>
        <button
          onClick={props.onToggleMotion}
          className={`theme-title theme-hover p-2 rounded-full transition-colors ${
            !props.motionEnabled ? 'opacity-50' : ''
          }`}
          title="Toggle motion"
        >
          <Waves size={22} />
        </button>
        <button
          onClick={props.onToggleDarkMode}
          className="theme-title theme-hover p-2 rounded-full transition-colors"
          title="Toggle theme"
        >
          {props.darkMode ? <Sun size={22} /> : <Moon size={22} />}
        </button>
        {props.session.hasSession ? (
          <button
            onClick={props.onLogout}
            className="theme-button-accent hidden cursor-pointer rounded-full border-b-8 px-6 py-2 font-display font-bold shadow-pop transition-all hover:shadow-pop-hover md:block"
          >
            Logout
          </button>
        ) : (
          <button
            onClick={props.onOpenLogin}
            className="theme-button-info hidden cursor-pointer rounded-full border-b-8 px-6 py-2 font-display font-bold shadow-pop transition-all hover:shadow-pop-hover md:block"
          >
            Sign In
          </button>
        )}
      </div>
    </nav>
  )
}
