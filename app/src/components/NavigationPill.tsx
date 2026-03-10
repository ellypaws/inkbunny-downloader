import { Moon, PanelsTopLeft, Sun, Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { NewSubmissionsBadge } from "./NewSubmissionsBadge";
import { DEFAULT_AVATAR_URL } from "../lib/constants";
import type { SessionInfo } from "../lib/types";

type NavigationPillProps = {
  darkMode: boolean;
  motionEnabled: boolean;
  tabsOpen: boolean;
  session: SessionInfo;
  unreadTotal: number;
  newUnreadCount: number;
  unreadActive: boolean;
  onToggleDarkMode: () => void;
  onToggleMotion: () => void;
  onToggleTabs: () => void;
  onOpenUnread: () => void;
  onOpenLogin: () => void;
  onLogout: () => void;
};

export function NavigationPill(props: NavigationPillProps) {
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      const scrollingUp = currentScrollY < previousScrollY;

      if (currentScrollY <= 120) {
        setIsHidden(false);
      } else if (scrollingUp) {
        setIsHidden(false);
      } else if (currentScrollY > previousScrollY + 8) {
        setIsHidden(true);
      }

      lastScrollYRef.current = currentScrollY;
    };

    lastScrollYRef.current = window.scrollY;
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      data-navigation-pill="true"
      className={`theme-panel static left-0 right-0 z-50 mx-auto mt-3 flex w-[92%] max-w-6xl items-center justify-between gap-2 overflow-visible rounded-full border px-3 py-2.5 shadow-pop backdrop-blur-xl transition-all duration-500 ease-out sm:mt-4 sm:gap-3 sm:px-6 sm:py-3 md:fixed md:top-6 md:mt-0 md:gap-0 md:px-6 md:py-3 ${
        isHidden
          ? "opacity-0 -translate-y-6 pointer-events-none scale-[0.985]"
          : "opacity-100 translate-y-0 scale-100"
      }`}
    >
      <div className="absolute -top-3 -left-3 text-2xl drop-shadow-md">✨</div>
      <div className="absolute -bottom-3 -right-3 text-2xl drop-shadow-md">
        🐇
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={props.session.avatarUrl || DEFAULT_AVATAR_URL}
          alt={props.session.hasSession ? props.session.username : "signed out"}
          onError={(event) => {
            event.currentTarget.src = DEFAULT_AVATAR_URL;
          }}
          className="h-10 w-10 shrink-0 rounded-full border border-white bg-white object-cover shadow-pop md:hidden"
        />
        <div className="relative hidden items-center md:flex">
          <img
            src="/inkbunny.png"
            alt="Inkbunny"
            className="h-12 w-12 rounded-full border border-white/70 bg-white object-cover shadow-pop"
          />
          <img
            src={props.session.avatarUrl || DEFAULT_AVATAR_URL}
            alt={
              props.session.hasSession ? props.session.username : "signed out"
            }
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR_URL;
            }}
            className="absolute -bottom-1 -right-2 h-7 w-7 rounded-full border border-white bg-white object-cover shadow-md"
          />
        </div>
        <div className="hidden min-w-0 flex-1 flex-col leading-tight md:flex">
          <div className="truncate font-display text-lg font-bold tracking-tight text-[var(--theme-accent-strong)] sm:text-xl md:text-2xl">
            Inkbunny downloader
          </div>
          <div className="theme-muted truncate text-xs font-bold">
            {props.session.hasSession
              ? `Session: ${props.session.username}`
              : "Search and queue downloads"}
          </div>
        </div>
      </div>
      <div
        className={`relative ml-auto flex items-center gap-1.5 h-12 sm:gap-3 md:h-12 md:gap-4 ${
          props.session.hasSession && !props.session.isGuest
            ? "md:ml-[140px]"
            : ""
        }`}
      >
        {props.session.hasSession && !props.session.isGuest ? (
          <>
            <NewSubmissionsBadge
              unreadTotal={props.unreadTotal}
              newUnreadCount={props.newUnreadCount}
              unreadActive={props.unreadActive}
              onOpenUnread={props.onOpenUnread}
              className="-ml-2 origin-left scale-[0.62] sm:scale-70 md:hidden"
            />
            <NewSubmissionsBadge
              unreadTotal={props.unreadTotal}
              newUnreadCount={props.newUnreadCount}
              unreadActive={props.unreadActive}
              onOpenUnread={props.onOpenUnread}
              className="absolute right-[calc(100%-25.35rem)] top-0 hidden scale-70 md:block"
            />
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-2 sm:gap-3 md:ml-0 md:gap-4">
          <button
            onClick={props.onToggleTabs}
            className={`theme-title theme-hover rounded-full p-2 transition-colors ${
              props.tabsOpen ? "theme-panel-soft" : ""
            }`}
            title="Toggle tabs"
            aria-pressed={props.tabsOpen}
            data-tour-anchor="tabs-toggle"
          >
            <PanelsTopLeft size={22} />
          </button>
          <button
            onClick={props.onToggleMotion}
            className={`theme-title theme-hover rounded-full p-2 transition-colors ${
              !props.motionEnabled ? "opacity-50" : ""
            }`}
            title="Toggle motion"
          >
            <Waves size={22} />
          </button>
          <button
            onClick={props.onToggleDarkMode}
            className="theme-title theme-hover rounded-full p-2 transition-colors"
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
      </div>
    </nav>
  );
}
