import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = {
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}

export default config
