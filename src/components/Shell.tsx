import type { ReactNode } from 'react'

/** The page frame every route sits in, so there is one owner of the layout. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 p-8">{children}</main>
  )
}
