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
      <div className="absolute inset-0 bg-[#14112C]/38 backdrop-blur-sm dark:bg-[#0e1116]/56" />
      <form
        className="relative w-full max-w-xl rounded-toy-lg border border-[#b8beb1]/90 bg-[#eff1ea]/95 p-6 shadow-[0_22px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl dark:border-[#4a5360]/90 dark:bg-[#252a31]/92 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={props.onClose}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-[#c6cabf] bg-[#f7f8f2] text-[#555753] shadow-lg transition-colors hover:text-[#CC5E00] dark:border-[#4a5360] dark:bg-[#1f252b] dark:text-white/70"
          aria-label="Dismiss login modal"
        >
          <X size={22} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#8fbb29] to-[#4E9A06] text-white flex items-center justify-center shadow-pop">
            <UserRound size={26} />
          </div>
          <div>
            <h2 className="font-display text-4xl font-black text-[#4E9A06] dark:text-[#8AE234]">
              Sign In
            </h2>
            <p className="font-medium text-[#555753] dark:text-white/80">
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
              className="mt-2 w-full rounded-2xl border border-[#bcc1b5] bg-[#f8f8f4] px-4 py-3 text-[#333333] shadow-inner outline-none focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b] dark:text-white"
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
              className="mt-2 w-full rounded-2xl border border-[#bcc1b5] bg-[#f8f8f4] px-4 py-3 text-[#333333] shadow-inner outline-none focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b] dark:text-white"
              placeholder="password"
            />
          </label>
        </div>

        {props.error ? (
          <p className="mt-4 rounded-2xl border border-[#dba37d] bg-[#f4d8c6] px-4 py-3 text-sm font-bold text-[#CC5E00] dark:border-[#7b5639] dark:bg-[#4b3226] dark:text-[#ffb07c]">
            {props.error}
          </p>
        ) : null}

        <div className="mt-6">
          <button
            type="submit"
            disabled={props.loading}
            className="w-full py-5 bg-[#76B900] hover:bg-[#4E9A06] disabled:opacity-65 text-white font-black rounded-2xl shadow-xl hover:shadow-2xl active:scale-95 transform transition-all flex justify-center items-center gap-2 border-b-8 border-[#4a7f00]"
          >
            {props.loading ? (
              <LoaderCircle className="animate-spin" size={20} />
            ) : (
              <LogIn size={20} />
            )}
            Login
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-[#c8cbc1] bg-[#f7f8f2]/90 px-4 py-3 text-sm font-bold text-[#555753] dark:border-[#4a5360] dark:bg-[#1f252b]/90 dark:text-white/75">
          {props.session.hasSession
            ? `${props.session.username} (${props.session.isGuest ? "guest" : "member"})`
            : "Not signed in"}
        </div>
      </form>
    </div>
  );
}
