import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The bounded-height column a tab body has to be.
 *
 * ⚠️ **Load-bearing rather than tidy, and worth six lines for that reason alone.**
 * `CharacterSheetEditor` is written as the body and footer of a *fixed-height* flex
 * column — its fields claim `flex-1` and scroll inside it, and Save is pinned to the
 * bottom, because a Save button below the fold of a long form is the failure that
 * arrangement exists to prevent. That contract used to be invisible: the only thing
 * supplying it was a string of Tailwind classes on the slide-out drawer the editor
 * happened to be mounted in, so it worked by being lucky about its surroundings. The
 * drawer has since gone, which is the point rather than a footnote — the contract
 * outlived the component that was accidentally honouring it. This is the same
 * contract with a name on it, and every tab gets it whether it needs it or not so
 * that the one that does cannot be the odd one out.
 *
 * `h-full` is what actually bounds it, not `flex-1`. The `TabsContent` above is
 * deliberately **block-level** — see `RightPane` for the `[hidden]` trap that keeps it
 * that way — so there is no flex container for `flex-1` to be an item of, and the
 * height comes from the parent's own definite height instead. `flex-1` stays for the
 * day something mounts a `TabPane` in a flex column, where it is the right answer.
 */
export function TabPane({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex h-full min-h-0 flex-1 flex-col', className)}>{children}</div>
}

/**
 * The scrolling body inside a `TabPane` — what almost every tab actually wants.
 *
 * `TabPane` bounds the height; this is the region that fills it and scrolls. They are
 * two elements rather than one because the Character tab needs them apart:
 * `CharacterSheetEditor` supplies its *own* scrolling body and pins a footer below it,
 * so it takes the bounded column and brings the rest.
 *
 * Extracted because every tab had written the same four classes out by hand and the
 * padding had **already drifted** — three tabs at `p-3`, one at `p-4` — so switching
 * from Character to Table shifted the whole panel's inset by four pixels with nothing
 * else changed. That is the `ROW_SIZES` / `PANEL_BODY` bar exactly: a class string
 * repeated across files with nothing to notice when one copy wanders. `gap` stays at
 * the call site, because how far apart a tab's own cards sit is a real difference
 * between tabs rather than an accident.
 */
export function TabBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto p-3', className)}>
      {children}
    </div>
  )
}
