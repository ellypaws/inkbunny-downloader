import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type ToastLevel = "info" | "success" | "warning" | "error";

export type ToastItem = {
  id: string;
  level: ToastLevel;
  message: string;
  dedupeKey?: string;
  retryAfterMs?: number;
};

type ToastHostProps = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

export function ToastHost(props: ToastHostProps) {
  if (props.toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {props.toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-3xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${toastContainerClass(
            toast.level,
          )}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">{toastIcon(toast.level)}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black leading-5">{toast.message}</div>
              {toast.retryAfterMs && toast.retryAfterMs > 0 ? (
                <div className="mt-1 text-xs font-semibold opacity-80">
                  Retrying in {formatRetryAfter(toast.retryAfterMs)}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => props.onDismiss(toast.id)}
              className="rounded-full p-1 opacity-75 transition-opacity hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function toastContainerClass(level: ToastLevel) {
  if (level === "success") {
    return "border-[#73D216]/45 bg-[#eff9df]/92 text-[#275000] dark:border-[#73D216]/30 dark:bg-[#19310b]/92 dark:text-[#dff7b2]";
  }
  if (level === "warning") {
    return "border-[#CC5E00]/35 bg-[#fff0df]/94 text-[#7a3400] dark:border-[#CC5E00]/35 dark:bg-[#43240f]/94 dark:text-[#ffd2a8]";
  }
  if (level === "error") {
    return "border-[#c4495f]/35 bg-[#ffe6eb]/94 text-[#7f1830] dark:border-[#c4495f]/35 dark:bg-[#411624]/94 dark:text-[#ffbfd0]";
  }
  return "border-[#2A7FA6]/30 bg-[#e8f8ff]/94 text-[#174760] dark:border-[#2A7FA6]/30 dark:bg-[#102733]/94 dark:text-[#b8ebff]";
}

function toastIcon(level: ToastLevel) {
  if (level === "success") {
    return <CheckCircle2 size={18} />;
  }
  if (level === "warning") {
    return <TriangleAlert size={18} />;
  }
  if (level === "error") {
    return <AlertCircle size={18} />;
  }
  return <Info size={18} />;
}

function formatRetryAfter(retryAfterMs: number) {
  const seconds = Math.max(1, Math.round(retryAfterMs / 100) / 10);
  if (Number.isInteger(seconds)) {
    return `${seconds.toFixed(0)}s`;
  }
  return `${seconds.toFixed(1)}s`;
}
