import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

export function DownloadPatternInput(props: DownloadPatternInputProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const selectionOffsetRef = useRef<number | null>(null);
  const [draft, setDraft] = useState(props.value || "");
  const [tokensExpanded, setTokensExpanded] = useState(false);

  useEffect(() => {
    setDraft(props.value || "");
  }, [props.value]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    const offset = selectionOffsetRef.current;
    if (!editor || offset === null || document.activeElement !== editor) {
      return;
    }
    setCaretOffset(editor, offset);
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

  function updateDraftFromEditor() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    selectionOffsetRef.current = getCaretOffset(editor);
    setDraft(normalizeEditorText(readEditorValue(editor)));
  }

  function handleBlur() {
    const nextValue = draft.trim() || DEFAULT_DOWNLOAD_PATTERN;
    selectionOffsetRef.current = null;
    if (nextValue !== draft) {
      setDraft(nextValue);
    }
    if (nextValue !== props.value) {
      props.onCommit(nextValue);
    }
  }

  function handleTokenInsert(tokenName: string) {
    const tokenText = `{${tokenName}}`;
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    if (insertTextAtCursor(tokenText)) {
      updateDraftFromEditor();
      return;
    }

    const next = `${draft}${tokenText}`;
    selectionOffsetRef.current = next.length;
    setDraft(next);
  }

  return (
    <div className="space-y-2.5 rounded-[1.75rem] border border-[#2D2D44]/10 bg-white/58 p-3 dark:border-white/10 dark:bg-[#1A1733]/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-black text-[#2D2D44] dark:text-white">
            Download pattern
          </div>
        </div>
        <div className="rounded-full bg-[#2A7FA6]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#2A7FA6] dark:bg-[#89CFF0]/12 dark:text-[#89CFF0]">
          Default
        </div>
      </div>

      <div className="relative rounded-[1.35rem] border border-[#2D2D44]/12 bg-[#FCFBF7]/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/10 dark:bg-[#120F28]/88">
        {draft ? null : (
          <div className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-2">
            <EditorContent segments={placeholderSegments} muted />
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={updateDraftFromEditor}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = normalizeEditorText(
              event.clipboardData.getData("text/plain"),
            );
            if (!text) {
              return;
            }
            if (insertTextAtCursor(text)) {
              updateDraftFromEditor();
            }
          }}
          className="relative min-h-[2.75rem] whitespace-pre-wrap break-words bg-transparent text-left text-sm font-semibold leading-6 text-[#2D2D44] outline-none dark:text-white"
          aria-label="Download naming pattern"
        >
          <EditorContent segments={segments} />
        </div>
      </div>

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
              data-pattern-value={segment.value}
              contentEditable={false}
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
            data-pattern-value={segment.value}
            contentEditable={false}
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

function getCaretOffset(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  return getLogicalOffset(
    element,
    selection.anchorNode ?? element,
    selection.anchorOffset,
  );
}

function setCaretOffset(element: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const position = findCaretPosition(element, offset);

  const range = document.createRange();
  range.setStart(position.container, position.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertTextAtCursor(text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);

  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function readEditorValue(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (node.dataset.patternValue) {
    return node.dataset.patternValue;
  }

  let output = "";
  for (const child of node.childNodes) {
    output += readEditorValue(child);
  }
  return output;
}

function getLogicalOffset(
  root: Node,
  target: Node,
  targetOffset: number,
): number | null {
  if (root === target) {
    if (root.nodeType === Node.TEXT_NODE) {
      return targetOffset;
    }

    let offset = 0;
    for (let index = 0; index < targetOffset; index += 1) {
      offset += getLogicalLength(root.childNodes[index]);
    }
    return offset;
  }

  if (root instanceof HTMLElement && root.dataset.patternValue) {
    return null;
  }

  let total = 0;
  for (const child of root.childNodes) {
    const result = getLogicalOffset(child, target, targetOffset);
    if (result !== null) {
      return total + result;
    }
    total += getLogicalLength(child);
  }
  return null;
}

function getLogicalLength(node: Node | undefined): number {
  if (!node) {
    return 0;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length ?? 0;
  }
  if (node instanceof HTMLElement && node.dataset.patternValue) {
    return node.dataset.patternValue.length;
  }

  let total = 0;
  for (const child of node.childNodes) {
    total += getLogicalLength(child);
  }
  return total;
}

function findCaretPosition(
  node: Node,
  requestedOffset: number,
): { container: Node; offset: number } {
  const offset = Math.max(0, requestedOffset);

  if (node.nodeType === Node.TEXT_NODE) {
    const length = node.textContent?.length ?? 0;
    return { container: node, offset: Math.min(offset, length) };
  }

  if (node instanceof HTMLElement && node.dataset.patternValue) {
    const parent = node.parentNode;
    if (!parent) {
      return { container: node, offset: 0 };
    }
    const index = Array.prototype.indexOf.call(parent.childNodes, node);
    return {
      container: parent,
      offset: offset <= 0 ? index : index + 1,
    };
  }

  let remaining = offset;
  for (const child of node.childNodes) {
    const length = getLogicalLength(child);
    if (remaining <= length) {
      return findCaretPosition(child, remaining);
    }
    remaining -= length;
  }

  return { container: node, offset: node.childNodes.length };
}
