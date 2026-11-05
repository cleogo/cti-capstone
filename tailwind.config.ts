import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Design tokens from docs/ui-design-report.md section 3. Used by /preview only for now.
      colors: {
        brand: '#F2C14E',
        ink: '#111111',
        paper: '#FBF8F2',
        muted: '#57534E',
        faint: '#78716C',
        link: '#92400E',
        line: '#E7E2D8',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        msgIn: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        msgInRight: { from: { opacity: '0', transform: 'translateX(8px)' }, to: { opacity: '1', transform: 'none' } },
        cardIn: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        dot: { '0%, 100%': { opacity: '0.25' }, '50%': { opacity: '1' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        grow: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
      },
      animation: {
        'msg-in': 'msgIn 220ms ease-out both',
        'msg-in-right': 'msgInRight 220ms ease-out both',
        'card-in': 'cardIn 250ms ease-out both',
        dot: 'dot 1.2s ease-in-out infinite',
        shimmer: 'shimmer 1.5s linear infinite',
        grow: 'grow 600ms ease-out 200ms both',
      },
    },
  },
  plugins: [],
};

export default config;
