import { useEffect, type CSSProperties } from 'react'
import Home from '@/ui/Home'
import Player from '@/ui/Player'
import Search from '@/ui/Search'
import Settings from '@/ui/Settings'
import Sidebar from '@/ui/Sidebar'
import { usePlayerStore } from '@/state/playerStore'

const App = () => {
  const { theme, currentView } = usePlayerStore((state) => ({
    theme: state.theme,
    currentView: state.currentView,
  }))
  const activeView = currentView === 'queue' ? 'home' : currentView

  useEffect(() => {
    const root = document.documentElement

    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value)
    })
  }, [theme])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div
        className="fixed inset-x-0 top-0 z-40 h-[18px]"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      />

      <Sidebar />

      <main className="min-h-screen pl-[264px] pr-6 pt-[22px] pb-24">
        <div className={activeView === 'home' ? 'block' : 'hidden'}>
          <Home />
        </div>
        <div className={activeView === 'search' ? 'block' : 'hidden'}>
          <Search />
        </div>
        <div className={activeView === 'settings' ? 'block' : 'hidden'}>
          <Settings />
        </div>
      </main>

      <Player />
    </div>
  )
}

export default App
