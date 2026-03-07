import { LoaderCircle, Search as SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { DEFAULT_AVATAR_URL, FIND_OPTIONS, ORDER_OPTIONS, RATING_OPTIONS, TIME_OPTIONS, TYPE_OPTIONS } from '../lib/constants'
import type { SearchParams, SessionInfo, UsernameSuggestion } from '../lib/types'

type SearchWorkspaceProps = {
  session: SessionInfo
  searchParams: SearchParams
  keywordSuggestions: string[]
  artistSuggestions: UsernameSuggestion[]
  favoriteSuggestions: UsernameSuggestion[]
  loading: boolean
  error: string
  onChange: (updater: (previous: SearchParams) => SearchParams) => void
  onSearch: () => void
}

type SuggestionField = 'query' | 'artistName' | 'favoritesBy' | null

export function SearchWorkspace(props: SearchWorkspaceProps) {
  const [focusedField, setFocusedField] = useState<SuggestionField>(null)
  const canUseMyName = props.session.hasSession && !props.session.isGuest && props.session.username !== ''
  const anyTypeSelected = props.searchParams.submissionTypes.length === 0

  const ratingRows = useMemo(
    () =>
      RATING_OPTIONS.map((option) => ({
        ...option,
        enabled: props.session.ratingsMask[option.index] === '1',
      })),
    [props.session.ratingsMask],
  )

  return (
    <section className="relative overflow-hidden rounded-toy-lg border-4 border-[#89CFF0]/20 bg-gray-50/50 p-4 backdrop-blur-xl dark:bg-[#2D2D44]/50 sm:p-6 lg:p-7">
      <div className="pointer-events-none absolute inset-0 opacity-10 mix-blend-multiply dark:mix-blend-overlay bg-[radial-gradient(circle_at_top_right,rgba(115,210,22,0.8),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,183,178,0.8),transparent_22%)]" />
      <div className="relative z-10 overflow-hidden rounded-toy border-2 border-white/45 bg-white/48 dark:border-white/8 dark:bg-[#18142E]/52">
        <div className="border-b border-[#2D2D44]/10 px-5 py-4 dark:border-white/10 sm:px-6">
          <h2 className="font-display text-3xl font-black text-[#2D2D44] dark:text-white sm:text-[2.1rem]">Search</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#2D2D44]/70 dark:text-white/70">
            Search as a member or continue with guest access. Session ratings are applied automatically.
          </p>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid gap-4 lg:grid-cols-[132px_minmax(0,1fr)] lg:items-start">
            <FieldLabel title="Search words" subtitle="optional" />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative min-w-0">
                <input
                  value={props.searchParams.query}
                  onFocus={() => setFocusedField('query')}
                  onBlur={() => window.setTimeout(() => setFocusedField((current) => (current === 'query' ? null : current)), 100)}
                  onChange={(event) => props.onChange((previous) => ({ ...previous, query: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      props.onSearch()
                    }
                  }}
                  placeholder="wolf synthwave -feral"
                  className="w-full rounded-2xl border border-white/60 bg-white/85 px-4 py-3 text-[15px] text-[#2D2D44] shadow-inner outline-none focus:border-[#73D216] dark:border-white/10 dark:bg-[#1A1733]/88 dark:text-white"
                />
                <KeywordSuggestionList
                  open={focusedField === 'query' && props.keywordSuggestions.length > 0}
                  suggestions={props.keywordSuggestions}
                  onPick={(suggestion) =>
                    props.onChange((previous) => ({
                      ...previous,
                      query: applyKeywordSuggestion(previous.query, suggestion),
                    }))
                  }
                />
              </div>
              <button
                onClick={props.onSearch}
                disabled={props.loading}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl border-b-8 border-[#1a516b] bg-[#2A7FA6] px-5 py-3.5 text-sm font-black text-white shadow-xl transition-all hover:bg-[#1e5f7e] sm:w-32 ${
                  props.loading ? 'opacity-70' : ''
                }`}
              >
                {props.loading ? <LoaderCircle className="animate-spin" size={18} /> : <SearchIcon size={18} />}
                Search
              </button>
              <div className="text-sm leading-6 text-[#2D2D44]/70 dark:text-white/70 sm:col-span-2">
                Separate words with spaces. Use <span className="font-black">-</span> to exclude a keyword, for example{' '}
                <span className="font-black">leopard -snow</span>. Avoid punctuation and words such as “and”, “or”, and “not”.
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
                  onSelect={() => props.onChange((previous) => ({ ...previous, joinType: option.value }))}
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
              focused={focusedField === 'artistName'}
              onFocus={() => setFocusedField('artistName')}
              onBlur={() => window.setTimeout(() => setFocusedField((current) => (current === 'artistName' ? null : current)), 100)}
              onChange={(value) => props.onChange((previous) => ({ ...previous, artistName: value }))}
              onUseMyName={() => props.onChange((previous) => ({ ...previous, artistName: props.session.username }))}
            />
            <SuggestionFieldBlock
              title="Search favorites by"
              subtitle="Search only work favorited by this user"
              optionalText="optional"
              value={props.searchParams.favoritesBy}
              suggestions={props.favoriteSuggestions}
              useMyNameLabel="Search my favorites only"
              allowUseMyName={canUseMyName}
              focused={focusedField === 'favoritesBy'}
              onFocus={() => setFocusedField('favoritesBy')}
              onBlur={() => window.setTimeout(() => setFocusedField((current) => (current === 'favoritesBy' ? null : current)), 100)}
              onChange={(value) => props.onChange((previous) => ({ ...previous, favoritesBy: value }))}
              onUseMyName={() => props.onChange((previous) => ({ ...previous, favoritesBy: props.session.username }))}
            />
          </div>

          <SectionDivider />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-center">
                <FieldLabel title="Time Range" />
                <select
                  value={props.searchParams.timeRangeDays}
                  onChange={(event) => props.onChange((previous) => ({ ...previous, timeRangeDays: Number(event.target.value) }))}
                  className="w-full max-w-xs rounded-xl border border-[#2D2D44]/15 bg-white/85 px-4 py-2.5 text-sm text-[#2D2D44] outline-none focus:border-[#73D216] dark:border-white/10 dark:bg-[#1A1733]/88 dark:text-white"
                >
                  {TIME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
                <FieldLabel title="Content rated" subtitle="based on the current session" />
                <div className="space-y-2.5">
                  {ratingRows.map((rating) => (
                    <ReadonlyChoiceRow key={rating.label} checked={rating.enabled} label={rating.label} />
                  ))}
                  <div className="pt-1 text-sm font-semibold text-[#3465A4] dark:text-[#89CFF0]">
                    Ratings follow the current Inkbunny session.
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:border-l xl:border-[#2D2D44]/10 xl:pl-6 xl:dark:border-white/10">
              <FieldLabel title="Submission type" />
              <div className="space-y-3">
                <ChoiceCard
                  type="radio"
                  checked={anyTypeSelected}
                  label="Any"
                  onSelect={() => props.onChange((previous) => ({ ...previous, submissionTypes: [] }))}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {TYPE_OPTIONS.map((option) => {
                    const selected = props.searchParams.submissionTypes.includes(option.value)
                    return (
                      <ChoiceCard
                        key={option.value}
                        type="checkbox"
                        checked={selected}
                        label={option.label}
                        onSelect={() =>
                          props.onChange((previous) => {
                            const nextTypes = selected
                              ? previous.submissionTypes.filter((value) => value !== option.value)
                              : [...previous.submissionTypes, option.value].sort((a, b) => a - b)
                            return {
                              ...previous,
                              submissionTypes: nextTypes,
                            }
                          })
                        }
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <SectionDivider />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-sm font-bold text-[#2D2D44] dark:text-white">Order by</span>
                <select
                  value={props.searchParams.orderBy}
                  onChange={(event) => props.onChange((previous) => ({ ...previous, orderBy: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-[#2D2D44]/15 bg-white/85 px-4 py-2.5 text-sm text-[#2D2D44] outline-none focus:border-[#73D216] dark:border-white/10 dark:bg-[#1A1733]/88 dark:text-white"
                >
                  {ORDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-[#2D2D44] dark:text-white">Results per page</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={props.searchParams.perPage}
                  onChange={(event) => props.onChange((previous) => ({ ...previous, perPage: Number(event.target.value) || 24 }))}
                  className="mt-2 w-full rounded-xl border border-[#2D2D44]/15 bg-white/85 px-4 py-2.5 text-sm text-[#2D2D44] outline-none focus:border-[#73D216] dark:border-white/10 dark:bg-[#1A1733]/88 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-[#2D2D44] dark:text-white">Maximum files</span>
                <input
                  type="number"
                  min={0}
                  value={props.searchParams.maxDownloads}
                  onChange={(event) => props.onChange((previous) => ({ ...previous, maxDownloads: Number(event.target.value) || 0 }))}
                  className="mt-2 w-full rounded-xl border border-[#2D2D44]/15 bg-white/85 px-4 py-2.5 text-sm text-[#2D2D44] outline-none focus:border-[#73D216] dark:border-white/10 dark:bg-[#1A1733]/88 dark:text-white"
                />
              </label>
            </div>
            <button
              onClick={props.onSearch}
              disabled={props.loading}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl border-b-8 border-[#1a516b] bg-[#2A7FA6] px-6 py-3.5 text-sm font-black text-white shadow-xl transition-all hover:bg-[#1e5f7e] xl:w-40 ${
                props.loading ? 'opacity-70' : ''
              }`}
            >
              {props.loading ? <LoaderCircle className="animate-spin" size={18} /> : <SearchIcon size={18} />}
              Search
            </button>
          </div>
        </div>
      </div>

      {props.error ? (
        <div className="relative z-10 mt-5 rounded-toy border-2 border-[#FFB7B2]/70 bg-[#FFB7B2]/20 px-5 py-4 text-sm font-bold text-[#CC5E00]">
          {props.error}
        </div>
      ) : null}
    </section>
  )
}

function FieldLabel(props: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-[#2D2D44] dark:text-white">{props.title}:</div>
      {props.subtitle ? <div className="mt-1 text-xs font-medium text-[#2D2D44]/45 dark:text-white/45">{props.subtitle}</div> : null}
    </div>
  )
}

function SectionDivider() {
  return <div className="border-t border-[#2D2D44]/10 dark:border-white/10" />
}

function ChoiceCard(props: { type: 'radio' | 'checkbox'; checked: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`rounded-2xl border px-3.5 py-3 text-left transition-colors ${
        props.checked
          ? 'border-[#FF34A5]/80 bg-[#FF34A5]/10 text-[#2D2D44] dark:text-white'
          : 'border-[#2D2D44]/10 bg-white/55 text-[#2D2D44]/85 dark:border-white/10 dark:bg-[#1A1733]/40 dark:text-white/85'
      }`}
    >
      <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 h-4 w-4 shrink-0 border-2 ${
            props.type === 'radio' ? 'rounded-full' : 'rounded-[0.25rem]'
          } ${props.checked ? 'border-[#FF34A5] bg-[#FF34A5]' : 'border-[#2D2D44]/30 bg-transparent dark:border-white/35'}`}
        />
        <span className="min-w-0 text-[13px] font-semibold leading-5">{props.label}</span>
      </div>
    </button>
  )
}

function ReadonlyChoiceRow(props: { checked: boolean; label: string }) {
  return (
    <label className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 text-sm font-semibold text-[#2D2D44] dark:text-white/90">
      <input type="checkbox" checked={props.checked} readOnly className="mt-0.5 h-4 w-4 accent-[#FF34A5]" />
      <span className="min-w-0 leading-5">{props.label}</span>
    </label>
  )
}

type SuggestionFieldBlockProps = {
  title: string
  subtitle: string
  optionalText: string
  value: string
  suggestions: UsernameSuggestion[]
  useMyNameLabel: string
  allowUseMyName: boolean
  focused: boolean
  onFocus: () => void
  onBlur: () => void
  onChange: (value: string) => void
  onUseMyName: () => void
}

function SuggestionFieldBlock(props: SuggestionFieldBlockProps) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#2D2D44] dark:text-white">{props.title}:</label>
      <div className="mt-1 text-sm leading-5 text-[#2D2D44]/65 dark:text-white/65">
        {props.subtitle} <span className="text-[#2D2D44]/45 dark:text-white/45">({props.optionalText})</span>
      </div>
      <div className="relative mt-3">
        <input
          value={props.value}
          onFocus={props.onFocus}
          onBlur={props.onBlur}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder="username"
          className="w-full rounded-xl border border-[#2D2D44]/15 bg-white/85 px-4 py-3 text-[15px] text-[#2D2D44] outline-none focus:border-[#73D216] dark:border-white/10 dark:bg-[#1A1733]/88 dark:text-white"
        />
        <UsernameSuggestionList open={props.focused && props.suggestions.length > 0} suggestions={props.suggestions} onPick={(suggestion) => props.onChange(suggestion.username || suggestion.value)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <button
          onClick={props.onUseMyName}
          disabled={!props.allowUseMyName}
          className={`font-semibold underline underline-offset-2 ${
            props.allowUseMyName
              ? 'text-[#3465A4] hover:text-[#204A87] dark:text-[#89CFF0] dark:hover:text-white'
              : 'cursor-not-allowed text-[#2D2D44]/35 no-underline dark:text-white/30'
          }`}
        >
          Use my name
        </button>
        <span className="text-[#2D2D44]/65 dark:text-white/65">({props.useMyNameLabel})</span>
      </div>
    </div>
  )
}

function KeywordSuggestionList(props: { open: boolean; suggestions: string[]; onPick: (suggestion: string) => void }) {
  if (!props.open) {
    return null
  }

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-[#2D2D44]/12 bg-white/96 shadow-[0_18px_40px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-[#1A1733]/96">
      {props.suggestions.slice(0, 8).map((suggestion) => (
        <button
          key={suggestion}
          onMouseDown={(event) => {
            event.preventDefault()
            props.onPick(suggestion)
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#2D2D44] hover:bg-[#89CFF0]/16 dark:text-white dark:hover:bg-white/8"
        >
          <span className="truncate">{suggestion}</span>
          <span className="ml-3 text-xs font-black uppercase tracking-[0.16em] text-[#3465A4] dark:text-[#89CFF0]">Select</span>
        </button>
      ))}
    </div>
  )
}

function UsernameSuggestionList(props: { open: boolean; suggestions: UsernameSuggestion[]; onPick: (suggestion: UsernameSuggestion) => void }) {
  if (!props.open) {
    return null
  }

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-[#2D2D44]/12 bg-white/96 shadow-[0_18px_40px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-[#1A1733]/96">
      {props.suggestions.slice(0, 8).map((suggestion) => (
        <button
          key={`${suggestion.userId}:${suggestion.username}`}
          onMouseDown={(event) => {
            event.preventDefault()
            props.onPick(suggestion)
          }}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#89CFF0]/16 dark:hover:bg-white/8"
        >
          <img
            src={suggestion.avatarUrl || DEFAULT_AVATAR_URL}
            alt={suggestion.username}
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR_URL
            }}
            className="h-10 w-10 shrink-0 rounded-full border border-white/70 bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-[#2D2D44] dark:text-white">{suggestion.username || suggestion.value}</div>
            <div className="truncate text-xs font-semibold text-[#2D2D44]/60 dark:text-white/60">{suggestion.value}</div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#3465A4] dark:text-[#89CFF0]">Select</span>
        </button>
      ))}
    </div>
  )
}

function applyKeywordSuggestion(query: string, suggestion: string) {
  const trimmed = query.trimEnd()
  if (trimmed === '') {
    return suggestion
  }

  const parts = trimmed.split(/\s+/)
  const lastPart = parts[parts.length - 1] ?? ''

  if (lastPart.startsWith('-')) {
    parts[parts.length - 1] = `-${suggestion}`
  } else {
    parts[parts.length - 1] = suggestion
  }

  return `${parts.join(' ')} `
}
