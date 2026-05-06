import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#f4ecd8",
          deep: "#ebe0c2",
          fold: "#dfd1ad",
        },
        ink: {
          DEFAULT: "#1a1612",
          soft: "#3a342c",
          fade: "#6b6253",
        },
        seal: {
          DEFAULT: "#8b1a1a",
          deep: "#5e1010",
        },
        moss: "#3d5a3d",
        rule: "#c9b894",
      },
      fontFamily: {
        display: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        body: ['"Newsreader"', "ui-serif", "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(26,22,18,0.08), 0 18px 30px -22px rgba(26,22,18,0.35)",
        stamp: "inset 0 0 0 2px #8b1a1a",
      },
      keyframes: {
        flicker: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        flicker: "flicker 1.4s ease-in-out infinite",
        rise: "rise .5s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
