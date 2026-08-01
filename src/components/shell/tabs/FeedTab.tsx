import type { ReactElement } from "react";
import { ScrollTextIcon } from "lucide-react";

/**
 * Where the game feed will be.
 *
 * The tab is here and empty on purpose. The feed needs a home before it can be built,
 * and building it into a floating panel of its own first would mean moving it here
 * afterwards — which is the whole argument for settling the screen before the dice
 * land. There is no feed table, no query and nothing to subscribe to yet, so this is
 * a sentence and not a skeleton: a skeleton promises something is loading.
 */
export function FeedTab(): ReactElement {
  return (
    <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <ScrollTextIcon aria-hidden className="size-6" />
      <p className="text-sm">
        Rolls, damage and everything else that happens at the table will appear
        here.
      </p>
      <p className="text-xs">Nothing rolls dice yet.</p>
    </div>
  );
}
