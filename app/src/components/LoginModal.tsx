import { LoaderCircle, LogIn, UserRound, X } from "lucide-react";

import type { SessionInfo } from "../lib/types";

type LoginModalProps = {
  open: boolean;
  session: SessionInfo;
  username: string;
  password: string;
  loading: boolean;
  error: string;
  onChangeUsername: (value: string) => void;
  onChangePassword: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function LoginModal(props: LoginModalProps) {
  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      onClick={props.onClose}
    >
      <div className="absolute inset-0 bg-[#14112C]/45 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-gray-50/60 dark:bg-[#2D2D44]/70 backdrop-blur-xl rounded-toy-lg p-6 sm:p-8 border-4 border-[#89CFF0]/20 shadow-[0_22px_80px_rgba(0,0,0,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={props.onClose}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/65 bg-white/85 text-[#2D2D44]/70 shadow-lg transition-colors hover:text-[#CC5E00] dark:border-white/10 dark:bg-[#1A1733]/90 dark:text-white/70"
          aria-label="Dismiss login modal"
        >
          <X size={22} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FFB7B2] to-[#73D216] text-white flex items-center justify-center shadow-pop">
            <UserRound size={26} />
          </div>
          <div>
            <h2 className="font-display text-4xl font-black text-[#2D2D44] dark:text-white">
              Sign In
            </h2>
            <p className="text-[#2D2D44]/70 dark:text-white/80 font-medium">
              Enter your Inkbunny credentials to continue.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm uppercase tracking-[0.22em] font-black text-[#3465A4] dark:text-[#89CFF0]">
              Username
            </span>
            <input
              value={props.username}
              onChange={(event) => props.onChangeUsername(event.target.value)}
              className="mt-2 w-full rounded-2xl border-2 border-white/60 dark:border-white/10 bg-white/80 dark:bg-[#1A1733]/85 px-4 py-3 text-[#2D2D44] dark:text-white shadow-inner outline-none focus:border-[#73D216]"
              placeholder="inkbunny username"
            />
          </label>
          <label className="block">
            <span className="text-sm uppercase tracking-[0.22em] font-black text-[#3465A4] dark:text-[#89CFF0]">
              Password
            </span>
            <input
              type="password"
              value={props.password}
              onChange={(event) => props.onChangePassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border-2 border-white/60 dark:border-white/10 bg-white/80 dark:bg-[#1A1733]/85 px-4 py-3 text-[#2D2D44] dark:text-white shadow-inner outline-none focus:border-[#73D216]"
              placeholder="password"
            />
          </label>
        </div>

        {props.error ? (
          <p className="mt-4 rounded-2xl border-2 border-[#FFB7B2]/70 bg-[#FFB7B2]/18 px-4 py-3 text-sm font-bold text-[#CC5E00]">
            {props.error}
          </p>
        ) : null}

        <div className="mt-6">
          <button
            onClick={props.onSubmit}
            disabled={props.loading}
            className="w-full py-5 bg-[#2A7FA6] hover:bg-[#1e5f7e] disabled:opacity-65 text-white font-black rounded-2xl shadow-xl hover:shadow-2xl active:scale-95 transform transition-all flex justify-center items-center gap-2 border-b-8 border-[#1a516b]"
          >
            {props.loading ? (
              <LoaderCircle className="animate-spin" size={20} />
            ) : (
              <LogIn size={20} />
            )}
            Login
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-white/45 dark:bg-[#1A1733]/50 px-4 py-3 text-sm font-bold text-[#2D2D44]/80 dark:text-white/75">
          {props.session.hasSession
            ? `${props.session.username} (${props.session.isGuest ? "guest" : "member"})`
            : "Not signed in"}
        </div>
      </div>
    </div>
  );
}
