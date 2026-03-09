import {
  Check,
  ChevronDown,
  LoaderCircle,
  Search as SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  DEFAULT_AVATAR_URL,
  FIND_OPTIONS,
  ORDER_OPTIONS,
  RATING_OPTIONS,
  SCRAPS_OPTIONS,
  TIME_OPTIONS,
  TYPE_OPTIONS,
} from "../lib/constants";
import type {
  SearchParams,
  SessionInfo,
  UsernameSuggestion,
} from "../lib/types";

type SearchWorkspaceProps = {
  session: SessionInfo;
  searchParams: SearchParams;
  mode: "default" | "unread";
  keywordSuggestions: string[];
  artistSuggestions: UsernameSuggestion[];
  favoriteSuggestions: UsernameSuggestion[];
  loading: boolean;
  ratingUpdating: boolean;
  collapsed: boolean;
  error: string;
  onChange: (updater: (previous: SearchParams) => SearchParams) => void;
  onSearch: () => void;
  onToggleCollapse: () => void;
  onToggleRating: (index: number) => void;
};

type SuggestionField = "query" | "artistName" | "favoritesBy" | null;
type ChoiceTone =
  | "default"
  | "general"
  | "mature"
  | "matureViolence"
  | "adult"
  | "adultViolence";

export function SearchWorkspace(props: SearchWorkspaceProps) {
  const [focusedField, setFocusedField] = useState<SuggestionField>(null);
  const canUseMyName =
    props.session.hasSession &&
    !props.session.isGuest &&
    props.session.username !== "";
  const anyTypeSelected = props.searchParams.submissionTypes.length === 0;

  const ratingRows = useMemo(
    () =>
      RATING_OPTIONS.map((option) => ({
        ...option,
        enabled: isRatingEnabled(props.session.ratingsMask, option.index),
      })),
    [props.session.ratingsMask],
  );

  return (
    <section className="relative overflow-hidden rounded-toy-sm bg-transparent backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 opacity-10 mix-blend-multiply dark:mix-blend-overlay bg-[radial-gradient(circle_at_top_right,var(--theme-accent-soft),transparent_30%),radial-gradient(circle_at_bottom_left,var(--theme-border-soft),transparent_22%)]" />
      <div className="theme-panel relative z-10 overflow-hidden rounded-toy-sm border shadow-pop backdrop-blur-xl">
        <button
          type="button"
          onClick={props.onToggleCollapse}
          className="theme-divider theme-hover group flex w-full items-center justify-between border-b px-5 py-4 text-left transition-colors sm:px-6"
          aria-expanded={!props.collapsed}
        >
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl font-black text-[var(--theme-accent-strong)] sm:text-[2.1rem]">
              Search
            </h2>
            {props.mode === "unread" ? (
              <span className="rounded-full border border-[var(--inkbunny-green)] px-3 py-1 text-[11px] font-black text-[var(--inkbunny-slate)] shadow-sm">
                Unread Mode
              </span>
            ) : null}
          </div>
          <span
            className={`theme-panel-strong flex h-11 w-11 items-center justify-center rounded-full border text-[var(--theme-info)] shadow-sm backdrop-blur-md transition-all duration-300 group-hover:scale-105 ${
              props.collapsed ? "-rotate-90" : "rotate-0"
            }`}
          >
            <ChevronDown size={20} />
          </span>
        </button>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
            props.collapsed
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
              <div className="grid gap-4 lg:grid-cols-[132px_minmax(0,1fr)] lg:items-start">
                <FieldLabel title="Search words" subtitle="optional" />
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative min-w-0">
                    <input
                      value={props.searchParams.query}
                      onFocus={() => setFocusedField("query")}
                      onBlur={() =>
                        window.setTimeout(
                          () =>
                            setFocusedField((current) =>
                              current === "query" ? null : current,
                            ),
                          100,
                        )
                      }
                      onChange={(event) =>
                        props.onChange((previous) => ({
                          ...previous,
                          query: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          props.onSearch();
                        }
                      }}
                      placeholder="wolf synthwave -feral"
                      className="theme-input w-full rounded-2xl border px-4 py-3 text-[15px] shadow-inner outline-none backdrop-blur-md"
                      data-tour-anchor="search-words"
                    />
                    <KeywordSuggestionList
                      open={
                        focusedField === "query" &&
                        props.keywordSuggestions.length > 0
                      }
                      suggestions={props.keywordSuggestions}
                      onPick={(suggestion) =>
                        props.onChange((previous) => ({
                          ...previous,
                          query: applyKeywordSuggestion(
                            previous.query,
                            suggestion,
                          ),
                        }))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={props.onSearch}
                    disabled={props.loading}
                    className={`theme-button-accent flex w-full items-center justify-center gap-2 rounded-2xl border-b-8 px-5 py-3.5 text-sm font-black shadow-xl transition-all sm:w-32 ${
                      props.loading ? "opacity-70" : ""
                    }`}
                    data-tour-anchor="search-action"
                  >
                    {props.loading ? (
                      <LoaderCircle className="animate-spin" size={18} />
                    ) : (
                      <SearchIcon size={18} />
                    )}
                    Search
                  </button>
                  <div className="theme-muted text-sm leading-6 sm:col-span-2">
                    Separate words with spaces. Use{" "}
                    <span className="font-black">-</span> to exclude a keyword,
                    for example{" "}
                    <span className="font-black">leopard -snow</span>. Avoid
                    punctuation and words such as “and”, “or”, and “not”.
                  </div>
                </div>
              </div>

              <SectionDivider />

              <div className="grid gap-4 lg:grid-cols-[132px_minmax(0,1fr)] lg:items-start">
                <FieldLabel title="Find" />
                <div className="grid gap-3 md:grid-cols-3">
                  {FIND_OPTIONS.map((option) => (
                    <ChoiceCard
                      key={option.value}
                      type="radio"
                      checked={props.searchParams.joinType === option.value}
                      label={option.label}
                      onSelect={() =>
                        props.onChange((previous) => ({
                          ...previous,
                          joinType: option.value,
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <SectionDivider />

              <div className="grid gap-4 lg:grid-cols-[132px_minmax(0,1fr)] lg:items-start">
                <FieldLabel title="Search in" />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <ChoiceCard
                    type="checkbox"
                    checked={props.searchParams.searchInKeywords}
                    label="Keywords"
                    onSelect={() =>
                      props.onChange((previous) => ({
                        ...previous,
                        searchInKeywords: !previous.searchInKeywords,
                      }))
                    }
                  />
                  <ChoiceCard
                    type="checkbox"
                    checked={props.searchParams.searchInTitle}
                    label="Title"
                    onSelect={() =>
                      props.onChange((previous) => ({
                        ...previous,
                        searchInTitle: !previous.searchInTitle,
                      }))
                    }
                  />
                  <ChoiceCard
                    type="checkbox"
                    checked={props.searchParams.searchInDescription}
                    label="Description or Story"
                    onSelect={() =>
                      props.onChange((previous) => ({
                        ...previous,
                        searchInDescription: !previous.searchInDescription,
                      }))
                    }
                  />
                  <ChoiceCard
                    type="checkbox"
                    checked={props.searchParams.searchInMD5}
                    label="MD5 Hash"
                    onSelect={() =>
                      props.onChange((previous) => ({
                        ...previous,
                        searchInMD5: !previous.searchInMD5,
                      }))
                    }
                  />
                </div>
              </div>

              <SectionDivider />

              <div className="grid gap-5 lg:grid-cols-2">
                <SuggestionFieldBlock
                  title="Artist name"
                  subtitle="Search only submissions by this user"
                  optionalText="optional"
                  value={props.searchParams.artistName}
                  suggestions={props.artistSuggestions}
                  useMyNameLabel="Search my uploads only"
                  allowUseMyName={canUseMyName}
                  focused={focusedField === "artistName"}
                  onFocus={() => setFocusedField("artistName")}
                  onBlur={() =>
                    window.setTimeout(
                      () =>
                        setFocusedField((current) =>
                          current === "artistName" ? null : current,
                        ),
                      100,
                    )
                  }
                  onChange={(value) =>
                    props.onChange((previous) => ({
                      ...previous,
                      artistName: value,
                    }))
                  }
                  inputTourAnchor="artist-name"
                  onUseMyName={() =>
                    props.onChange((previous) => ({
                      ...previous,
                      artistName: props.session.username,
                    }))
                  }
                />
                <SuggestionFieldBlock
                  title="Search favorites by"
                  subtitle="Search only work favorited by this user"
                  optionalText="optional"
                  value={props.searchParams.favoritesBy}
                  suggestions={props.favoriteSuggestions}
                  useMyNameLabel="Search my favorites only"
                  allowUseMyName={canUseMyName}
                  focused={focusedField === "favoritesBy"}
                  onFocus={() => setFocusedField("favoritesBy")}
                  onBlur={() =>
                    window.setTimeout(
                      () =>
                        setFocusedField((current) =>
                          current === "favoritesBy" ? null : current,
                        ),
                      100,
                    )
                  }
                  onChange={(value) =>
                    props.onChange((previous) => ({
                      ...previous,
                      favoritesBy: value,
                    }))
                  }
                  onUseMyName={() =>
                    props.onChange((previous) => ({
                      ...previous,
                      favoritesBy: props.session.username,
                    }))
                  }
                />
              </div>

              <SectionDivider />

              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)]">
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-center">
                    <FieldLabel title="Time Range" />
                    <select
                      value={props.searchParams.timeRangeDays}
                      onChange={(event) =>
                        props.onChange((previous) => ({
                          ...previous,
                          timeRangeDays: Number(event.target.value),
                        }))
                      }
                      className="theme-input w-full max-w-xs rounded-xl border px-4 py-2.5 text-sm outline-none backdrop-blur-md"
                    >
                      {TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
                    <FieldLabel
                      title="Find Content Rated"
                      subtitle="select at least one"
                    />
                    <div className="space-y-2.5">
                      <div className="grid gap-2">
                        {ratingRows.map((rating) => (
                          <ChoiceCard
                            key={rating.label}
                            type="checkbox"
                            checked={rating.enabled}
                            label={rating.label}
                            disabled={props.ratingUpdating}
                            tone={getRatingTone(rating.index)}
                            onSelect={() => props.onToggleRating(rating.index)}
                          />
                        ))}
                      </div>
                      {props.ratingUpdating ? (
                        <div className="theme-muted text-sm font-semibold">
                          Updating ratings...
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="theme-divider grid gap-4 xl:border-l xl:pl-6">
                  <FieldLabel title="Submission type" />
                  <div className="space-y-3">
                    <ChoiceCard
                      type="radio"
                      checked={anyTypeSelected}
                      label="Any"
                      onSelect={() =>
                        props.onChange((previous) => ({
                          ...previous,
                          submissionTypes: [],
                        }))
                      }
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      {TYPE_OPTIONS.map((option) => {
                        const selected =
                          props.searchParams.submissionTypes.includes(
                            option.value,
                          );
                        return (
                          <ChoiceCard
                            key={option.value}
                            type="checkbox"
                            checked={selected}
                            label={option.label}
                            onSelect={() =>
                              props.onChange((previous) => {
                                const nextTypes = selected
                                  ? previous.submissionTypes.filter(
                                      (value) => value !== option.value,
                                    )
                                  : [
                                      ...previous.submissionTypes,
                                      option.value,
                                    ].sort((a, b) => a - b);
                                return {
                                  ...previous,
                                  submissionTypes: nextTypes,
                                };
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <SectionDivider />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  <label className="block">
                    <span className="theme-title text-sm font-bold">
                      Order by
                    </span>
                    <select
                      value={props.searchParams.orderBy}
                      onChange={(event) =>
                        props.onChange((previous) => ({
                          ...previous,
                          orderBy: event.target.value,
                        }))
                      }
                      className="theme-input mt-2 w-full rounded-xl border px-4 py-2.5 text-sm outline-none backdrop-blur-md"
                    >
                      {ORDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="theme-title text-sm font-bold">
                      Results per page
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={props.searchParams.perPage || ""}
                      onChange={(event) =>
                        props.onChange((previous) => ({
                          ...previous,
                          perPage: Number(event.target.value) || 0,
                        }))
                      }
                      placeholder="30"
                      className="theme-input mt-2 w-full rounded-xl border px-4 py-2.5 text-sm outline-none backdrop-blur-md"
                    />
                  </label>
                  <label className="block">
                    <span className="theme-title text-sm font-bold">
                      Maximum files
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={props.searchParams.maxDownloads || ""}
                      onChange={(event) =>
                        props.onChange((previous) => ({
                          ...previous,
                          maxDownloads: Number(event.target.value) || 0,
                        }))
                      }
                      placeholder={props.session.isGuest ? "256" : "Unlimited"}
                      className="theme-input mt-2 w-full rounded-xl border px-4 py-2.5 text-sm outline-none backdrop-blur-md"
                    />
                  </label>
                  <label className="block">
                    <span className="theme-title text-sm font-bold">
                      Pool ID
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={props.searchParams.poolId || ""}
                      onChange={(event) =>
                        props.onChange((previous) => ({
                          ...previous,
                          poolId: Number(event.target.value) || 0,
                        }))
                      }
                      placeholder="12345"
                      className="theme-input mt-2 w-full rounded-xl border px-4 py-2.5 text-sm outline-none backdrop-blur-md"
                    />
                  </label>
                  <label className="block 2xl:col-span-2">
                    <span className="theme-title text-sm font-bold">
                      Scraps
                    </span>
                    <select
                      value={props.searchParams.scraps}
                      onChange={(event) =>
                        props.onChange((previous) => ({
                          ...previous,
                          scraps: event.target.value,
                        }))
                      }
                      className="theme-input mt-2 w-full rounded-xl border px-4 py-2.5 text-sm outline-none backdrop-blur-md"
                    >
                      {SCRAPS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={props.onSearch}
                  disabled={props.loading}
                  className={`theme-button-accent flex w-full items-center justify-center gap-2 rounded-2xl border-b-8 px-6 py-3.5 text-sm font-black shadow-xl transition-all xl:w-40 xl:self-end ${
                    props.loading ? "opacity-70" : ""
                  }`}
                >
                  {props.loading ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <SearchIcon size={18} />
                  )}
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {props.error ? (
        <div className="relative z-10 mt-5 rounded-toy border border-[var(--theme-border)] bg-[var(--theme-danger-soft)] px-5 py-4 text-sm font-bold text-[var(--theme-danger)] shadow-sm backdrop-blur-md">
          {props.error}
        </div>
      ) : null}
    </section>
  );
}

function FieldLabel(props: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="theme-title text-sm font-semibold">
        {props.title}:
      </div>
      {props.subtitle ? (
        <div className="theme-subtle mt-1 text-xs font-medium">
          {props.subtitle}
        </div>
      ) : null}
    </div>
  );
}

function SectionDivider() {
  return <div className="theme-divider border-t" />;
}

function ChoiceCard(props: {
  type: "radio" | "checkbox";
  checked: boolean;
  label: string;
  disabled?: boolean;
  tone?: ChoiceTone;
  onSelect: () => void;
}) {
  const tone = props.tone ?? "default";
  const checkedClass =
    tone === "general"
      ? "border-[#76B900]/70 bg-[#76B900]/10 text-[var(--theme-title)]"
      : tone === "mature"
        ? "border-[#DA8642]/70 bg-[#DA8642]/10 text-[var(--theme-title)]"
        : tone === "matureViolence"
          ? "border-[#B98A63]/70 bg-[#B98A63]/10 text-[var(--theme-title)]"
          : tone === "adult"
            ? "border-[#B20047]/70 bg-[#B20047]/10 text-[var(--theme-title)]"
            : tone === "adultViolence"
              ? "border-[#8F3E5F]/70 bg-[#8F3E5F]/10 text-[var(--theme-title)]"
              : "border-[#76B900]/70 bg-[#76B900]/10 text-[var(--theme-title)]";
  const indicatorClass =
    tone === "general"
      ? "border-[#76B900] bg-[#76B900]"
      : tone === "mature"
        ? "border-[#DA8642] bg-[#DA8642]"
        : tone === "matureViolence"
          ? "border-[#B98A63] bg-[#B98A63]"
          : tone === "adult"
            ? "border-[#B20047] bg-[#B20047]"
            : tone === "adultViolence"
              ? "border-[#8F3E5F] bg-[#8F3E5F]"
              : "border-[#76B900] bg-[#76B900]";

  return (
    <button
      type="button"
      onClick={props.onSelect}
      disabled={props.disabled}
      className={`rounded-2xl border px-3.5 py-3 text-left transition-colors ${
        props.checked
          ? checkedClass
          : "theme-panel-soft text-[var(--theme-text)]"
      } ${props.disabled ? "opacity-60" : "theme-hover-strong"}`}
    >
      <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${
            props.type === "radio" ? "rounded-full" : "rounded-[0.25rem]"
          } ${
            props.checked
              ? indicatorClass
              : "border-[var(--theme-subtle)] bg-transparent"
          }`}
        >
          {props.checked ? (
            props.type === "checkbox" ? (
              <Check size={11} className="text-white" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-white" />
            )
          ) : null}
        </span>
        <span className="min-w-0 text-[13px] font-semibold leading-5 text-[var(--theme-title)]">
          {props.label}
        </span>
      </div>
    </button>
  );
}

type SuggestionFieldBlockProps = {
  title: string;
  subtitle: string;
  optionalText: string;
  value: string;
  suggestions: UsernameSuggestion[];
  useMyNameLabel: string;
  allowUseMyName: boolean;
  inputTourAnchor?: string;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  onUseMyName: () => void;
};

function SuggestionFieldBlock(props: SuggestionFieldBlockProps) {
  return (
    <div>
      <label className="theme-title block text-sm font-semibold">
        {props.title}:
      </label>
      <div className="theme-muted mt-1 text-sm leading-5">
        {props.subtitle}{" "}
        <span className="theme-subtle">
          ({props.optionalText})
        </span>
      </div>
      <div className="relative mt-3">
        <input
          value={props.value}
          onFocus={props.onFocus}
          onBlur={props.onBlur}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder="username"
          className="theme-input w-full rounded-xl border px-4 py-3 text-[15px] outline-none backdrop-blur-md"
          data-tour-anchor={props.inputTourAnchor}
        />
        <UsernameSuggestionList
          open={props.focused && props.suggestions.length > 0}
          suggestions={props.suggestions}
          onPick={(suggestion) =>
            props.onChange(suggestion.username || suggestion.value)
          }
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <button
          type="button"
          onClick={props.onUseMyName}
          disabled={!props.allowUseMyName}
          className={`font-semibold underline underline-offset-2 ${
            props.allowUseMyName
              ? "text-[var(--theme-info)] hover:text-[var(--theme-info-strong)]"
              : "cursor-not-allowed text-[var(--theme-subtle)] no-underline opacity-60"
          }`}
        >
          Use my name
        </button>
        <span className="theme-muted">
          ({props.useMyNameLabel})
        </span>
      </div>
    </div>
  );
}

function KeywordSuggestionList(props: {
  open: boolean;
  suggestions: string[];
  onPick: (suggestion: string) => void;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="theme-panel-strong absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border p-2 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="grid gap-2 sm:grid-cols-2">
        {props.suggestions.slice(0, 8).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              props.onPick(suggestion);
            }}
            className="theme-panel-soft theme-hover rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors"
          >
            <span className="block truncate">{suggestion}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UsernameSuggestionList(props: {
  open: boolean;
  suggestions: UsernameSuggestion[];
  onPick: (suggestion: UsernameSuggestion) => void;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="theme-panel-strong absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border p-2 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="grid gap-2 sm:grid-cols-2">
        {props.suggestions.slice(0, 8).map((suggestion) => (
          <button
            key={`${suggestion.userId}:${suggestion.username}`}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              props.onPick(suggestion);
            }}
            className="theme-panel-soft theme-hover flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
          >
            <img
              src={suggestion.avatarUrl || DEFAULT_AVATAR_URL}
              alt={suggestion.username}
              onError={(event) => {
                event.currentTarget.src = DEFAULT_AVATAR_URL;
              }}
              className="h-10 w-10 shrink-0 rounded-full border border-white/70 bg-white object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="theme-title truncate text-sm font-black">
                {suggestion.username || suggestion.value}
              </div>
              <div className="theme-muted truncate text-xs font-semibold">
                {suggestion.value}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function applyKeywordSuggestion(query: string, suggestion: string) {
  const trimmed = query.trimEnd();
  if (trimmed === "") {
    return suggestion;
  }

  const parts = trimmed.split(/\s+/);
  const lastPart = parts[parts.length - 1] ?? "";

  if (lastPart.startsWith("-")) {
    parts[parts.length - 1] = `-${suggestion}`;
  } else {
    parts[parts.length - 1] = suggestion;
  }

  return `${parts.join(" ")} `;
}

function isRatingEnabled(mask: string, index: number) {
  if (!mask) {
    return index === 0;
  }
  return mask[index] === "1";
}

function getRatingTone(index: number): ChoiceTone {
  if (index === 0) {
    return "general";
  }
  if (index === 1) {
    return "mature";
  }
  if (index === 2) {
    return "matureViolence";
  }
  if (index === 3) {
    return "adult";
  }
  return "adultViolence";
}
