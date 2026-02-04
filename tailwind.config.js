/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'pgm-dark': '#2c3e50',
        'pgm-navy': '#2c3e50',
        'pgm-navy-light': '#34495e',
        'pgm-bg': '#f8f9fa',
        'pgm-white': '#ffffff',
        'pgm-gray': '#f3f4f6',
        'pgm-border': '#e0e4e8',
        'pgm-accent': '#3498db',
        'pgm-live': '#e74c3c',
        'pgm-standby': '#f39c12',
        'pgm-text': '#2c3e50',
        'pgm-text-secondary': '#7f8c8d',
        'pgm-text-muted': '#95a5a6',
        'pgm-success': '#27ae60',
      }
    },
  },
  plugins: [],
}
