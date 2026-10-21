import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        customerHive: {
          surface: "#f7f9ff",
          "on-surface": "#1F2328",
          "on-surface-variant": "#4A525C",
          "on-surface-muted": "#6B737D",
          secondary: "#286fe8",
          border: "#E3E6EA",
        },
        hive: {
          page: "var(--hive-color-page)",
          surface: "var(--hive-color-surface)",
          border: "var(--hive-color-border)",
          text: "var(--hive-color-text)",
          "text-muted": "var(--hive-color-text-muted)",
        },
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "Segoe UI", "sans-serif"],
        brand: ["var(--font-outfit)", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        hive: "var(--hive-radius-md)",
        "hive-xl": "var(--hive-radius-xl)",
      },
    },
  },
  plugins: [],
};

export default config;
