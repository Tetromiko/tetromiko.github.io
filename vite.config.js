import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const [owner, repoName] = (process.env.GITHUB_REPOSITORY || '').split('/')
const isUserSite = Boolean(owner && repoName && repoName.toLowerCase() === `${owner.toLowerCase()}.github.io`)
const base = process.env.GITHUB_ACTIONS && repoName ? (isUserSite ? '/' : `/${repoName}/`) : '/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
})
