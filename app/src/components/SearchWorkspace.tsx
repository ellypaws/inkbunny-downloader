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
      <div className="pointer-events-none absolute inset-0 opacity-10 mix-blend-multiply dark:mix-blend-overlay bg-[radial-gradient(circle_at_top_right,rgba(115,210,22,0.8),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,183,178,0.8),transparent_22%)]" />
      <div className="relative z-10 overflow-hidden rounded-toy-sm border border-[#bcc1b5]/90 bg-[#eff1ea]/92 shadow-pop backdrop-blur-xl dark:border-[#4a5360]/90 dark:bg-[#252a31]/88">
        <button
          type="button"
          onClick={props.onToggleCollapse}
          className="group flex w-full items-center justify-between border-b border-[#c2c7bc] px-5 py-4 text-left transition-colors hover:bg-white/35 dark:border-[#4a5360] dark:hover:bg-white/4 sm:px-6"
          aria-expanded={!props.collapsed}
        >
          <div>
            <h2 className="font-display text-3xl font-black text-[#4E9A06] dark:text-[#8AE234] sm:text-[2.1rem]">
              Search
            </h2>
          </div>
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-[#c2c7bc] bg-[#f7f8f2]/92 text-[#3465A4] shadow-sm backdrop-blur-md transition-all duration-300 group-hover:scale-105 group-hover:bg-white dark:border-[#4a5360] dark:bg-[#1f252b]/88 dark:text-[#89CFF0] ${
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
                      className="w-full rounded-2xl border border-[#bcc1b5] bg-[#f8f8f4]/92 px-4 py-3 text-[15px] text-[#333333] shadow-inner outline-none backdrop-blur-md focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b]/86 dark:text-white"
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
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl border-b-8 border-[#1a516b] bg-[#2A7FA6] px-5 py-3.5 text-sm font-black text-white shadow-xl transition-all hover:bg-[#1e5f7e] sm:w-32 ${
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
                  <div className="text-sm leading-6 text-[#555753] dark:text-white/70 sm:col-span-2">
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
                      className="w-full max-w-xs rounded-xl border border-[#bcc1b5] bg-[#f8f8f4]/92 px-4 py-2.5 text-sm text-[#333333] outline-none backdrop-blur-md focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b]/86 dark:text-white"
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
                        <div className="text-sm font-semibold text-[#555753] dark:text-white/60">
                          Updating ratings...
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:border-l xl:border-[#c2c7bc] xl:pl-6 xl:dark:border-[#4a5360]">
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
                    <span className="text-sm font-bold text-[#2D2D44] dark:text-white">
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
                      className="mt-2 w-full rounded-xl border border-[#bcc1b5] bg-[#f8f8f4]/92 px-4 py-2.5 text-sm text-[#333333] outline-none backdrop-blur-md focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b]/86 dark:text-white"
                    >
                      {ORDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-[#2D2D44] dark:text-white">
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
                      placeholder="24"
                      className="mt-2 w-full rounded-xl border border-[#bcc1b5] bg-[#f8f8f4]/92 px-4 py-2.5 text-sm text-[#333333] outline-none backdrop-blur-md focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b]/86 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-[#2D2D44] dark:text-white">
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
                      className="mt-2 w-full rounded-xl border border-[#bcc1b5] bg-[#f8f8f4]/92 px-4 py-2.5 text-sm text-[#333333] outline-none backdrop-blur-md focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b]/86 dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-[#2D2D44] dark:text-white">
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
                      className="mt-2 w-full rounded-xl border border-[#bcc1b5] bg-[#f8f8f4]/92 px-4 py-2.5 text-sm text-[#333333] outline-none backdrop-blur-md focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b]/86 dark:text-white"
                    />
                  </label>
                  <label className="block 2xl:col-span-2">
                    <span className="text-sm font-bold text-[#2D2D44] dark:text-white">
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
                      className="mt-2 w-full rounded-xl border border-[#bcc1b5] bg-[#f8f8f4]/92 px-4 py-2.5 text-sm text-[#333333] outline-none backdrop-blur-md focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b]/86 dark:text-white"
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
                  className={`flex w-full items-center justify-center gap-2 rounded-2xl border-b-8 border-[#1a516b] bg-[#2A7FA6] px-6 py-3.5 text-sm font-black text-white shadow-xl transition-all hover:bg-[#1e5f7e] xl:w-40 xl:self-end ${
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
        <div className="relative z-10 mt-5 rounded-toy border border-[#dba37d] bg-[#f4d8c6]/92 px-5 py-4 text-sm font-bold text-[#CC5E00] shadow-sm backdrop-blur-md dark:border-[#7b5639] dark:bg-[#4b3226]/92 dark:text-[#ffb07c]">
          {props.error}
        </div>
      ) : null}
    </section>
  );
}

function FieldLabel(props: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-[#333333] dark:text-white">
        {props.title}:
      </div>
      {props.subtitle ? (
        <div className="mt-1 text-xs font-medium text-[#555753] dark:text-white/45">
          {props.subtitle}
        </div>
      ) : null}
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-[#c2c7bc] dark:border-[#4a5360]" />;
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
      ? "border-[#76B900]/70 bg-[#76B900]/10 text-[#333333] dark:border-[#8AE234] dark:bg-[#8AE234]/12 dark:text-white"
      : tone === "mature"
        ? "border-[#DA8642]/70 bg-[#DA8642]/10 text-[#333333] dark:border-[#DA8642] dark:bg-[#DA8642]/12 dark:text-white"
        : tone === "matureViolence"
          ? "border-[#B98A63]/70 bg-[#B98A63]/10 text-[#333333] dark:border-[#B98A63] dark:bg-[#B98A63]/12 dark:text-white"
        : tone === "adult"
          ? "border-[#B20047]/70 bg-[#B20047]/10 text-[#333333] dark:border-[#B20047] dark:bg-[#B20047]/12 dark:text-white"
          : tone === "adultViolence"
            ? "border-[#8F3E5F]/70 bg-[#8F3E5F]/10 text-[#333333] dark:border-[#8F3E5F] dark:bg-[#8F3E5F]/12 dark:text-white"
          : "border-[#76B900]/70 bg-[#76B900]/10 text-[#333333] dark:border-[#8AE234] dark:bg-[#8AE234]/12 dark:text-white";
  const indicatorClass =
    tone === "general"
      ? "border-[#76B900] bg-[#76B900] dark:border-[#8AE234] dark:bg-[#8AE234]"
      : tone === "mature"
        ? "border-[#DA8642] bg-[#DA8642]"
        : tone === "matureViolence"
          ? "border-[#B98A63] bg-[#B98A63]"
        : tone === "adult"
          ? "border-[#B20047] bg-[#B20047]"
          : tone === "adultViolence"
            ? "border-[#8F3E5F] bg-[#8F3E5F]"
          : "border-[#76B900] bg-[#76B900] dark:border-[#8AE234] dark:bg-[#8AE234]";

  return (
    <button
      type="button"
      onClick={props.onSelect}
      disabled={props.disabled}
      className={`rounded-2xl border px-3.5 py-3 text-left transition-colors ${
        props.checked
          ? checkedClass
          : "border-[#c2c7bc] bg-[#f7f8f2]/88 text-[#333333]/85 dark:border-[#4a5360] dark:bg-[#1f252b]/65 dark:text-white/85"
      } ${props.disabled ? "opacity-60" : "hover:bg-white/80 dark:hover:bg-white/8"}`}
    >
      <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${
            props.type === "radio" ? "rounded-full" : "rounded-[0.25rem]"
          } ${
            props.checked
              ? indicatorClass
              : "border-[#7d8576] bg-transparent dark:border-[#697384]"
          }`}
        >
          {props.checked ? (
            props.type === "checkbox" ? (
              <Check size={11} className="text-white dark:text-[#14112C]" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-white dark:bg-[#14112C]" />
            )
          ) : null}
        </span>
        <span className="min-w-0 text-[13px] font-semibold leading-5">
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
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  onUseMyName: () => void;
};

function SuggestionFieldBlock(props: SuggestionFieldBlockProps) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#333333] dark:text-white">
        {props.title}:
      </label>
      <div className="mt-1 text-sm leading-5 text-[#555753] dark:text-white/65">
        {props.subtitle}{" "}
        <span className="text-[#555753] dark:text-white/45">
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
          className="w-full rounded-xl border border-[#bcc1b5] bg-[#f8f8f4]/92 px-4 py-3 text-[15px] text-[#333333] outline-none backdrop-blur-md focus:border-[#76B900] dark:border-[#4a5360] dark:bg-[#1f252b]/86 dark:text-white"
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
              ? "text-[#3465A4] hover:text-[#204A87] dark:text-[#89CFF0] dark:hover:text-white"
              : "cursor-not-allowed text-[#555753]/35 no-underline dark:text-white/30"
          }`}
        >
          Use my name
        </button>
        <span className="text-[#555753] dark:text-white/65">
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
    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-[#bcc1b5] bg-[#f8f8f4]/92 p-2 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:border-[#4a5360] dark:bg-[#1f252b]/92">
      <div className="grid gap-2 sm:grid-cols-2">
        {props.suggestions.slice(0, 8).map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              props.onPick(suggestion);
            }}
            className="rounded-xl bg-white/82 px-4 py-3 text-left text-sm font-semibold text-[#333333] transition-colors hover:bg-[#dce8cf] dark:bg-[#20262d]/88 dark:text-white dark:hover:bg-[#2a323a]"
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
    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-2xl border border-[#bcc1b5] bg-[#f8f8f4]/92 p-2 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:border-[#4a5360] dark:bg-[#1f252b]/92">
      <div className="grid gap-2 sm:grid-cols-2">
        {props.suggestions.slice(0, 8).map((suggestion) => (
          <button
            key={`${suggestion.userId}:${suggestion.username}`}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              props.onPick(suggestion);
            }}
            className="flex items-center gap-3 rounded-xl bg-white/82 px-4 py-3 text-left transition-colors hover:bg-[#dce8cf] dark:bg-[#20262d]/88 dark:hover:bg-[#2a323a]"
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
              <div className="truncate text-sm font-black text-[#333333] dark:text-white">
                {suggestion.username || suggestion.value}
              </div>
              <div className="truncate text-xs font-semibold text-[#555753] dark:text-white/60">
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
