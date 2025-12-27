import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()], // Removed mkcert to use plain HTTP
  server: {
    // https: true, // Disabled HTTPS to avoid mixed content with HTTP backend
    host: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.trycloudflare.com', // Allow all Cloudflare tunnel domains
      '.ngrok.io',          // Allow ngrok domains
      '.ngrok-free.app',    // Allow newer ngrok domains
    ],
  },
})
