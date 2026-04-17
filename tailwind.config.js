/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        paper: {
          DEFAULT: '#F6F1E8',
          deep: '#EFE8D8',
        },
        ink: {
          DEFAULT: '#0E0E0E',
          soft: '#1F1F1F',
          mid: '#4A4A4A',
          lo: '#7A7570',
          mute: '#A8A39B',
        },
        line: {
          DEFAULT: '#E2DBC9',
          2: '#D3CAB3',
        },
        brand: {
          red: '#C8102E',
          'red-deep': '#9A0B23',
          'red-ink': '#FFE4E8',
          'red-chrome': '#FF5468',
          teal: '#00B2A9',
          'teal-deep': '#006A65',
          'teal-ink': '#E6F7F5',
          gold: '#F6EB61',
          'gold-deep': '#C8B22E',
          'gold-ink': '#5A4E0F',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.06), 0 4px 12px -4px rgba(0,0,0,0.08)',
        'card-hover': '0 1px 2px rgba(0,0,0,0.06), 0 8px 20px -6px rgba(0,0,0,0.12)',
        'red-glow': '0 1px 2px rgba(0,0,0,0.06), 0 30px 60px -28px rgba(200,16,46,0.45)',
      },
    },
  },
  plugins: [],
}
