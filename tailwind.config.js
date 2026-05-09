/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        brand: {
          dark: '#0B1120',
          blue: '#2563EB',
          light: '#F8FAFC',
          accent: '#06B6D4'
        }
      }
    }
  },
  plugins: []
}
