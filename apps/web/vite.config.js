import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

const RELAY = process.env.RELAY_URL ?? "http://localhost:4331"

// One origin in production (Express serves dist), so dev proxies /ws and
// /healthz instead of the client knowing two hosts.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5178,
    strictPort: true,
    proxy: {
      "/ws": { target: RELAY, ws: true },
      "/healthz": { target: RELAY },
    },
  },
})
