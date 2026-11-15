/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        serif: ["DM Serif Display", "Georgia", "Times New Roman", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
