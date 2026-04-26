import { useEffect, useMemo, type CSSProperties } from 'react'
import Home from '@/ui/Home'
import Player from '@/ui/Player'
import Queue from '@/ui/Queue'
import Search from '@/ui/Search'
import Settings from '@/ui/Settings'
import Sidebar from '@/ui/Sidebar'
import { usePlayerStore } from '@/state/playerStore'

const App = () => {
  const { theme, currentView } = usePlayerStore((state) => ({
    theme: state.theme,
    currentView: state.currentView,
  }))

  const currentViewComponent = useMemo(() => {
    switch (currentView) {
      case 'search':
        return <Search />
      case 'queue':
        return <Queue />
      case 'settings':
        return <Settings />
      case 'home':
      default:
        return <Home />
    }
  }, [currentView])

  useEffect(() => {
    const root = document.documentElement

    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(`--color-${key}`, value)
    }
  }, [theme])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <style>{`
        @keyframes windsound-view-enter {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.985);
            filter: blur(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
      `}</style>
      <div
        className="fixed inset-x-0 top-0 z-40 h-[18px]"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      />

      <Sidebar />

      <main className="min-h-screen pl-[264px] pr-6 pt-[22px] pb-24">
        <div
          key={currentView}
          className="min-h-[calc(100vh-110px)]"
          style={{ animation: 'windsound-view-enter 360ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        >
          {currentViewComponent}
        </div>
      </main>

      <Player />
    </div>
  )
}

export default App
