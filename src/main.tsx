import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createHashRouter } from 'react-router'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

import Home from '@/routes/Home'
import Game from '@/routes/Game'
import '@/index.css'

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined
if (!convexUrl) {
  throw new Error(
    'VITE_CONVEX_URL is not set. Run `npx convex dev` to create .env.local, ' +
      'or set it as a build env var in CI.',
  )
}

const convex = new ConvexReactClient(convexUrl)

// Hash routing is deliberate — GitHub Pages has no rewrite rules, so a
// browser-path deep link would 404 on refresh. See CLAUDE.md invariant 3.
const router = createHashRouter([
  { path: '/', element: <Home /> },
  { path: '/game/:code', element: <Game /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <RouterProvider router={router} />
    </ConvexProvider>
  </StrictMode>,
)
