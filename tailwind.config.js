/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d0d',
        surface: '#161616',
        surface2: '#1f1f1f',
        border: '#2a2a2a',
        accent: '#7c3aed',
        text: '#f5f5f5',
        subtext: '#737373',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}