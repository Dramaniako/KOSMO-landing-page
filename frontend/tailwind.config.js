/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0D5C3A',
          hover: '#09452B',
          light: '#E8F5EE',
          dark: '#073622',
        },
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#0D5C3A',
          900: '#09452B',
          950: '#042819',
        },
      },
    },
  },
  plugins: [],
};
