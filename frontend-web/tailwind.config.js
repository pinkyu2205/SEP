/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5', // Indigo 600 - Main Brand
          700: '#4338CA',
          800: '#3730A3',
        },
        accent: {
          400: '#22D3EE',
          500: '#06B6D4', // Cyan 500
          600: '#0891B2',
        }
      }
    },
  },
  plugins: [],
}
