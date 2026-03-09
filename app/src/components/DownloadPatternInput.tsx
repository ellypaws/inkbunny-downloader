import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  collectUnknownDownloadTokens,
  DEFAULT_DOWNLOAD_PATTERN,
  DOWNLOAD_PATTERN_TOKENS,
  renderDownloadPatternPreview,
  tokenizeDownloadPattern,
} from "../lib/downloadPattern";

type DownloadPatternInputProps = {
  value: string;
  onCommit: (value: string) => void;
};

const MIN_EDITOR_HEIGHT = 44;
const MAX_EDITOR_HEIGHT = 144;

export function DownloadPatternInput(props: DownloadPatternInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const nextSelectionRef = useRef<number | null>(null);
  const [draft, setDraft] = useState(props.value || "");
  const [tokensExpanded, setTokensExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setDraft(props.value || "");
  }, [props.value]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    const height = Math.min(
      MAX_EDITOR_HEIGHT,
      Math.max(MIN_EDITOR_HEIGHT, textarea.scrollHeight),
    );
    textarea.style.height = `${height}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_EDITOR_HEIGHT ? "auto" : "hidden";

    if (nextSelectionRef.current !== null) {
      const offset = nextSelectionRef.current;
      textarea.focus();
      textarea.setSelectionRange(offset, offset);
      nextSelectionRef.current = null;
    }
  }, [draft]);

  const activePattern = draft || DEFAULT_DOWNLOAD_PATTERN;
  const segments = useMemo(() => tokenizeDownloadPattern(draft), [draft]);
  const placeholderSegments = useMemo(
    () => tokenizeDownloadPattern(DEFAULT_DOWNLOAD_PATTERN),
    [],
  );
  const previewPaths = useMemo(
    () => renderDownloadPatternPreview(activePattern),
    [activePattern],
  );
  const unknownTokens = useMemo(
    () => collectUnknownDownloadTokens(draft),
    [draft],
  );
  const isModified = useMemo(
    () => normalizePatternDraft(draft) !== normalizePatternDraft(props.value),
    [draft, props.value],
  );

  function handleChange(value: string) {
    setDraft(normalizeEditorText(value));
  }

  function handleSave() {
    const nextValue = normalizePatternDraft(draft);
    setDraft(nextValue);
    if (nextValue !== normalizePatternDraft(props.value)) {
      props.onCommit(nextValue);
    }
  }

  function handleUndo() {
    const nextValue = props.value || "";
    setDraft(nextValue);
    nextSelectionRef.current = nextValue.length;
  }

  function handleTokenInsert(tokenName: string) {
    const textarea = textareaRef.current;
    const tokenText = `{${tokenName}}`;
    if (!textarea) {
      setDraft((current) => `${current}${tokenText}`);
      return;
    }

    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? draft.length;
    const nextValue = `${draft.slice(0, start)}${tokenText}${draft.slice(end)}`;
    nextSelectionRef.current = start + tokenText.length;
    setDraft(nextValue);
  }

  return (
    <div className="space-y-2.5 rounded-[1.75rem] border border-[#2D2D44]/10 bg-white/58 p-3 dark:border-white/10 dark:bg-[#1A1733]/60">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm font-black text-[#2D2D44] dark:text-white">
          Download pattern
        </div>
        <div className="rounded-full bg-[#2A7FA6]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#2A7FA6] dark:bg-[#89CFF0]/12 dark:text-[#89CFF0]">
          Default
        </div>
      </div>

      <div className="rounded-[1.35rem] border border-[#2D2D44]/12 bg-[#FCFBF7]/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/10 dark:bg-[#120F28]/88">
        <div className="relative">
          <div
            ref={mirrorRef}
            aria-hidden
            className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-left text-sm font-semibold leading-6 text-[#2D2D44] transition-opacity dark:text-white ${
              isEditing ? "opacity-0" : "opacity-100"
            }`}
          >
            {draft ? (
              <EditorContent segments={segments} />
            ) : (
              <EditorContent segments={placeholderSegments} muted />
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            spellCheck={false}
            rows={2}
            onChange={(event) => handleChange(event.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            onScroll={(event) => {
              if (!mirrorRef.current) {
                return;
              }
              mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
              mirrorRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                handleSave();
                return;
              }
              if (event.key === "Escape" && isModified) {
                event.preventDefault();
                handleUndo();
              }
            }}
            className={`relative z-10 block w-full resize-none overflow-hidden bg-transparent text-sm font-semibold leading-6 outline-none selection:bg-[#2A7FA6]/18 ${
              isEditing
                ? "text-[#2D2D44] caret-[#2D2D44] dark:text-white dark:caret-white"
                : "text-transparent caret-[#2D2D44] dark:caret-white"
            }`}
            aria-label="Download pattern editor"
          />
        </div>
      </div>

      {isModified ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-[#2A7FA6] px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#204A87] dark:bg-[#89CFF0] dark:text-[#0F172A] dark:hover:bg-[#B6E5FF]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleUndo}
            className="rounded-full border border-[#2D2D44]/14 px-3 py-1 text-[11px] font-semibold text-[#2D2D44]/75 transition-colors hover:border-[#2D2D44]/24 hover:bg-white/60 dark:border-white/12 dark:text-white/70 dark:hover:bg-white/8"
          >
            Undo
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-[#2D2D44]/55 dark:text-white/45">
          Preview
        </div>
        <div className="space-y-1.5 rounded-[1.2rem] bg-[#0F172A] px-3 py-2.5 font-mono text-xs text-[#D8F3FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          {previewPaths.map((previewPath) => (
            <div key={previewPath} className="break-all">
              {previewPath}
            </div>
          ))}
        </div>
      </div>

      {unknownTokens.length === 0 ? null : (
        <div className="rounded-[1.25rem] border border-[#CC0000]/20 bg-[#FFE8E8] px-3 py-2 text-xs font-semibold text-[#8A1538] dark:border-[#FF6B6B]/20 dark:bg-[#3B1622] dark:text-[#FFB6C1]">
          Unknown tokens: {unknownTokens.join(", ")}
        </div>
      )}

      <div className="space-y-2">
        <div className="relative">
          <div
            className={`flex flex-wrap gap-1.5 overflow-hidden transition-[max-height] duration-300 ${
              tokensExpanded ? "max-h-96" : "max-h-[4rem]"
            }`}
          >
            {DOWNLOAD_PATTERN_TOKENS.map((token) => (
              <button
                key={token.name}
                type="button"
                title={`${token.description} Example: ${token.example}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleTokenInsert(token.name)}
                className="rounded-full border border-[#2A7FA6]/18 bg-[#2A7FA6]/8 px-2 py-0.5 text-[9px] font-semibold text-[#2A7FA6] transition-colors hover:border-[#2A7FA6]/30 hover:bg-[#2A7FA6]/14 dark:border-[#89CFF0]/18 dark:bg-[#89CFF0]/10 dark:text-[#89CFF0] dark:hover:border-[#89CFF0]/28 dark:hover:bg-[#89CFF0]/16"
              >
                {token.name}
              </button>
            ))}
          </div>
          {tokensExpanded ? null : (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-white/90 to-transparent dark:from-[#1A1733]/92" />
          )}
        </div>
        <button
          type="button"
          onClick={() => setTokensExpanded((current) => !current)}
          className="text-[11px] font-semibold text-[#2A7FA6] transition-colors hover:text-[#204A87] dark:text-[#89CFF0] dark:hover:text-[#B6E5FF]"
        >
          {tokensExpanded ? "show less" : "show more"}
        </button>
      </div>
    </div>
  );
}

function EditorContent(props: {
  segments: ReturnType<typeof tokenizeDownloadPattern>;
  muted?: boolean;
}) {
  return (
    <>
      {props.segments.map((segment, index) => {
        if (segment.kind === "text") {
          return <span key={`text-${index}`}>{segment.value}</span>;
        }

        if (segment.kind === "invalid") {
          return (
            <span
              key={`invalid-${index}`}
              title={`Unknown token ${segment.value}`}
              className={`inline-flex rounded-full border px-1.5 py-0.5 align-middle text-[10px] font-semibold ${
                props.muted
                  ? "border-[#8A1538]/20 bg-[#FFE8E8]/75 text-[#8A1538]/45 dark:border-[#FFB6C1]/15 dark:bg-[#3B1622]/45 dark:text-[#FFB6C1]/40"
                  : "border-[#8A1538]/30 bg-[#FFE8E8] text-[#8A1538] dark:border-[#FFB6C1]/18 dark:bg-[#3B1622] dark:text-[#FFB6C1]"
              }`}
            >
              {segment.value}
            </span>
          );
        }

        return (
          <span
            key={`token-${segment.token.name}-${index}`}
            title={`${segment.token.description} Example: ${segment.token.example}`}
            className={`inline-flex rounded-full border px-1.5 py-0.5 align-middle text-[10px] font-semibold ${
              props.muted
                ? "border-[#2A7FA6]/14 bg-[#2A7FA6]/8 text-[#2A7FA6]/45 dark:border-[#89CFF0]/12 dark:bg-[#89CFF0]/8 dark:text-[#89CFF0]/38"
                : "border-[#2A7FA6]/22 bg-[#2A7FA6]/12 text-[#2A7FA6] dark:border-[#89CFF0]/18 dark:bg-[#89CFF0]/12 dark:text-[#89CFF0]"
            }`}
          >
            {segment.token.name}
          </span>
        );
      })}
    </>
  );
}

function normalizeEditorText(value: string) {
  return value.replace(/\r?\n/g, "").replaceAll("\u00A0", " ");
}

function normalizePatternDraft(value: string) {
  const trimmed = value.trim();
  return trimmed || DEFAULT_DOWNLOAD_PATTERN;
}
