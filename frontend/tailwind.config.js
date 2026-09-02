/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        chatgpt: {
          main: '#212121',
          sidebar: '#171717',
          card: '#2f2f2f',
          hover: '#383838',
          border: '#303030',
          text: '#ececec',
          muted: '#b4b4b4',
          accent: '#10a37f'
        }
      }
    },
  },
  plugins: [],
}
