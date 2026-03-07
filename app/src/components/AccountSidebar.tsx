import { Check, FolderOpen } from "lucide-react";

import { DEFAULT_AVATAR_URL } from "../lib/constants";
import type { AppSettings, SearchParams, SessionInfo } from "../lib/types";

type AccountSidebarProps = {
  session: SessionInfo;
  settings: AppSettings;
  searchParams: SearchParams;
  onPickDirectory: () => void;
  onToggleSaveKeywords: (checked: boolean) => void;
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
      <div className="relative rounded-toy-lg bg-gradient-to-b from-[#8fbb29] to-[#4E9A06] p-px shadow-pop dark:from-[#3c4652] dark:to-[#20242a]">
        <div className="flex flex-col gap-5 rounded-[2.75rem] bg-[#eff1ea]/94 p-5 backdrop-blur-md dark:bg-[#252a31]/92 sm:p-6">
          <div className="border-b border-dashed border-[#c2c7bc] pb-5 dark:border-[#4a5360]">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-[#2D2D44]/50 dark:text-white/45">
              Account
            </div>
            <div className="mt-4 flex items-center gap-4">
              <AvatarImage src={props.session.avatarUrl} alt={displayName} />
              <div className="min-w-0">
                <div className="truncate font-display text-2xl font-black text-[#4E9A06] dark:text-[#8AE234]">
                  {displayName}
                </div>
                <div className="mt-1 text-sm font-semibold text-[#555753] dark:text-white/70">
                  {statusText}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-sm font-bold text-[#333333] dark:text-gray-200">
            <div className="flex items-start justify-between gap-4">
              <span>Allowed ratings</span>
              <div className="flex max-w-52 flex-wrap justify-end gap-2">
                {getRatingBadges(props.session.ratingsMask).map((rating) => (
                  <span
                    key={rating.label}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${
                      rating.enabled
                        ? "border-[#76B900] text-[#4E9A06] dark:border-[#8AE234] dark:text-[#8AE234]"
                        : "border-[#c2c7bc] text-[#555753] dark:border-[#4a5360] dark:text-white/35"
                    }`}
                  >
                    {rating.label}
                  </span>
                ))}
              </div>
            </div>
            <SummaryRow
              label="Results per page"
              value={String(props.searchParams.perPage)}
            />
            <SummaryRow
              label="Maximum files"
              value={
                props.searchParams.maxDownloads > 0
                  ? String(props.searchParams.maxDownloads)
                  : "No limit"
              }
            />
            <SummaryRow
              label="Download keywords"
              value={
                props.searchParams.saveKeywords ? "Save sidecar files" : "Off"
              }
            />
          </div>

          <div className="space-y-3">
            <button
              onClick={props.onPickDirectory}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3465A4] px-4 py-3.5 text-sm font-black text-white shadow-pop transition-all hover:bg-[#204A87]"
            >
              <FolderOpen size={18} />
              Choose Download Folder
            </button>
            <div className="break-all rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/92 px-4 py-3 text-xs font-bold text-[#555753] dark:border-[#4a5360] dark:bg-[#1f252b]/88 dark:text-white/70">
              {props.settings.downloadDirectory ||
                "No download folder selected yet."}
            </div>
            <label className="grid grid-cols-[1.1rem_minmax(0,1fr)] items-start gap-3 rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/92 px-4 py-3 text-sm font-bold text-[#333333] dark:border-[#4a5360] dark:bg-[#1f252b]/88 dark:text-white">
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
              <div className="flex items-start gap-2 rounded-2xl border border-[#c2c7bc] bg-[#f7f8f2]/92 p-4 text-sm font-semibold text-[#555753] dark:border-[#4a5360] dark:bg-[#1f252b]/88 dark:text-gray-200">
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

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span>{props.label}</span>
      <span className="text-right">{props.value}</span>
    </div>
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
      className="h-16 w-16 shrink-0 rounded-full border border-white/75 bg-white object-cover shadow-pop"
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
