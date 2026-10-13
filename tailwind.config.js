/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 语义色，来自 :root / .dark 下的 CSS 变量（HSL 通道）
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        elevated: 'hsl(var(--elevated) / <alpha-value>)',
        fg: 'hsl(var(--fg) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        faint: 'hsl(var(--faint) / <alpha-value>)',
        line: 'hsl(var(--line) / <alpha-value>)',
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          soft: 'hsl(var(--accent-soft) / <alpha-value>)',
          fg: 'hsl(var(--accent-fg) / <alpha-value>)'
        },
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)'
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI Variable Text"',
          '"Segoe UI"', '"PingFang SC"', '"HarmonyOS Sans SC"', '"MiSans"',
          '"Microsoft YaHei UI"', '"Microsoft YaHei"', '"Noto Sans CJK SC"', 'system-ui', 'sans-serif'
        ],
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', '"Songti SC"', '"STSong"', 'serif'],
        mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: {
        'display': ['clamp(2.4rem, 6vw, 4rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }]
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem'
      },
      boxShadow: {
        float: '0 12px 36px -14px rgba(0,0,0,0.5), 0 2px 8px -2px rgba(0,0,0,0.28)',
        marker: '0 3px 12px -2px rgba(0,0,0,0.45)',
        glow: '0 0 0 4px hsl(var(--accent) / 0.18)'
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 hsl(var(--accent) / 0.35)' },
          '70%': { boxShadow: '0 0 0 12px hsl(var(--accent) / 0)' },
          '100%': { boxShadow: '0 0 0 0 hsl(var(--accent) / 0)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease both',
        'pulse-ring': 'pulse-ring 2s ease-out infinite'
      }
    }
  },
  plugins: []
}
