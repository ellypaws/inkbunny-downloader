import { Check, FolderOpen } from "lucide-react";

import { DownloadPatternInput } from "./DownloadPatternInput";
import { DEFAULT_AVATAR_URL } from "../lib/constants";
import type { AppSettings, SearchParams, SessionInfo } from "../lib/types";

type AccountSidebarProps = {
  session: SessionInfo;
  settings: AppSettings;
  searchParams: SearchParams;
  onPickDirectory: () => void;
  onDownloadPatternCommit: (pattern: string) => void;
  onToggleSaveKeywords: (checked: boolean) => void;
  onLogout: () => void;
};

export function AccountSidebar(props: AccountSidebarProps) {
  const displayName = props.session.hasSession
    ? props.session.username
    : "Not signed in";
  const statusText = props.session.hasSession
    ? props.session.isGuest
      ? "Guest session active"
      : "Signed in"
    : "No session yet";

  return (
    <aside className="xl:sticky xl:top-28">
      <div className="relative rounded-toy-lg bg-gradient-to-b from-[#FF34A5]/75 to-[#00A372]/75 p-1 shadow-pop">
        <div className="flex flex-col gap-5 rounded-[2.75rem] bg-white/78 p-5 backdrop-blur-md dark:bg-[#14112C]/84 sm:p-6">
          <div className="border-b-2 border-dashed border-[#2D2D44]/10 pb-5 dark:border-white/10">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-[#2D2D44]/50 dark:text-white/45">
                Account
              </div>
              {props.session.hasSession ? (
                <button
                  onClick={props.onLogout}
                  className="rounded-full border border-[#2D2D44]/18 px-2.5 py-1 text-[11px] font-semibold text-[#555753] transition-colors hover:border-[#2D2D44]/28 hover:bg-[#f7f8f2]/92 dark:border-white/12 dark:text-white/65 dark:hover:bg-[#1f252b]"
                >
                  Logout
                </button>
              ) : null}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <AvatarImage src={props.session.avatarUrl} alt={displayName} />
              <div className="min-w-0">
                <div className="truncate font-display text-2xl font-black text-[#2A7FA6] dark:text-[#89CFF0]">
                  {displayName}
                </div>
                <div className="mt-1 text-sm font-semibold text-[#2D2D44]/70 dark:text-white/70">
                  {statusText}
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm font-bold text-[#2D2D44]/85 dark:text-gray-200">
            <div className="flex items-start justify-between gap-4">
              <span>Allowed ratings</span>
              <div className="flex max-w-[13rem] flex-wrap justify-end gap-2">
                {getRatingBadges(props.session.ratingsMask).map((rating) => (
                  <span
                    key={rating.label}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${
                      rating.enabled
                        ? "border-[#2A7FA6] text-[#2A7FA6] dark:border-[#89CFF0] dark:text-[#89CFF0]"
                        : "border-[#2D2D44]/18 text-[#2D2D44]/45 dark:border-white/12 dark:text-white/35"
                    }`}
                  >
                    {rating.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={props.onPickDirectory}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3465A4] px-4 py-3.5 text-sm font-black text-white shadow-pop transition-all hover:bg-[#204A87]"
            >
              <FolderOpen size={18} />
              Choose Download Folder
            </button>
            <div className="break-all rounded-2xl bg-white/55 px-4 py-3 text-xs font-bold text-[#2D2D44]/75 dark:bg-[#1A1733]/60 dark:text-white/70">
              {props.settings.downloadDirectory ||
                "No download folder selected yet."}
            </div>
            <DownloadPatternInput
              value={props.settings.downloadPattern}
              onCommit={props.onDownloadPatternCommit}
            />
            <label className="grid grid-cols-[1.1rem_minmax(0,1fr)] items-start gap-3 rounded-2xl border border-[#2D2D44]/10 bg-white/55 px-4 py-3 text-sm font-bold text-[#2D2D44] dark:border-white/10 dark:bg-[#1A1733]/60 dark:text-white">
              <input
                type="checkbox"
                checked={props.searchParams.saveKeywords}
                onChange={(event) =>
                  props.onToggleSaveKeywords(event.target.checked)
                }
                className="mt-0.5 h-[1.05rem] w-[1.05rem] accent-[#73D216]"
              />
              <span className="min-w-0 leading-5">
                Save keywords as text files
              </span>
            </label>
            {!props.session.hasSession ? (
              <div className="flex items-start gap-2 rounded-2xl bg-[#4ED2D6]/18 p-4 text-sm font-semibold text-[#2D2D44]/80 dark:bg-[#FFFACD]/14 dark:text-gray-200">
                <Check className="mt-0.5 shrink-0 text-[#73D216]" size={16} />
                <span>Sign in before searching or downloading.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

function AvatarImage(props: { src: string; alt: string }) {
  return (
    <img
      src={props.src || DEFAULT_AVATAR_URL}
      alt={props.alt}
      onError={(event) => {
        event.currentTarget.src = DEFAULT_AVATAR_URL;
      }}
      className="h-16 w-16 shrink-0 rounded-full border-2 border-white/75 bg-white object-cover shadow-pop"
    />
  );
}

function getRatingBadges(mask: string) {
  const labels = ["General", "Nudity", "Violence", "Sexual", "Strong Violence"];
  return labels.map((label, index) => ({
    label,
    enabled: mask[index] === "1" || (!mask && index === 0),
  }));
}
