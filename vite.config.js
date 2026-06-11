import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      'departure-exploring-extortion.ngrok-free.dev',
      'localhost',
      '127.0.0.1',
      'spfy.spfy03.icu'
    ]
  }
})
