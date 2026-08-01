"use client"

// ⚠️ NAME COLLISION, AND IT IS THE ONE THING TO KNOW ABOUT THIS FILE.
//
// shadcn calls a slide-out drawer a "Sheet". This application's whole subject
// matter is *character sheets*. So `Sheet` here means the drawer and nothing else,
// and every domain component that renders one is named `CharacterSheet*` —
// `CharacterSheetDrawer`, `CharacterSheetView`, `CharacterSheetEditor` — so that a
// reader is never left wondering which sense of the word an identifier is in. The
// primitives below keep shadcn's names on purpose rather than being renamed to
// something like `Drawer`: the day this set is updated from upstream, a file that
// has quietly diverged in naming is a merge nobody can review.
//
// Built on Radix's Dialog, exactly as ui/dialog.tsx is, and deliberately as close a
// sibling to it as the behaviour allows — same import style, same `data-slot`
// values, same close button. The differences are that this one is pinned to an edge
// and slides, and that the content is a scrolling column rather than a centred box.

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Which edge the panel is pinned to.
 *
 * Only the two horizontal edges, because a panel that is a tall column of fields is
 * what this application needs one for. Top and bottom are in upstream shadcn and are
 * left out here rather than carried unused: an untested code path in a shared
 * primitive is worse than an absent one.
 *
 * ⚠️ **Since the DM's tools became a tab in a persistent right-hand panel, `left` is
 * the only side with a caller** — `CharacterSheetDrawer`, which is pinned there
 * precisely because that panel owns the right-hand edge of the screen. So the
 * argument above now points at `right` too, and it is worth answering rather than
 * leaving it standing over a line it would delete.
 *
 * **`right` stays, and the difference from top and bottom is that it is the
 * *default*.** `SheetContent`'s signature says `side = "right"`, matching upstream,
 * so removing the entry does not remove a code path — it forces the default to become
 * `left`, which is a silent change to what every future `<SheetContent>` written
 * without a side does, in a primitive this file's opening comment says is kept close
 * to upstream so that the next update from it is a merge somebody can review. Top and
 * bottom could be dropped for free because nothing could reach them by accident. This
 * one is reached by omission, which is the opposite property.
 */
const SIDE_CLASSES = {
  right:
    "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm data-open:slide-in-from-right data-closed:slide-out-to-right",
  left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm data-open:slide-in-from-left data-closed:slide-out-to-left",
} as const

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof SIDE_CLASSES
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          // A flex column with no padding of its own: the header and the body each
          // set their own, so the body can scroll under a header that stays put.
          // Slower than the dialog's 100ms because a slide across a third of the
          // screen at that speed reads as a jump rather than as a movement.
          "fixed z-50 flex flex-col gap-0 bg-background text-sm shadow-lg outline-none duration-200 data-open:animate-in data-closed:animate-out",
          SIDE_CLASSES[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute top-2 right-2" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 border-b p-4 pr-12", className)}
      {...props}
    />
  )
}

/**
 * Sticks to the bottom edge rather than scrolling away with the content. A form
 * this tall has its Save button below the fold on any screen otherwise, and a
 * control you have to scroll to find is one people assume is missing.
 */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex flex-col gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
