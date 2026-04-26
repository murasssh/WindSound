import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronRight, Cog, Home, Library, Search } from 'lucide-react'
import { connectYouTubeAccount, disconnectYouTubeAccount, getAccountStatus } from '@/integrations/youtube'
import { usePlayerStore } from '@/state/playerStore'
import type { AppView } from '@/types'

const NAV_ITEMS: Array<{ id: AppView; label: string; icon: typeof Search }> = [
  { id: 'home', label: 'Inicio', icon: Home },
  { id: 'search', label: 'Buscar', icon: Search },
  { id: 'queue', label: 'Playlists', icon: Library },
]

const makeAvatarFallback = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ea4335"/><stop offset="0.34" stop-color="#fbbc05"/><stop offset="0.68" stop-color="#34a853"/><stop offset="1" stop-color="#4285f4"/></linearGradient></defs><circle cx="60" cy="60" r="56" fill="url(#g)"/><text x="50%" y="54%" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700" text-anchor="middle" dominant-baseline="middle">${label.slice(0, 1).toUpperCase()}</text></svg>`,
  )}`

const makeTrackFallback = (label: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="22" fill="#1b1b1f"/><text x="50%" y="50%" fill="#f4f4f5" font-family="Inter, Arial, sans-serif" font-size="20" letter-spacing="4" text-anchor="middle" dominant-baseline="middle">${label.slice(0, 12).toUpperCase()}</text></svg>`,
  )}`

const Sidebar = () => {
  const [isConnecting, setIsConnecting] = useState(false)
  const [showDisconnectHint, setShowDisconnectHint] = useState(false)
  const { currentView, setCurrentView, accountStatus, setAccountStatus, queue, currentIndex, playFromQueue } =
    usePlayerStore((state) => ({
      currentView: state.currentView,
      setCurrentView: state.setCurrentView,
      accountStatus: state.accountStatus,
      setAccountStatus: state.setAccountStatus,
      queue: state.queue,
      currentIndex: state.currentIndex,
      playFromQueue: state.playFromQueue,
    }))

  useEffect(() => {
    let cancelled = false

    getAccountStatus()
      .then((status) => {
        if (!cancelled) {
          setAccountStatus(status)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [setAccountStatus])

  const handleConnect = async () => {
    setIsConnecting(true)

    try {
      const status = await connectYouTubeAccount()
      setAccountStatus(status)
      setShowDisconnectHint(false)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setIsConnecting(true)

    try {
      const status = await disconnectYouTubeAccount()
      setAccountStatus(status)
    } finally {
      setIsConnecting(false)
    }
  }

  const displayName = accountStatus.displayName || (accountStatus.connected ? 'Conta do YouTube' : 'Entrar com Google')
  const avatarSrc = useMemo(
    () => accountStatus.avatarUrl || makeAvatarFallback(displayName),
    [accountStatus.avatarUrl, displayName],
  )
  const waitingQueue = useMemo(() => queue.slice(Math.max(currentIndex + 1, 0), currentIndex + 4), [currentIndex, queue])

  return (
    <aside className="fixed left-4 top-[18px] flex h-[calc(100vh-26px)] w-[232px] flex-col rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_92%,transparent)] px-3 py-4 backdrop-blur-xl">
      <div className="mb-6 flex justify-center px-2">
        <img
          src="/branding/windsound-wordmark-full-cropped.png"
          alt="WindSound"
          draggable={false}
          className="h-auto max-h-[50px] w-full object-contain object-center"
          style={{ WebkitUserDrag: 'none', userSelect: 'none' } as CSSProperties}
        />
      </div>

      <nav className="space-y-1.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = currentView === id

          return (
            <button
              key={id}
              type="button"
              onClick={() => setCurrentView(id)}
              className={`flex w-full items-center gap-3 rounded-[8px] border px-3.5 py-3 text-left text-[13px] transition duration-150 ${
                active
                  ? 'border-[color:color-mix(in_srgb,var(--color-accent)_65%,var(--color-border)_35%)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface)_90%)] text-[var(--color-text)]'
                  : 'border-transparent bg-transparent text-[var(--color-subtext)] hover:border-[color:color-mix(in_srgb,var(--color-text)_8%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--color-surface2)_88%,transparent)] hover:text-[var(--color-text)]'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      <section className="mt-5 min-h-0 flex-1 overflow-hidden px-1 py-1">
        <div className="mb-3 flex items-center gap-2 px-1 text-[10px] uppercase tracking-[0.2em] text-[var(--color-subtext)]">
          <span className="inline-flex h-4 w-4 shrink-0 items-end gap-[2px]">
            <span
              className="w-[2px] rounded-full bg-[color:color-mix(in_srgb,var(--color-accent)_82%,white_18%)]"
              style={{ height: '8px', transformOrigin: 'bottom', animation: 'windsound-spin 1.2s ease-in-out infinite' }}
            />
            <span
              className="w-[2px] rounded-full bg-[color:color-mix(in_srgb,var(--color-accent)_70%,white_30%)]"
              style={{ height: '12px', transformOrigin: 'bottom', animation: 'windsound-spin 1.2s ease-in-out 0.15s infinite' }}
            />
            <span
              className="w-[2px] rounded-full bg-[color:color-mix(in_srgb,var(--color-accent)_82%,white_18%)]"
              style={{ height: '6px', transformOrigin: 'bottom', animation: 'windsound-spin 1.2s ease-in-out 0.3s infinite' }}
            />
          </span>
          <span>Lista de espera</span>
          <span
            className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--color-accent)_55%,white_45%)]"
            style={{ animation: 'windsound-twinkle 1.8s ease-in-out infinite' }}
          />
        </div>

        {waitingQueue.length > 0 ? (
          <div className="space-y-1.5 overflow-y-auto pr-1">
            {waitingQueue.map((track, index) => {
              const queueIndex = currentIndex + index + 1

              return (
                <button
                  key={`${track.videoId}-${queueIndex}`}
                  type="button"
                  onClick={() => playFromQueue(queueIndex)}
                  className="flex w-full items-center gap-3 rounded-[8px] px-2 py-2 text-left transition duration-150 hover:bg-[color:color-mix(in_srgb,var(--color-text)_4%,transparent)]"
                >
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className="h-10 w-10 shrink-0 rounded-[6px] object-cover"
                    onError={(event) => {
                      event.currentTarget.onerror = null
                      event.currentTarget.src = makeTrackFallback(track.title)
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-[var(--color-text)]">{track.title}</p>
                    <p className="truncate text-[10px] text-[var(--color-subtext)]">{track.channelTitle}</p>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="px-2 py-3 text-[11px] leading-5 text-[var(--color-subtext)]">
            As proximas faixas vao aparecer aqui assim que voce comecar uma fila.
          </div>
        )}
      </section>

      <div className="px-1 pt-5">
        <button
          type="button"
          onClick={() => setCurrentView('settings')}
          className={`mb-3 flex w-full items-center gap-3 rounded-[8px] border px-3.5 py-3 text-left text-[13px] transition duration-150 ${
            currentView === 'settings'
              ? 'border-[color:color-mix(in_srgb,var(--color-accent)_65%,var(--color-border)_35%)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface)_90%)] text-[var(--color-text)]'
              : 'border-transparent bg-transparent text-[var(--color-subtext)] hover:border-[color:color-mix(in_srgb,var(--color-text)_8%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--color-surface2)_88%,transparent)] hover:text-[var(--color-text)]'
          }`}
        >
          <Cog size={18} strokeWidth={2.2} className="shrink-0" />
          <span>Configuracoes</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowDisconnectHint(false)
            void handleConnect()
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            if (accountStatus.connected) {
              setShowDisconnectHint((current) => !current)
            }
          }}
          disabled={isConnecting}
          className="flex w-full min-w-0 items-center gap-3 rounded-[8px] px-1 py-2 text-left transition duration-150 hover:bg-[color:color-mix(in_srgb,var(--color-text)_4%,transparent)]"
        >
          <img
            src={avatarSrc}
            alt={displayName}
            referrerPolicy="no-referrer"
            className="h-12 w-12 shrink-0 rounded-full object-cover"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = makeAvatarFallback(displayName)
            }}
          />
          <p className="min-w-0 flex-1 px-1 text-left text-[13px] font-medium leading-5 text-[var(--color-text)] break-words">
            {displayName}
          </p>
          <ChevronRight size={16} className="shrink-0 text-[var(--color-subtext)]" />
        </button>

        {accountStatus.connected && showDisconnectHint ? (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={isConnecting}
            className="mt-2 inline-flex items-center gap-1 rounded-[8px] px-2 py-2 text-[11px] text-rose-300 transition duration-150 hover:bg-[color:color-mix(in_srgb,#fb7185_12%,transparent)]"
          >
            <span>Sair</span>
          </button>
        ) : null}
      </div>
    </aside>
  )
}

export default Sidebar
