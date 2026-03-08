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
      <div className="theme-overlay-scrim absolute inset-0 backdrop-blur-sm" />
      <form
        className="theme-panel relative w-full max-w-xl rounded-toy-lg border p-6 backdrop-blur-xl sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={props.onClose}
          className="theme-button-secondary absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors"
          aria-label="Dismiss login modal"
        >
          <X size={22} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--theme-accent),var(--theme-accent-strong))] text-white shadow-pop">
            <UserRound size={26} />
          </div>
          <div>
            <h2 className="font-display text-4xl font-black text-[var(--theme-accent-strong)]">
              Sign In
            </h2>
            <p className="theme-muted font-medium">
              Enter your Inkbunny credentials to continue.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm uppercase tracking-[0.22em] font-black text-[var(--theme-info)]">
              Username
            </span>
            <input
              value={props.username}
              onChange={(event) => props.onChangeUsername(event.target.value)}
              className="theme-input mt-2 w-full rounded-2xl border px-4 py-3 shadow-inner outline-none"
              placeholder="inkbunny username"
            />
          </label>
          <label className="block">
            <span className="text-sm uppercase tracking-[0.22em] font-black text-[var(--theme-info)]">
              Password
            </span>
            <input
              type="password"
              value={props.password}
              onChange={(event) => props.onChangePassword(event.target.value)}
              className="theme-input mt-2 w-full rounded-2xl border px-4 py-3 shadow-inner outline-none"
              placeholder="password"
            />
          </label>
        </div>

        {props.error ? (
          <p className="mt-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-danger-soft)] px-4 py-3 text-sm font-bold text-[var(--theme-danger)]">
            {props.error}
          </p>
        ) : null}

        <div className="theme-panel-soft theme-muted mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold backdrop-blur-md">
          If sign-in fails, make sure API access is enabled in your Inkbunny
          account settings.
          <a
            href="https://inkbunny.net/account.php#:~:text=API%20(External%20Scripting)%3A-,Enable%20API%20Access,-Enable%20this%20option"
            target="_blank"
            rel="noreferrer"
            className="ml-1 font-black text-[var(--theme-info)] underline underline-offset-2 transition-colors hover:text-[var(--theme-info-strong)]"
          >
            Open API settings
          </a>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={props.loading}
            className="theme-button-accent flex w-full items-center justify-center gap-2 rounded-2xl border-b-8 py-5 font-black shadow-xl transition-all hover:shadow-2xl active:scale-95 disabled:opacity-65"
          >
            {props.loading ? (
              <LoaderCircle className="animate-spin" size={20} />
            ) : (
              <LogIn size={20} />
            )}
            Login
          </button>
        </div>

        <div className="theme-panel-soft theme-muted mt-4 rounded-2xl border px-4 py-3 text-sm font-bold">
          {props.session.hasSession
            ? `${props.session.username} (${props.session.isGuest ? "guest" : "member"})`
            : "Not signed in"}
        </div>
      </form>
    </div>
  );
}
