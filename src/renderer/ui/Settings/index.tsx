import { MonitorPlay, RotateCcw, Sparkles } from 'lucide-react'
import { themePresets } from '@/theme/theme'
import { usePlayerStore } from '@/state/playerStore'

const checkboxClass =
  'h-5 w-5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]'

const Settings = () => {
  const { theme, setTheme, resetTheme, autoPlayNext, setAutoPlayNext } = usePlayerStore((state) => ({
    theme: state.theme,
    setTheme: state.setTheme,
    resetTheme: state.resetTheme,
    autoPlayNext: state.autoPlayNext,
    setAutoPlayNext: state.setAutoPlayNext,
  }))

  return (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[14px] bg-[color:color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[color:color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-[var(--color-accent)]">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-[var(--color-text)]">Temas</h3>
              <p className="mt-1 text-[13px] text-[var(--color-subtext)]">
                Os temas prontos seguem a identidade visual do app.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetTheme}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] px-4 py-2 text-[13px] text-[var(--color-text)] transition duration-150 hover:scale-[0.98] hover:border-[var(--color-accent)]"
          >
            <RotateCcw size={14} />
            Resetar
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {themePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setTheme(preset)}
              className={`rounded-[12px] border border-transparent p-4 text-left transition duration-150 ${
                theme.id === preset.id
                  ? 'border-[color:color-mix(in_srgb,var(--color-accent)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface2)_86%)]'
                  : 'bg-[var(--color-bg)] hover:bg-[var(--color-surface2)]'
              }`}
            >
              <p className="text-[15px] font-medium text-[var(--color-text)]">{preset.label}</p>
              <div className="mt-4 flex gap-2">
                {Object.values(preset.colors)
                  .slice(0, 5)
                  .map((color) => (
                    <span
                      key={`${preset.id}-${color}`}
                      className="h-6 w-6 rounded-full border border-white/5"
                      style={{ backgroundColor: color }}
                    />
                  ))}
              </div>
              {theme.id === preset.id ? (
                <p className="mt-4 text-[12px] font-medium text-[var(--color-accent)]">Tema ativo</p>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[14px] bg-[color:color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[color:color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-[var(--color-accent)]">
            <MonitorPlay size={18} />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--color-text)]">Reprodução</h3>
            <p className="mt-1 text-[13px] text-[var(--color-subtext)]">
              Essas opções afetam o comportamento real do player.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-[12px] bg-[var(--color-bg)] px-4 py-4 text-[13px] text-[var(--color-text)]">
            <div>
              <p className="font-medium text-[var(--color-text)]">Tocar a próxima faixa automaticamente</p>
              <p className="mt-1 text-[12px] text-[var(--color-subtext)]">
                Quando a música acabar, o WindSound avança sozinho para a próxima.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoPlayNext}
              onChange={(event) => setAutoPlayNext(event.target.checked)}
              className={checkboxClass}
            />
          </label>
        </div>
      </div>
    </section>
  )
}

export default Settings
