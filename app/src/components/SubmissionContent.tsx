import { LoaderCircle } from "lucide-react";
import { memo, useEffect, useState, type CSSProperties } from "react";

import type { SubmissionDescription as SubmissionDescriptionPayload } from "../lib/types";
import { backend, resolveMediaSrcSet, resolveMediaURL } from "../lib/wails";

type SubmissionContentProps = {
  submissionId: string;
  mode: "description" | "writing";
  className?: string;
  style?: CSSProperties;
  loadingLabel?: string;
  emptyLabel?: string;
  interactive?: boolean;
  onDescriptionChange?: (
    description: SubmissionDescriptionPayload | null,
  ) => void;
};

type SubmissionBodySelection = {
  html?: string;
  text?: string;
};

type SubmissionContentState = {
  requestKey: string;
  description: SubmissionDescriptionPayload | null;
  loading: boolean;
  loadError: string;
};

type ResolvedHtmlState = {
  htmlKey: string;
  value?: string;
};

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "source",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "u",
  "ul",
  "video",
]);

const BLOCKED_TAGS = new Set([
  "applet",
  "audio",
  "base",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "object",
  "script",
  "select",
  "style",
  "svg",
  "textarea",
  "title",
]);

export const SubmissionContent = memo(function SubmissionContent(
  props: SubmissionContentProps,
) {
  const {
    submissionId,
    mode,
    className,
    style,
    loadingLabel,
    emptyLabel,
    interactive,
    onDescriptionChange,
  } = props;
  const requestKey = `${submissionId}:${mode}`;
  const [contentState, setContentState] = useState<SubmissionContentState>(() => ({
    requestKey,
    description: null,
    loading: true,
    loadError: "",
  }));
  const [resolvedHtmlState, setResolvedHtmlState] = useState<ResolvedHtmlState>({
    htmlKey: "",
  });
  const description =
    contentState.requestKey === requestKey ? contentState.description : null;
  const loading =
    contentState.requestKey === requestKey ? contentState.loading : true;
  const loadError =
    contentState.requestKey === requestKey ? contentState.loadError : "";

  useEffect(() => {
    let cancelled = false;

    void backend
      .getSubmissionDescription(submissionId)
      .then((nextDescription) => {
        if (cancelled) {
          return;
        }
        setContentState({
          requestKey,
          description: nextDescription,
          loading: false,
          loadError: "",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setContentState({
          requestKey,
          description: null,
          loading: false,
          loadError:
            error instanceof Error && error.message.trim()
              ? error.message.trim()
              : `Could not load ${mode}.`,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [mode, requestKey, submissionId]);

  useEffect(() => {
    onDescriptionChange?.(description);
  }, [description, onDescriptionChange]);

  const selection = selectSubmissionBody(description, mode);
  const htmlKey = selection.html ? `${requestKey}:${selection.html}` : "";
  const resolvedHtml =
    htmlKey && resolvedHtmlState.htmlKey === htmlKey
      ? resolvedHtmlState.value
      : undefined;

  useEffect(() => {
    let cancelled = false;
    const html = selection.html;

    if (!html) {
      return;
    }

    const documentFragment = new DOMParser().parseFromString(html, "text/html");
    const mediaNodes = Array.from(
      documentFragment.querySelectorAll("img, source, video"),
    );

    for (const node of mediaNodes) {
      const src = node.getAttribute("src");
      const srcSet = node.getAttribute("srcset");
      const poster = node.getAttribute("poster");
      if (src) {
        node.setAttribute("src", resolveMediaURL(src) ?? src);
      }
      if (srcSet) {
        node.setAttribute("srcset", resolveMediaSrcSet(srcSet) ?? srcSet);
      }
      if (poster) {
        node.setAttribute("poster", resolveMediaURL(poster) ?? poster);
      }
    }

    const userIconImages = Array.from(documentFragment.querySelectorAll("img"))
      .map((image) => ({
        image,
        src: image.getAttribute("src") || "",
      }))
      .filter((entry) => isUserIconURL(entry.src));

    const commitResolvedHTML = () => {
      if (cancelled) {
        return;
      }
      sanitizeSubmissionHTML(documentFragment.body);
      setResolvedHtmlState({
        htmlKey,
        value: documentFragment.body.innerHTML,
      });
    };

    if (userIconImages.length === 0) {
      commitResolvedHTML();
      return;
    }

    void Promise.all(
      userIconImages.map(async ({ image, src }) => {
        const proxiedSource = await resolveAvatarImageURL(src);
        if (proxiedSource) {
          image.setAttribute("src", proxiedSource);
        }
      }),
    ).then(() => {
      commitResolvedHTML();
    });

    return () => {
      cancelled = true;
    };
  }, [htmlKey, selection.html]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (!interactive) {
      return;
    }

    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) {
      return;
    }

    event.preventDefault();
    void openExternal(anchor.getAttribute("href") || undefined);
  };

  return (
    <div className={className} style={style} onClick={handleClick}>
      {loading ? (
        <div className="inline-flex items-center gap-2 text-[var(--theme-subtle)]">
          <LoaderCircle size={14} className="animate-spin" />
          <span>{loadingLabel ?? `Loading ${mode}`}</span>
        </div>
      ) : resolvedHtml ? (
        <div
          className="[&_img]:h-auto [&_img]:max-w-full [&_video]:h-auto [&_video]:max-w-full"
          dangerouslySetInnerHTML={{ __html: resolvedHtml }}
        />
      ) : selection.text ? (
        <p className="whitespace-pre-wrap">{selection.text}</p>
      ) : loadError ? (
        <p className="theme-subtle">{loadError}</p>
      ) : (
        <p className="theme-subtle">
          {emptyLabel ??
            (mode === "writing"
              ? "No writing available."
              : "No description available.")}
        </p>
      )}
    </div>
  );
});

function selectSubmissionBody(
  description: SubmissionDescriptionPayload | null,
  mode: SubmissionContentProps["mode"],
): SubmissionBodySelection {
  if (!description) {
    return {};
  }

  if (mode === "writing") {
    return {
      html: firstNonEmpty(description.writingHtml, description.descriptionHtml),
      text: firstNonEmpty(description.writing, description.description),
    };
  }

  return {
    html: firstNonEmpty(description.descriptionHtml, description.writingHtml),
    text: firstNonEmpty(description.description, description.writing),
  };
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    if (value && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function sanitizeSubmissionHTML(root: HTMLElement) {
  for (const child of Array.from(root.childNodes)) {
    sanitizeNode(child);
  }
}

function sanitizeNode(node: Node) {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tag)) {
    element.remove();
    return;
  }

  for (const child of Array.from(element.childNodes)) {
    sanitizeNode(child);
  }

  if (!ALLOWED_TAGS.has(tag)) {
    unwrapElement(element);
    return;
  }

  sanitizeElementAttributes(element, tag);

  if (tag === "img" && !element.getAttribute("src")) {
    element.remove();
  }

  if (tag === "source") {
    if (element.parentElement?.tagName.toLowerCase() !== "video") {
      element.remove();
      return;
    }
    if (!element.getAttribute("src")) {
      element.remove();
    }
  }

  if (
    tag === "video" &&
    !element.getAttribute("src") &&
    !element.querySelector("source[src]")
  ) {
    element.remove();
  }
}

function sanitizeElementAttributes(element: HTMLElement, tag: string) {
  for (const attribute of Array.from(element.attributes)) {
    const key = attribute.name.toLowerCase().trim();
    const value = attribute.value.trim();

    if (!key || key.startsWith("on")) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tag === "a") {
      if (key === "href") {
        if (isAllowedLinkURL(value)) {
          element.setAttribute("href", value);
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      if (key === "title") {
        continue;
      }
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tag === "img") {
      if (key === "src") {
        if (isAllowedAssetURL(value)) {
          element.setAttribute("src", value);
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      if (key === "srcset") {
        const sanitizedSrcSet = sanitizeSrcSet(value);
        if (sanitizedSrcSet) {
          element.setAttribute("srcset", sanitizedSrcSet);
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      if (key === "alt" || key === "title") {
        continue;
      }
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tag === "video") {
      if (key === "src" || key === "poster") {
        if (isAllowedAssetURL(value)) {
          element.setAttribute(key, value);
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      if (
        key === "controls" ||
        key === "autoplay" ||
        key === "loop" ||
        key === "muted" ||
        key === "playsinline"
      ) {
        element.setAttribute(attribute.name, "");
        continue;
      }
      if (key === "preload") {
        if (value === "none" || value === "metadata" || value === "auto") {
          element.setAttribute(attribute.name, value);
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tag === "source") {
      if (key === "src") {
        if (isAllowedAssetURL(value)) {
          element.setAttribute("src", value);
        } else {
          element.removeAttribute(attribute.name);
        }
        continue;
      }
      if (key === "type") {
        continue;
      }
      element.removeAttribute(attribute.name);
      continue;
    }

    element.removeAttribute(attribute.name);
  }
}

function sanitizeSrcSet(value: string) {
  const sanitized = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, ...descriptor] = entry.split(/\s+/);
      if (!isAllowedAssetURL(url)) {
        return "";
      }
      return [url, ...descriptor].join(" ").trim();
    })
    .filter(Boolean);

  return sanitized.length > 0 ? sanitized.join(", ") : "";
}

function isAllowedLinkURL(raw: string) {
  if (!raw) {
    return false;
  }
  if (raw.startsWith("#")) {
    return true;
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return parsed.pathname.startsWith("/api/open");
    }
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

function isAllowedAssetURL(raw: string) {
  if (!raw) {
    return false;
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return (
        parsed.pathname.startsWith("/api/resource") ||
        parsed.pathname.startsWith("/api/avatar/image")
      );
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

const proxiedAvatarImageRequests = new Map<string, Promise<string>>();

function isUserIconURL(src?: string) {
  return (src || "").toLowerCase().includes("/usericons/");
}

function resolveAvatarImageURL(src?: string) {
  if (!src) {
    return Promise.resolve("");
  }
  if (!isUserIconURL(src)) {
    return Promise.resolve(resolveMediaURL(src) ?? src);
  }

  const cached = proxiedAvatarImageRequests.get(src);
  if (cached) {
    return cached;
  }

  const request = backend
    .proxyAvatarImageURL(src)
    .then((resolved) => resolveMediaURL(resolved) ?? resolved)
    .catch(() => resolveMediaURL(src) ?? src);
  proxiedAvatarImageRequests.set(src, request);
  return request;
}

async function openExternal(url?: string) {
  if (!url) {
    return;
  }
  try {
    await backend.openExternalURL(url);
  } catch {
    return;
  }
}
