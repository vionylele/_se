/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf6', 100: '#d7f3e8', 200: '#b1e5d3', 300: '#7ccfb7', 400: '#46b398',
          500: '#249880', 600: '#177a68', 700: '#146155', 800: '#134e46', 900: '#12413b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif'],
      },
    },
  },
  plugins: [],
};
