import { ImageOffIcon, MapIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { PublicScene } from '@convex/lib/scenes'

export type BoardEmptyProps = {
  /** Null when the game has no active scene at all. */
  scene: PublicScene | null
  /**
   * Which sentence to show, and nothing more. Whether the reader can actually do
   * anything about it is settled by the DM code on every mutation they attempt, so
   * a player who forced this to true would win a different paragraph and no powers.
   */
  isDm: boolean
  className?: string
}

/**
 * What the board shows instead of a map: either the DM has not put one up yet, or a
 * scene is active but its image has gone.
 *
 * Worth telling apart. The first is the normal state of a game five minutes before
 * it starts and needs no alarm. The second should never happen — a storage blob
 * deleted from under a live scene — and if it is read as the first, the DM will sit
 * waiting for their own map to appear.
 */
export function BoardEmpty({ scene, isDm, className }: BoardEmptyProps) {
  const missingImage = scene !== null && scene.imageUrl === null

  return (
    <div className={cn('flex h-full w-full items-center justify-center p-8', className)}>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {missingImage ? <ImageOffIcon aria-hidden /> : <MapIcon aria-hidden />}
            {missingImage ? `“${scene.name}” has lost its image` : 'No map on the table yet'}
          </CardTitle>
          <CardDescription>
            {missingImage
              ? 'The scene is still here, but the image file behind it is gone.'
              : 'Nothing is on the board until the DM makes a scene active.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          {missingImage
            ? isDm
              ? 'Upload the map again to put it back. The grid and every token stay exactly where they were.'
              : 'Your DM will need to put it back. Nothing of yours has been lost.'
            : isDm
              ? 'Upload a map in the DM panel and it appears here, and on every player’s screen, at once.'
              : 'It will appear here on its own — there is nothing you need to do or refresh.'}
        </CardContent>
      </Card>
    </div>
  )
}
