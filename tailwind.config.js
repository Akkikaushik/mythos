/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: { 950: '#05030d', 900: '#0b0720', 800: '#140d33', 700: '#1e1449' },
        arcane: { 400: '#b48cff', 500: '#9b5cff', 600: '#7c3aed', 700: '#5b21b6' },
        volt: { 300: '#7fe7ff', 400: '#38d5ff', 500: '#0ea5ff', 600: '#0284c7' },
        aura: { 300: '#ffe58a', 400: '#ffd34d', 500: '#f5b700', 600: '#c98f00' },
        blood: { 400: '#ff5c7a', 500: '#ff2d55' },
      },
      fontFamily: {
        display: ['"Orbitron"', '"Rajdhani"', 'system-ui', 'sans-serif'],
        body: ['"Rajdhani"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 12px rgba(155,92,255,.55), 0 0 32px rgba(155,92,255,.25)',
        'glow-blue': '0 0 12px rgba(56,213,255,.6), 0 0 32px rgba(56,213,255,.25)',
        'glow-gold': '0 0 12px rgba(255,211,77,.6), 0 0 32px rgba(255,211,77,.25)',
        'glow-red': '0 0 12px rgba(255,45,85,.6), 0 0 28px rgba(255,45,85,.25)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 10px rgba(155,92,255,.45)' },
          '50%': { boxShadow: '0 0 28px rgba(56,213,255,.75)' },
        },
        slash: {
          '0%': { transform: 'translateX(-120%) skewX(-20deg)', opacity: '0' },
          '30%': { opacity: '1' },
          '100%': { transform: 'translateX(220%) skewX(-20deg)', opacity: '0' },
        },
        rise: { '0%': { transform: 'translateY(16px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-6px)' },
          '40%,80%': { transform: 'translateX(6px)' },
        },
        burst: { '0%': { transform: 'scale(.6)', opacity: '0' }, '60%': { transform: 'scale(1.08)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        slash: 'slash 2.8s ease-in-out infinite',
        rise: 'rise .45s ease-out both',
        shake: 'shake .45s ease-in-out',
        burst: 'burst .6s cubic-bezier(.2,1.4,.4,1) both',
        'spin-slow': 'spinSlow 18s linear infinite',
      },
    },
  },
  plugins: [],
};
