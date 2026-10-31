/** @type {import('tailwindcss').Config} */
// Design tokens (src/ui/tokens.css) as Tailwind names: bg-surface, text-fg-3,
// border-line, bg-brand, text-danger-fg, rounded-lg, shadow-lg, font-mono …
// Tailwind's own palette stays available for screens not yet migrated.
const tone = (name) => ({ fg: `var(--${name}-fg)`, bg: `var(--${name}-bg)`, line: `var(--${name}-line)`, solid: `var(--${name}-solid)` })

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        fg: { DEFAULT: 'var(--fg)', 2: 'var(--fg-2)', 3: 'var(--fg-3)', 4: 'var(--fg-4)' },
        brand: { DEFAULT: 'var(--brand)', hover: 'var(--brand-hover)', soft: 'var(--brand-soft)', fg: 'var(--brand-fg)' },
        accent: 'var(--accent)',
        success: tone('success'),
        warning: tone('warning'),
        danger: tone('danger'),
        info: tone('info'),
        neutral: tone('neutral'),
        nav: { bg: 'var(--nav-bg)', fg: 'var(--nav-fg)', strong: 'var(--nav-fg-strong)' },
      },
      fontFamily: {
        sans: ['Geist Variable', 'Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Geist Mono Variable', 'Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        lg: 'var(--shadow-lg)',
      },
      ringColor: {
        DEFAULT: 'var(--ring)',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(.2, .8, .2, 1)',
      },
    },
  },
  plugins: [],
}
