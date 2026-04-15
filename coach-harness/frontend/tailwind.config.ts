import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#090d17",
        foreground: "#e2e8f0",
        card: "#101826",
        border: "#23314d",
        primary: "#4f8cff",
        muted: "#8da0c4"
      }
    }
  },
  plugins: []
} satisfies Config;
