/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Mona Sans', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: '#090909',
        'surface-1': '#141414',
        'surface-2': '#1c1c1c',
        'surface-3': '#262626',
        hairline: '#262626',
        'hairline-soft': '#1a1a1a',
        ink: '#ffffff',
        'ink-muted': '#999999',
        'ink-dim': '#666666',
        accent: '#0099ff',
        'g-magenta': '#d44df0',
        'g-violet': '#6a4cf5',
        'g-orange': '#ff7a3d',
        'g-coral': '#ff5577',
        success: '#22c55e',
        danger: '#ff5577',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '15px',
        xl: '20px',
        xxl: '30px',
        pill: '100px',
      },
      letterSpacing: {
        'display-xxl': '-0.05em',
        'display-xl': '-0.05em',
        'display-lg': '-0.05em',
        'display-md': '-0.031em',
        headline: '-0.036em',
        body: '-0.01em',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: 0, transform: 'scale(0.97)' },
          '100%': { opacity: 1, transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.4, 0, 0.2, 1) both',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}
