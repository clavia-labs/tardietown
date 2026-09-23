import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.TOWN_UI_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api/": {
        target: process.env.TOWN_SERVER_URL ?? `http://127.0.0.1:${process.env.TOWN_PORT ?? 4244}`,
        changeOrigin: false
      }
    }
  },
  build: {
    rolldownOptions: {
      input: {
        app: "index.html",
        duck: "playgrounds/duck.html",
        grid: "playgrounds/grid.html",
        characters: "playgrounds/characters.html"
      }
    }
  }
})
