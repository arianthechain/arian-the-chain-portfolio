import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        ink: {
          950: "#0a0b14",
          900: "#11131f",
          800: "#181b2c",
          700: "#222640",
          600: "#2d3251",
        },
        gold: {
          400: "#d4af37",
          500: "#b8932e",
          600: "#9a7a26",
        },
      },
      animation: {
        "holo-spin": "holo-spin 6s linear infinite",
        "fade-in": "fade-in 0.6s ease-out forwards",
      },
      keyframes: {
        "holo-spin": {
          "0%": { "--angle": "0deg" },
          "100%": { "--angle": "360deg" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
