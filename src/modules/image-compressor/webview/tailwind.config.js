/** @type {import("tailwindcss").Config} */
import Typography from "@tailwindcss/typography";
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./src/**/index.html"],
  theme: {
    extend: {},
  },
  plugins: [Typography],
};
