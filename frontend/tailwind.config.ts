import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background:  "var(--background)",
        foreground:  "var(--foreground)",
        primary: {
          DEFAULT:   "var(--primary)",
          foreground:"var(--primary-foreground)",
        },
        secondary: {
          DEFAULT:   "var(--secondary)",
          foreground:"var(--secondary-foreground)",
        },
        muted: {
          DEFAULT:   "var(--muted)",
          foreground:"var(--muted-foreground)",
        },
        accent: {
          DEFAULT:   "var(--accent)",
          foreground:"var(--accent-foreground)",
        },
        destructive: {
          DEFAULT:   "var(--destructive)",
        },
        border:      "var(--border)",
        input:       "var(--input)",
        ring:        "var(--ring)",
        outline:     "var(--ring)",
        card: {
          DEFAULT:   "var(--card)",
          foreground:"var(--card-foreground)",
        },
        popover: {
          DEFAULT:   "var(--popover)",
          foreground:"var(--popover-foreground)",
        },

        /* Airbnb palette */
        airbnb: {
          rausch:          "#ff385c",
          "rausch-active": "#e00b41",
          "rausch-disabled":"#ffd1da",
          ink:             "#222222",
          body:            "#3f3f3f",
          muted:           "#6a6a6a",
          "muted-soft":    "#929292",
          hairline:        "#dddddd",
          "hairline-soft": "#ebebeb",
          "border-strong": "#c1c1c1",
          canvas:          "#ffffff",
          "surface-soft":  "#f7f7f7",
          "surface-card":  "#ffffff",
          "surface-strong":"#f2f2f2",
          error:           "#c13515",
        },

        /* Status colors */
        status: {
          "green-text":   "#166534",
          "green-bg":     "#dcfce7",
          "amber-text":   "#92400e",
          "amber-bg":     "#fef3c7",
          "red-text":     "#991b1b",
          "red-bg":       "#fee2e2",
          "blue-text":    "#1e40af",
          "blue-bg":      "#dbeafe",
        },
      },

      borderRadius: {
        xs:   "4px",
        sm:   "8px",
        md:   "14px",
        lg:   "20px",
        xl:   "32px",
        full: "9999px",
      },

      boxShadow: {
        card: "rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.10) 0 4px 8px",
      },

      fontFamily: {
        sans: ["Inter", "-apple-system", "system-ui", "Helvetica Neue", "sans-serif"],
      },

      fontSize: {
        "display-xl": ["28px", { lineHeight: "1.43", fontWeight: "700" }],
        "display-lg": ["22px", { lineHeight: "1.18", fontWeight: "500", letterSpacing: "-0.44px" }],
        "display-md": ["21px", { lineHeight: "1.43", fontWeight: "700" }],
        "display-sm": ["20px", { lineHeight: "1.20", fontWeight: "600", letterSpacing: "-0.18px" }],
        "title-md":   ["16px", { lineHeight: "1.25", fontWeight: "600" }],
        "title-sm":   ["16px", { lineHeight: "1.25", fontWeight: "500" }],
        "body-md":    ["16px", { lineHeight: "1.5",  fontWeight: "400" }],
        "body-sm":    ["14px", { lineHeight: "1.43", fontWeight: "400" }],
        "caption":    ["14px", { lineHeight: "1.29", fontWeight: "500" }],
        "caption-sm": ["13px", { lineHeight: "1.23", fontWeight: "400" }],
        "badge":      ["11px", { lineHeight: "1.18", fontWeight: "600" }],
        "micro":      ["12px", { lineHeight: "1.33", fontWeight: "700" }],
        "button-md":  ["16px", { lineHeight: "1.25", fontWeight: "500" }],
        "button-sm":  ["14px", { lineHeight: "1.29", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};

export default config;
