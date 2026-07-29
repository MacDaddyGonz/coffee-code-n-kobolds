import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Navigate, RouterProvider, createHashRouter } from 'react-router'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Game from '@/routes/Game'
import Home from '@/routes/Home'
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
  { path: '*', element: <Navigate to="/" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </ConvexProvider>
  </StrictMode>,
)
