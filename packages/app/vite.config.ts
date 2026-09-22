import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/colon": {
        target: process.env.COLONY_SERVER_URL ?? "http://127.0.0.1:4244",
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
