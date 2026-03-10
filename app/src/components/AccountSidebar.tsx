import { Check, Copy, FolderOpen, Smartphone, X } from "lucide-react";
import { useState } from "react";

import { DownloadPatternInput } from "./DownloadPatternInput";
import { DEFAULT_AVATAR_URL } from "../lib/constants";
import type {
  AppSettings,
  BackendCapabilities,
  RemoteAccessInfo,
  SearchParams,
  SessionInfo,
} from "../lib/types";

type AccountSidebarProps = {
  session: SessionInfo;
  settings: AppSettings;
  capabilities: BackendCapabilities;
  remoteAccessInfo: RemoteAccessInfo | null;
  remoteAccessLoading: boolean;
  searchParams: SearchParams;
  onNotify: (toast: {
    level: "success" | "error";
    message: string;
    dedupeKey?: string;
  }) => void;
  onEnableRemoteAccess: () => void;
  onDisableRemoteAccess: () => void;
  onSelectRemoteAccessHost: (host: string) => void;
  onPickDirectory: () => void;
  onDownloadPatternCommit: (pattern: string) => void;
  onToggleSaveKeywords: (checked: boolean) => void;
  onLogout: () => void;
};

export function AccountSidebar(props: AccountSidebarProps) {
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteHostsOpen, setRemoteHostsOpen] = useState(false);
  const displayName = props.session.hasSession
    ? props.session.username
    : "Not signed in";
  const statusText = props.session.hasSession
    ? props.session.isGuest
      ? "Guest session active"
      : "Signed in"
    : "No session yet";

  async function handleCopyPairingLink() {
    const pairingUrl = props.remoteAccessInfo?.pairingUrl || "";
    const copied = await copyText(pairingUrl);
    if (copied) {
      props.onNotify({
        level: "success",
        message: "Remote access link copied.",
        dedupeKey: "remote-link-copied",
      });
      return;
    }
    props.onNotify({
      level: "error",
      message: "Could not copy the remote access link.",
      dedupeKey: "remote-link-copy-error",
    });
  }

  return (
    <aside className="xl:sticky xl:top-28">
      <div className="relative rounded-toy-lg bg-gradient-to-b from-[#FF34A5]/75 to-[#00A372]/75 p-1 shadow-pop">
        <div className="flex flex-col gap-5 rounded-[2.75rem] bg-white/78 p-5 backdrop-blur-md dark:bg-[#14112C]/84 sm:p-6">
          <div className="border-b-2 border-dashed border-[#2D2D44]/10 pb-5 dark:border-white/10">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase text-[#2D2D44]/50 dark:text-white/45">
                Account
              </div>
              <div className="flex items-center gap-2">
                {props.capabilities.remoteAccessHost ? (
                  <div
                    className="relative"
                    onMouseLeave={() => setRemoteHostsOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!props.remoteAccessInfo?.enabled) {
                          props.onEnableRemoteAccess();
                          setRemoteOpen(true);
                          setRemoteHostsOpen(true);
                          return;
                        }
                        setRemoteOpen(true);
                        setRemoteHostsOpen((current) => !current);
                      }}
                      className="cursor-pointer rounded-full border border-[#2D2D44]/18 p-2 text-[#555753] transition-colors hover:border-[#2D2D44]/28 hover:bg-[#f7f8f2]/92 dark:border-white/12 dark:text-white/65 dark:hover:bg-[#1f252b]"
                      aria-label="remote pairing"
                      title="remote pairing"
                    >
                      <Smartphone size={16} />
                    </button>
                    {remoteHostsOpen && (props.remoteAccessInfo?.availableHosts?.length ?? 0) > 0 ? (
                      <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-[#2D2D44]/10 bg-white/95 p-3 text-sm shadow-pop backdrop-blur-md dark:border-white/10 dark:bg-[#14112C]/95">
                        <div className="mb-2 pl-2 text-xs font-semibold text-[#2D2D44]/55 dark:text-white/45">
                          Choose an address
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {props.remoteAccessInfo?.availableHosts?.map((host) => (
                            <button
                              key={host}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                props.onSelectRemoteAccessHost(host);
                                setRemoteHostsOpen(false);
                              }}
                              className={`cursor-pointer break-all rounded-xl px-3 py-2 text-left text-[13px] font-semibold leading-5 transition-colors ${
                                props.remoteAccessInfo?.selectedHost === host
                                  ? "bg-[#cfeeff] text-[#0f5d7a] dark:bg-[#0f4156] dark:text-[#d6f6ff]"
                                  : "text-[#2D2D44]/80 hover:bg-[#d9edff] hover:text-[#0f5d7a] dark:text-white/75 dark:hover:bg-[#1a3950] dark:hover:text-[#d6f6ff]"
                              }`}
                            >
                              {host}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {props.session.hasSession ? (
                  <button
                    onClick={props.onLogout}
                    className="cursor-pointer rounded-full border border-[#2D2D44]/18 px-2.5 py-1 text-[11px] font-semibold text-[#555753] transition-colors hover:border-[#2D2D44]/28 hover:bg-[#f7f8f2]/92 dark:border-white/12 dark:text-white/65 dark:hover:bg-[#1f252b]"
                  >
                    Logout
                  </button>
                ) : null}
              </div>
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
            {props.capabilities.nativeDialogs ? (
              <button
                onClick={props.onPickDirectory}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#3465A4] px-4 py-3.5 text-sm font-black text-white shadow-pop transition-all hover:bg-[#204A87]"
              >
                <FolderOpen size={18} />
                Choose Download Folder
              </button>
            ) : (
              <div className="rounded-2xl border border-[#2D2D44]/10 bg-white/55 px-4 py-3 text-sm font-bold text-[#2D2D44]/70 dark:border-white/10 dark:bg-[#1A1733]/60 dark:text-white/70">
                Download folder changes are only available on desktop.
              </div>
            )}
            <DownloadPatternInput
              downloadDirectory={props.settings.downloadDirectory}
              value={props.settings.downloadPattern}
              onCommit={props.onDownloadPatternCommit}
            />
            {remoteOpen ? (
              <div className="rounded-2xl border border-[#2D2D44]/10 bg-white/55 px-4 py-3 text-sm text-[#2D2D44] dark:border-white/10 dark:bg-[#1A1733]/60 dark:text-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">
                    {props.remoteAccessInfo?.enabled ? "Scan to Pair" : "Starting remote access..."}
                  </div>
                  <div className="flex items-center gap-2">
                    {props.remoteAccessInfo?.enabled ? (
                      <button
                        type="button"
                        onClick={() => {
                          props.onDisableRemoteAccess();
                          setRemoteHostsOpen(false);
                        }}
                        className="cursor-pointer rounded-full border border-[#2D2D44]/18 px-2 py-1 text-[11px] font-semibold text-[#555753] transition-colors hover:border-[#2D2D44]/28 hover:bg-[#f7f8f2]/92 dark:border-white/12 dark:text-white/65 dark:hover:bg-[#1f252b]"
                      >
                        stop
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setRemoteOpen(false);
                        setRemoteHostsOpen(false);
                      }}
                      className="cursor-pointer rounded-full border border-[#2D2D44]/18 p-1.5 text-[#555753] transition-colors hover:border-[#2D2D44]/28 hover:bg-[#f7f8f2]/92 dark:border-white/12 dark:text-white/65 dark:hover:bg-[#1f252b]"
                      aria-label="close remote pairing"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                {props.remoteAccessInfo?.enabled && props.remoteAccessInfo.qrCodeDataUrl ? (
                  <>
                    <img
                      src={props.remoteAccessInfo.qrCodeDataUrl}
                      alt="remote pairing qr"
                      className="mx-auto mt-3 h-44 w-44 rounded-2xl border border-[#2D2D44]/10 bg-white p-3 shadow-sm"
                    />
                    <div className="mt-3 break-all text-[13px] font-semibold text-[#2A7FA6] dark:text-[#89CFF0]">
                      {props.remoteAccessInfo.pairingUrl}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopyPairingLink()}
                      className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#2A7FA6]/25 bg-[#f4fbff] px-3 py-1.5 text-[11px] font-black text-[#145676] transition-colors hover:border-[#2A7FA6]/45 hover:bg-[#d9edff] hover:text-[#0f5d7a] dark:border-[#89CFF0]/25 dark:bg-[#101f2a] dark:text-[#c7efff] dark:hover:bg-[#1a3950] dark:hover:text-[#e0f7ff]"
                    >
                      <Copy size={12} />
                      Copy Link
                    </button>
                  </>
                ) : (
                  <div className="mt-3 text-sm font-medium text-[#2D2D44]/70 dark:text-white/70">
                    {props.remoteAccessLoading ? "waiting for the local server..." : "tap the phone icon to start remote access."}
                  </div>
                )}
              </div>
            ) : null}
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

async function copyText(value: string) {
  if (!value) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
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
