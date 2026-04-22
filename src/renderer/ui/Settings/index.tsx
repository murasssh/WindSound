import { RotateCcw } from 'lucide-react'
import { themePresets } from '@/theme/theme'
import { usePlayerStore } from '@/state/playerStore'
import type { QualityOption, ThemeTokens } from '@/types'

const COLOR_FIELDS: Array<{ key: keyof ThemeTokens; label: string }> = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'surface2', label: 'Surface Hover' },
  { key: 'border', label: 'Border' },
  { key: 'accent', label: 'Accent' },
  { key: 'accent2', label: 'Accent Hover' },
  { key: 'text', label: 'Text' },
  { key: 'subtext', label: 'Subtext' },
  { key: 'waveform', label: 'Waveform' },
]

const QUALITY_OPTIONS: QualityOption[] = ['auto', 'small', 'medium', 'large', 'hd720']

const Settings = () => {
  const {
    theme,
    setTheme,
    updateThemeColor,
    resetTheme,
    showVideo,
    setShowVideo,
    autoPlayNext,
    setAutoPlayNext,
    quality,
    setQuality,
  } = usePlayerStore((state) => ({
    theme: state.theme,
    setTheme: state.setTheme,
    updateThemeColor: state.updateThemeColor,
    resetTheme: state.resetTheme,
    showVideo: state.showVideo,
    setShowVideo: state.setShowVideo,
    autoPlayNext: state.autoPlayNext,
    setAutoPlayNext: state.setAutoPlayNext,
    quality: state.quality,
    setQuality: state.setQuality,
  }))

  return (
    <section className="space-y-6">
      <div className="rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-7">
        <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--color-subtext)]">ThemeEngine</p>
        <h2 className="mt-3 text-[22px] font-semibold text-[var(--color-text)]">Ajustes visuais e playback</h2>
        <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--color-subtext)]">
          Modo InnerTube ativo por padrao. A interface salva tema, fila e preferencias no localStorage.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[var(--color-text)]">Presets</h3>
            <button
              type="button"
              onClick={resetTheme}
              className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--color-border)] px-4 py-2 text-[13px] text-[var(--color-text)] transition duration-150 hover:scale-[0.98] hover:border-[var(--color-accent)]"
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
                className={`rounded-[10px] p-4 text-left transition duration-150 ${
                  theme.id === preset.id
                    ? 'bg-[color:color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface2)_86%)]'
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
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {COLOR_FIELDS.map(({ key, label }) => (
              <label key={key} className="rounded-[10px] bg-[var(--color-bg)] p-4">
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">{label}</span>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="color"
                    value={theme.colors[key]}
                    onChange={(event) => updateThemeColor(key, event.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-[8px] bg-transparent"
                  />
                  <code className="text-[13px] text-[var(--color-text)]">{theme.colors[key]}</code>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-6">
            <h3 className="text-[15px] font-semibold text-[var(--color-text)]">Playback</h3>
            <div className="mt-5 space-y-4">
              <label className="flex items-center justify-between rounded-[10px] bg-[var(--color-bg)] px-4 py-4 text-[13px] text-[var(--color-text)]">
                <span>Mostrar video junto ao audio</span>
                <input type="checkbox" checked={showVideo} onChange={(event) => setShowVideo(event.target.checked)} />
              </label>

              <label className="flex items-center justify-between rounded-[10px] bg-[var(--color-bg)] px-4 py-4 text-[13px] text-[var(--color-text)]">
                <span>Auto-play da proxima faixa</span>
                <input
                  type="checkbox"
                  checked={autoPlayNext}
                  onChange={(event) => setAutoPlayNext(event.target.checked)}
                />
              </label>

              <label className="block rounded-[10px] bg-[var(--color-bg)] p-4">
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-subtext)]">
                  Qualidade preferida
                </span>
                <select
                  value={quality}
                  onChange={(event) => setQuality(event.target.value as QualityOption)}
                  className="mt-3 w-full rounded-[8px] bg-[var(--color-surface)] px-4 py-3 text-[13px] text-[var(--color-text)] outline-none"
                >
                  {QUALITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_94%,transparent)] p-6">
            <h3 className="text-[15px] font-semibold text-[var(--color-text)]">Status da integracao</h3>
            <div className="mt-4 space-y-3 text-[13px] leading-6 text-[var(--color-subtext)]">
              <p>InnerTube/YouTube Music habilitado sem necessidade de chave de API.</p>
              <p>A vinculacao da conta agora fica acessivel direto na barra lateral.</p>
              <p>Preset atual: {theme.label}</p>
              <p>Base visual carregada a partir do preset Dark Modern como fallback.</p>
            </div>

            {/* TODO: PKCE flow, endpoint /me/player */}
            {/* TODO: interface Plugin { name, init(store), destroy() } */}
          </div>
        </div>
      </div>

      <div className="rounded-[12px] bg-[color:color-mix(in_srgb,var(--color-surface)_84%,transparent)] p-6 text-[13px] leading-6 text-[var(--color-subtext)]">
        <p>Sem API key manual: a busca usa InnerTube para metadados e descoberta.</p>
        <p>O player embutido segue via YouTube IFrame API para manter a reproducao estavel no desktop.</p>
      </div>
    </section>
  )
}

export default Settings
