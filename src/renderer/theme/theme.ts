import type { ThemeConfig } from '@/types'

export const themePresets: ThemeConfig[] = [
  {
    id: 'dark-modern',
    label: 'Dark Modern',
    colors: {
      bg: '#0d0d0d',
      surface: '#161616',
      surface2: '#1f1f1f',
      border: '#2a2a2a',
      accent: '#7c3aed',
      accent2: '#9f5cf7',
      text: '#f5f5f5',
      subtext: '#737373',
      waveform: '#8b5cf6',
    },
  },
  {
    id: 'midnight-blue',
    label: 'Midnight Blue',
    colors: {
      bg: '#09111f',
      surface: '#0f1a2d',
      surface2: '#16233b',
      border: '#243454',
      accent: '#3b82f6',
      accent2: '#60a5fa',
      text: '#eff6ff',
      subtext: '#93a8c5',
      waveform: '#4f8cff',
    },
  },
  {
    id: 'forest-dark',
    label: 'Forest Dark',
    colors: {
      bg: '#0b120f',
      surface: '#131d18',
      surface2: '#1a2821',
      border: '#2a3b32',
      accent: '#22c55e',
      accent2: '#4ade80',
      text: '#ecfdf5',
      subtext: '#89a89a',
      waveform: '#34d399',
    },
  },
  {
    id: 'crimson',
    label: 'Crimson',
    colors: {
      bg: '#14090c',
      surface: '#1d1014',
      surface2: '#28161c',
      border: '#41232d',
      accent: '#ef4444',
      accent2: '#fb7185',
      text: '#fff1f2',
      subtext: '#c7a3aa',
      waveform: '#f87171',
    },
  },
]

export const defaultTheme = themePresets[0]
