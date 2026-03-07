import { startTransition, useEffect, useRef, useState } from 'react'

import { AccountSidebar } from './components/AccountSidebar'
import { LoginModal } from './components/LoginModal'
import { NavigationPill } from './components/NavigationPill'
import { ResultsShowcase } from './components/ResultsShowcase'
import { SearchWorkspace } from './components/SearchWorkspace'
import { StarBackground } from './components/StarBackground'
import { DownloadQueuePanel } from './components/DownloadQueuePanel'
import { DEFAULT_SEARCH, EMPTY_QUEUE, EMPTY_SESSION } from './lib/constants'
import { backend, onRuntimeEvent } from './lib/wails'
import type {
  AppSettings,
  DownloadProgressEvent,
  QueueSnapshot,
  SearchParams,
  SearchResponse,
  SessionInfo,
  SubmissionCard,
  UsernameSuggestion,
} from './lib/types'
import { GLOBAL_STYLES } from './styles/globalStyles'

export default function App() {
  const [session, setSession] = useState<SessionInfo>(EMPTY_SESSION)
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SESSION.settings)
  const [loginOpen, setLoginOpen] = useState(true)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [searchParams, setSearchParams] = useState<SearchParams>(DEFAULT_SEARCH)
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null)
  const [results, setResults] = useState<SubmissionCard[]>([])
  const [activeSubmissionId, setActiveSubmissionId] = useState('')
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([])
  const [artistSuggestions, setArtistSuggestions] = useState<UsernameSuggestion[]>([])
  const [favoriteSuggestions, setFavoriteSuggestions] = useState<UsernameSuggestion[]>([])
  const [queue, setQueue] = useState<QueueSnapshot>(EMPTY_QUEUE)
  const [queueMessage, setQueueMessage] = useState('')

  const lagTextRef = useRef<HTMLHeadingElement | null>(null)
  const requestRef = useRef<number | null>(null)
  const currentY = useRef(0)

  useEffect(() => {
    let mounted = true

    backend.getSession().then((nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setSettings(nextSession.settings)
      setSearchParams((previous) => ({
        ...previous,
        maxActive: nextSession.settings.maxActive || previous.maxActive,
      }))
      setLoginOpen(!nextSession.hasSession)
    }).catch((error: unknown) => {
      if (mounted) {
        setAuthError(error instanceof Error ? error.message : 'Unable to reach the Wails backend.')
      }
    })

    backend.getQueueSnapshot().then((snapshot) => {
      if (mounted) setQueue(snapshot)
    }).catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const unsubscribe = onRuntimeEvent<DownloadProgressEvent>('download-progress', (event) => {
      if (event.queue) {
        setQueue(event.queue)
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const animate = () => {
      if (settings.motionEnabled && lagTextRef.current) {
        const targetY = window.scrollY
        currentY.current += (targetY - currentY.current) * 0.05
        const translateY = currentY.current * 0.55
        const rotate = Math.sin(currentY.current * 0.002) * 2
        lagTextRef.current.style.transform = `translateY(${translateY}px) translateX(-2rem) rotate(${rotate}deg)`
      }
      requestRef.current = window.requestAnimationFrame(animate)
    }
    requestRef.current = window.requestAnimationFrame(animate)
    return () => {
      if (requestRef.current !== null) {
        window.cancelAnimationFrame(requestRef.current)
      }
    }
  }, [settings.motionEnabled])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const suggestionQuery = getSuggestionQuery(searchParams.query)
      if (!suggestionQuery) {
        setKeywordSuggestions([])
        return
      }
      backend.getKeywordSuggestions(suggestionQuery).then(setKeywordSuggestions).catch(() => setKeywordSuggestions([]))
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [searchParams.query])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!searchParams.artistName.trim()) {
        setArtistSuggestions([])
        return
      }
      backend.getUsernameSuggestions(searchParams.artistName).then(setArtistSuggestions).catch(() => setArtistSuggestions([]))
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [searchParams.artistName])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!searchParams.favoritesBy.trim()) {
        setFavoriteSuggestions([])
        return
      }
      backend.getUsernameSuggestions(searchParams.favoritesBy).then(setFavoriteSuggestions).catch(() => setFavoriteSuggestions([]))
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [searchParams.favoritesBy])

  async function persistSettings(partial: Partial<AppSettings>) {
    const next = { ...settings, ...partial }
    setSettings(next)
    try {
      const saved = await backend.updateSettings(next)
      setSettings(saved)
      setSession((previous) => ({
        ...previous,
        settings: saved,
        effectiveTheme: saved.darkMode ? 'dark' : 'light',
      }))
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Unable to save settings.')
    }
  }

  async function handleLogin() {
    setAuthLoading(true)
    setAuthError('')
    try {
      const nextSession = await backend.login(loginUsername, loginPassword)
      setSession(nextSession)
      setSettings(nextSession.settings)
      setSearchParams((previous) => ({ ...previous, maxActive: nextSession.settings.maxActive || previous.maxActive }))
      setLoginOpen(false)
      setLoginPassword('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login failed.')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    try {
      const nextSession = await backend.logout()
      setSession(nextSession)
      setSettings(nextSession.settings)
      setLoginOpen(true)
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Logout failed.')
    }
  }

  async function handleSearch(page = 1) {
    if (!session.hasSession) {
      setSearchError('Sign in to search.')
      setLoginOpen(true)
      return
    }
    setSearchLoading(true)
    setSearchError('')
    try {
      const response = page === 1
        ? await backend.search({ ...searchParams, page, maxActive: settings.maxActive })
        : await backend.loadMoreResults(searchResponse?.searchId ?? '', page)
      setSession(response.session)
      setSettings(response.session.settings)
      startTransition(() => {
        setSearchResponse(response)
        if (page === 1) {
          setResults(response.results)
          setSelectedSubmissionIds(response.results.map((item) => item.submissionId))
          setActiveSubmissionId(response.results[0]?.submissionId ?? '')
        } else {
          setResults((previous) => [...previous, ...response.results])
          setSelectedSubmissionIds((previous) => [
            ...previous,
            ...response.results.map((item) => item.submissionId).filter((id) => !previous.includes(id)),
          ])
          if (!activeSubmissionId && response.results[0]) {
            setActiveSubmissionId(response.results[0].submissionId)
          }
        }
      })
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed.')
    } finally {
      setSearchLoading(false)
    }
  }

  async function handleQueueDownloads() {
    if (!searchResponse || selectedSubmissionIds.length === 0) {
      return
    }
    setQueueMessage('')
    try {
      const snapshot = await backend.enqueueDownloads(
        searchResponse.searchId,
        {
          submissions: selectedSubmissionIds.map((submissionId) => ({ submissionId })),
        },
        {
          saveKeywords: searchParams.saveKeywords,
          maxActive: settings.maxActive,
          downloadDirectory: settings.downloadDirectory,
        },
      )
      setQueue(snapshot)
      setQueueMessage(`Queued ${selectedSubmissionIds.length} submission${selectedSubmissionIds.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : 'Failed to queue downloads.')
    }
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-300 mobile-zoom ${settings.darkMode ? 'dark' : ''} ${
        !settings.motionEnabled ? 'motion-reduced' : ''
      }`}
    >
      <style>{GLOBAL_STYLES}</style>
      <StarBackground darkMode={settings.darkMode} motionEnabled={settings.motionEnabled} />

      <div className="text-[#2D2D44] dark:text-[#E0BBE4] min-h-screen overflow-x-hidden font-sans selection:bg-[#FFB7B2] selection:text-white transition-colors duration-300">
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none select-none z-0">
          <h1
            ref={lagTextRef}
            className="font-teko text-[12rem] md:text-[20rem] leading-none opacity-12 dark:opacity-[0.07] text-[#FFB7B2] dark:text-[#73D216] transform translate-x-[-2rem] tracking-tight will-change-transform"
            style={{ transform: 'translateY(0) translateX(-2rem)' }}
          >
            BUNNY
          </h1>
        </div>

        <NavigationPill
          darkMode={settings.darkMode}
          motionEnabled={settings.motionEnabled}
          session={session}
          onToggleDarkMode={() => void persistSettings({ darkMode: !settings.darkMode })}
          onToggleMotion={() => void persistSettings({ motionEnabled: !settings.motionEnabled })}
          onOpenLogin={() => setLoginOpen(true)}
          onLogout={() => void handleLogout()}
        />

        <LoginModal
          open={loginOpen}
          session={session}
          username={loginUsername}
          password={loginPassword}
          loading={authLoading}
          error={authError}
          onChangeUsername={setLoginUsername}
          onChangePassword={setLoginPassword}
          onClose={() => setLoginOpen(false)}
          onSubmit={() => void handleLogin()}
        />

        <main className="relative z-10 pt-18 md:pt-32 max-w-[1560px] mx-auto pb-20 px-4 md:px-8 space-y-10">
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SearchWorkspace
              session={session}
              searchParams={searchParams}
              keywordSuggestions={keywordSuggestions}
              artistSuggestions={artistSuggestions}
              favoriteSuggestions={favoriteSuggestions}
              loading={searchLoading}
              error={searchError}
              onChange={(updater) => setSearchParams((previous) => updater(previous))}
              onSearch={() => void handleSearch(1)}
            />
            <AccountSidebar
              session={session}
              settings={settings}
              searchParams={searchParams}
              onPickDirectory={() =>
                void backend
                  .pickDownloadDirectory()
                  .then((directory) => {
                    if (directory) {
                      void persistSettings({ downloadDirectory: directory })
                    }
                  })
                  .catch((error: unknown) => {
                    setQueueMessage(error instanceof Error ? error.message : 'Could not open folder picker.')
                  })
              }
              onToggleSaveKeywords={(checked) =>
                setSearchParams((previous) => ({ ...previous, saveKeywords: checked }))
              }
            />
          </div>

          <ResultsShowcase
            searchResponse={searchResponse}
            results={results}
            activeSubmissionId={activeSubmissionId}
            selectedSubmissionIds={selectedSubmissionIds}
            loading={searchLoading}
            onSelectActive={setActiveSubmissionId}
            onToggleSelection={(submissionId) =>
              setSelectedSubmissionIds((previous) =>
                previous.includes(submissionId)
                  ? previous.filter((value) => value !== submissionId)
                  : [...previous, submissionId],
              )}
            onQueueDownloads={() => void handleQueueDownloads()}
            onLoadMore={() => void handleSearch((searchResponse?.page ?? 1) + 1)}
          />

          <DownloadQueuePanel
            queue={queue}
            message={queueMessage}
            onCancel={(jobId) => {
              backend.cancelDownload(jobId).then(setQueue).catch(() => undefined)
            }}
          />
        </main>
      </div>
    </div>
  )
}

function getSuggestionQuery(query: string) {
  const trimmed = query.trimEnd()
  if (!trimmed) {
    return ''
  }

  const token = trimmed.split(/\s+/).pop() ?? ''
  return token.startsWith('-') ? token.slice(1) : token
}
