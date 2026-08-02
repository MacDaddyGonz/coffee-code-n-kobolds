import type { ReactElement, ReactNode } from 'react'
import { useId, useState } from 'react'
import { useMutation } from 'convex/react'

import { FieldError } from '@/components/FieldError'
import { UploadPicker } from '@/components/UploadPicker'
import { LAYER_ALERT_TITLES, LayerChoice } from '@/components/board/dm/LayerChoice'
import type { TokenAppearanceDraft } from '@/components/board/dm/TokenAppearanceFields'
import {
  TokenAppearanceFields,
  isUsableAppearance,
} from '@/components/board/dm/TokenAppearanceFields'
import { TokenControlPanel } from '@/components/board/dm/TokenControlPanel'
import { TokenSwatch } from '@/components/board/dm/TokenSwatch'
import { useLobbyAction } from '@/components/lobby/useLobbyAction'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { useUpload } from '@/hooks/useUpload'
import { parseNumber } from '@/lib/utils'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { PublicToken } from '@convex/lib/board'
import type { PublicCharacter } from '@convex/lib/characters'
import { MAX_TOKEN_SQUARES, MIN_TOKEN_SQUARES } from '@convex/lib/grid'
import type { TokenLayer } from '@convex/lib/layers'
import type { CharacterGroup } from '@convex/lib/sheet'
import { CHARACTER_GROUPS, CHARACTER_GROUP_LABELS } from '@convex/lib/sheet'

/**
 * What a coin bound to a character whose row is *not* in the roster is called.
 *
 * ⚠️ **One spelling, and both readers of it are the same state.** A binding with no
 * character behind it should be unreachable — `characters.remove` detaches every token
 * pointing at the character it deletes — so it means the two subscriptions are momentarily
 * out of step. The Tokens tab prints this under the coin's name and the select below shows
 * it as the current option, because the alternative there is a `<select>` whose value
 * matches no option, which browsers draw as *Bound to nothing*: the one answer that is
 * definitely wrong.
 */
export const MISSING_SHEET = 'A sheet that is no longer there'

/**
 * The value of the select's *nothing* option.
 *
 * The empty string rather than a `__`-prefixed sentinel, because unlike
 * `TokenAddDialog`'s `NEW_CREATURE` and `FROM_BESTIARY` this is not a fourth mode hiding
 * in a select of ids — it is the real answer *bound to nothing*, and it maps onto the one
 * value `board.setCharacter` takes for it. A `<select>`'s value is a string, so the
 * comparison happens before anything is treated as an id, and `''` can never collide with
 * a Convex id.
 */
const UNBOUND = ''

export type TokenEditPanelProps = {
  code: string
  /** Present means this browser holds it; every mutation below re-verifies it server-side. */
  dmCode: string
  /** The coin being edited. Every field below is read off this payload, never derived. */
  token: PublicToken
  /**
   * Every character in the game, filed under the heading the *server* chose — handed down
   * from the tab rather than subscribed again here, because the tab is already holding
   * `characters.list` for the captions on its rows and this is one cache entry either way.
   * `group` is the server's answer and is not computable in the browser: it means reading
   * the corpus category of the bestiary entry a creature points at, and the corpus is
   * deliberately not in the bundle (CLAUDE.md invariant 8).
   */
  byGroup: Record<CharacterGroup, PublicCharacter[]>
  /**
   * What this coin stands for, **already resolved**, or null when it stands for nothing.
   *
   * ⚠️ **Resolved by the tab and not here, because the tab holds the map.** It builds a
   * `Map` of every character by id for the caption on every row, so it has already answered
   * this question for the selected coin by the time this panel mounts; re-deriving it here
   * meant flattening `byGroup` into a fresh array and scanning it, per render, for an answer
   * one hop up was a hash lookup. It also left the iterate-the-union discipline
   * (CLAUDE.md invariant 9) written twice for one question.
   *
   * Null covers two states deliberately, and nothing below distinguishes them: bound to
   * nothing, and bound to a row that is momentarily missing — see `MISSING_SHEET`. Every
   * control here reads `token.characterId` off the payload rather than this, so there is
   * nothing either state could make them do differently.
   */
  bound: PublicCharacter | null
  /** True until that list has arrived. The select is a skeleton in the meantime. */
  loading: boolean
}

/**
 * Everything about one coin, for the person running the game.
 *
 * **Four mutations, one per kind of fact, and the split is `convex/board.ts`'s rather than
 * this panel's.** `updateToken` writes the three cosmetic fields absolutely; `setLayer`
 * and `setCharacter` are the two ⚠️ **secrecy writes**; `setArt` is the only one that
 * destroys something outside the row. Each of the four controls below drives exactly one
 * of them, so a DM fixing a typo cannot send a layer value and a DM rebinding a coin
 * cannot send a stale name. The docblocks on those mutations and on their writers in
 * `convex/lib/board.ts` are where the consequences are stated in full; the copy here is
 * the same statements in the DM's words, on screen, at the control that causes them.
 *
 * **The order of the sections is what the DM is asking, in the order they ask it.** What
 * is this coin, who can see it, what does it look like, what is its picture, who may drag
 * it. The two consequential writes are first because they are the reason the tab exists —
 * a coin bound to nothing on a layer nobody is shown is what nothing else in the app can
 * reach — and *Controlled by* is last for the reason `SheetsTab` puts it last: it is what
 * the DM does after they have decided what the thing is.
 *
 * ⚠️ **`TokenControlPanel` is mounted verbatim and nothing here computes who controls
 * anything.** It is the one client writer of `board.setControllers`, it reads
 * `controllerIds` and `grantedPlayerIds` off the payload and derives neither, and the
 * grant relation getting a second writer is the specific failure ADR 0009 spent a
 * milestone removing. Two sentences below *do* read those arrays — one counts
 * `grantedPlayerIds` to decide whether a rebind warning is worth showing, one reads
 * `claimedByName` off a character — and both are copy about a rule rather than an
 * evaluation of it. Which seats are actually in control is printed in exactly one place on
 * this screen.
 *
 * Mounted with `key={token._id}` by the tab, so selecting a different coin remounts this
 * with that coin's stored values instead of needing an effect to resync the one draft
 * below.
 */
export function TokenEditPanel({
  code,
  dmCode,
  token,
  byGroup,
  bound,
  loading,
}: TokenEditPanelProps): ReactElement {
  return (
    <div className="flex flex-col">
      <EditorSection title="What it is">
        <BindingControl
          code={code}
          dmCode={dmCode}
          token={token}
          byGroup={byGroup}
          bound={bound}
          loading={loading}
        />
      </EditorSection>

      <Separator />

      <EditorSection title="Who can see it">
        <LayerControl code={code} dmCode={dmCode} token={token} />
      </EditorSection>

      <Separator />

      <EditorSection title="Name, size and colour">
        <AppearanceForm code={code} dmCode={dmCode} token={token} />
      </EditorSection>

      <Separator />

      <EditorSection title="Art">
        <ArtControl code={code} dmCode={dmCode} token={token} />
      </EditorSection>

      <Separator />

      {/* Verbatim, and with no wrapper of its own beyond the padding every section here
          gets: it brings its own heading in the same weight `EditorSection` prints, its
          own `players.list` subscription — `{ code }` exactly, so it is the same cache
          entry `useSeat` and `Roster` already hold — and its own failure line. Wrapping it
          in an `EditorSection` would print *Controlled by* twice. */}
      <div className="p-3">
        <TokenControlPanel code={code} dmCode={dmCode} token={token} />
      </div>
    </div>
  )
}

/**
 * One labelled block of the editor.
 *
 * The heading class is `TokenControlPanel`'s own, copied deliberately so that its section
 * and these four are one list rather than four of one weight and a fifth of another — the
 * `PANEL_BODY` / `ROW_SIZES` argument at the smallest scale. It is a local component
 * rather than a shared one because four uses in one panel is the whole of the demand, and
 * a `ui/` primitive for a heading and a gap would be a component per Tailwind string.
 */
function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 p-3">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * What the coin stands for, and the control that changes it. ⚠️ **The sharper of the two
 * secrecy writes.**
 *
 * `board.setCharacter` takes `characterId` as a **required** union with `null` rather than
 * an optional id, so *unbind* has one spelling and this select has one place to send it.
 * No local draft: this is one decision per gesture, like `SceneSelect`'s map, so the
 * select's value is the server's answer and a refusal leaves it showing what is actually
 * stored rather than what somebody hoped.
 *
 * ⚠️ **The two warnings below key off two different arrays, and that is the interesting
 * part rather than an implementation detail.**
 *
 * - The *publishing* warning counts `grantedPlayerIds`, because the seats that survive a
 *   rebind are exactly the explicitly granted ones. A grant is of the coin, so it follows
 *   the pointer: point it at tonight's dragon and the stat block and its exact hit points
 *   arrive at those seats in the same write, with no second confirmation anywhere.
 * - The *withdrawal* warning reads `claimedByName` off the character currently bound,
 *   because a seat that controls the coin by *playing* the creature is in control
 *   **because of** the binding this select changes. Rebinding drops them with nothing
 *   written to the token at all — they simply stop appearing in `controllerIds` on the
 *   next payload.
 *
 * One write, two opposite effects on two different sets of people, and the only reason
 * either is sayable on screen is that `publicTokenValidator` carries both arrays rather
 * than the effective set alone.
 */
function BindingControl({
  code,
  dmCode,
  token,
  byGroup,
  bound,
  loading,
}: {
  code: string
  dmCode: string
  token: PublicToken
  byGroup: Record<CharacterGroup, PublicCharacter[]>
  /** The creature this coin stands for, resolved by the tab — see the panel's props. */
  bound: PublicCharacter | null
  loading: boolean
}) {
  const setCharacter = useMutation(api.board.setCharacter)
  const action = useLobbyAction()
  // Not a literal: this panel can be mounted while the Sheets tab is force-mounted behind
  // it, and two selects sharing an id is a label that focuses the wrong control.
  const fieldId = useId()

  const busy = action.pending !== null

  function rebind(value: string) {
    // The empty string is the *nothing* option and is compared before anything is treated
    // as an id — the same ordering `TokenAddDialog` uses for its two sentinels.
    const characterId = value === UNBOUND ? null : (value as Id<'characters'>)

    void action.run(
      'bind',
      `Could not change what ${token.name} stands for.`,
      () => setCharacter({ code, dmCode, tokenId: token._id, characterId }),
      // A field rather than a toast: the select stays on screen after a refusal, so there
      // is something for the message to be about, and the DM needs to see that the value
      // did not move.
      { report: 'field' },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${fieldId}-character`}>Bound to</Label>

      {/* One select in both states rather than a skeleton that becomes one, which is the
          opposite of what most of this codebase does with a pending subscription — and the
          reason is the `<Label>` above. A label whose `htmlFor` points at an element that is
          not in the document for the first frame is a label announcing nothing, and swapping
          the control also shifts everything below it as the roster lands. Disabled with the
          bound value showing is the same information with neither problem.

          The single option carries the token's *own* value, so the select is never blank and
          never momentarily reports a different binding from the one that is stored. */}
      <NativeSelect
        id={`${fieldId}-character`}
        className="w-full"
        value={token.characterId ?? UNBOUND}
        disabled={busy || loading}
        onChange={(event) => rebind(event.target.value)}
      >
        {loading ? (
          <option value={token.characterId ?? UNBOUND}>
            {token.characterId === null ? 'Bound to nothing' : 'Reading the sheets…'}
          </option>
        ) : (
          <>
            <option value={UNBOUND}>Bound to nothing — no sheet, no health bar</option>
            {/* The state that should not happen, named rather than drawn as its opposite.
                Without an option carrying the coin's own value this select has none that
                matches, and a `<select>` with no matching option displays the *first* one —
                which here reads *Bound to nothing* about a coin that is bound to something.
                Disabled, because it is not an answer a DM should be able to choose; the row
                in the list above prints the same words for the same reason. */}
            {token.characterId !== null && bound === null ? (
              <option value={token.characterId} disabled>
                {MISSING_SHEET}
              </option>
            ) : null}
            {CHARACTER_GROUPS.map((group) =>
              // An empty `<optgroup>` draws a greyed heading over nothing, so a game with no
              // monsters yet would print *Monsters* at the DM and mean it as an absence. The
              // iteration is still over the union — the skip is a row that does not exist,
              // not a group nobody wrote a case for.
              //
              // ⚠️ The union iterated against a `Record` of headings rather than three
              // hand-written `<optgroup>`s, which is CLAUDE.md invariant 9's formulation and
              // is why the labels come from `CHARACTER_GROUP_LABELS` beside the union itself:
              // three written-out sections is the arrangement where a fourth group leaves a
              // creature stored, counted and impossible to bind a coin to, and three *local*
              // records is the same failure spread over three files that each look finished
              // on their own. Nothing here guards a secret — every group but `character` is
              // DM-only anyway, and a player is sent none of them.
              byGroup[group].length === 0 ? null : (
                <optgroup key={group} label={CHARACTER_GROUP_LABELS[group]}>
                  {byGroup[group].map((character) => (
                    <option key={character._id} value={character._id}>
                      {character.name}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </>
        )}
      </NativeSelect>

      <p className="text-muted-foreground text-xs">
        A coin bound to a creature has a health bar, and the player playing that character can
        drag it. Bound to nothing it is scenery — no sheet, nothing to roll, and yours alone to
        move.
      </p>

      {token.grantedPlayerIds.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>You have handed this coin to somebody</AlertTitle>
          <AlertDescription>
            A grant is of the coin rather than of the creature, so it follows this pointer.
            Changing what the coin stands for publishes the new creature's sheet{' '}
            <span className="font-medium">and its exact hit points</span> to those seats in the
            same write, with no second confirmation. Check who has it — the list at the bottom
            of this panel — before you point it at a monster.
          </AlertDescription>
        </Alert>
      ) : null}

      {bound !== null && bound.claimedByName !== null ? (
        <p className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">{bound.claimedByName}</span> plays{' '}
          {bound.name}, which is the only reason they can drag this coin. Rebinding it takes
          that away with nothing written to the token — they stop appearing under{' '}
          <span className="font-medium">Controlled by</span> on the next update, and anything
          you granted them explicitly stays exactly as you wrote it.
        </p>
      ) : null}

      <FieldError message={action.error} />
    </div>
  )
}

/**
 * What each layer means for a coin that **already exists**, in this panel's words.
 * Exhaustive by construction — see CLAUDE.md invariant 9.
 *
 * ⚠️ **Per screen** — see the ⚠️ on
 * `LAYER_ALERT_TITLES`, whose titles these borrow. `TokenAddDialog`'s three notes are about
 * a mistake to catch before saving; these three are about a press that has already
 * happened and what puts it back, which is a different sentence about the same fact.
 *
 * ⚠️ **The three are not symmetrical, and that is the consequence of the split with
 * `TokenControlPanel` rather than an oversight.** The two withholding arms are short,
 * because that panel prints the resting state of a grant underneath them at that moment.
 * The player arm carries the whole consequence, because in *that* state it prints no alert
 * — there is nothing resting to describe — so this is the only warning before the press.
 */
const LAYER_NOTES: Record<TokenLayer, ReactNode> = {
  background: (
    <Alert>
      <AlertTitle>{LAYER_ALERT_TITLES.background}</AlertTitle>
      <AlertDescription>
        The coin, its square and the sheet behind it stay on every screen at the table — only
        the drag is refused, and it is refused for everybody but you. A tick under{' '}
        <span className="font-medium">Controlled by</span> cannot open that, which is what the
        alert down there means by inert. One press of{' '}
        <span className="font-medium">Everyone</span> hands it back.
      </AlertDescription>
    </Alert>
  ),
  player: (
    <p className="text-muted-foreground text-xs">
      Drawn on every screen at the table, and movable by whoever is playing the character it
      is bound to. Moving it to your own layer takes the coin, its square and — for anybody
      you have granted it to — the bound creature's sheet and exact hit points off their
      screens in one write. Moving it to scenery takes only the drag. Both are reversible: the
      grants survive and go inert, and moving it back brings everything with it.
    </p>
  ),
  gm: (
    // The *act*, and only the act. What a grant on this coin is doing meanwhile is said once,
    // under **Controlled by** at the foot of this panel — see the ⚠️ above.
    <Alert variant="destructive">
      <AlertTitle>{LAYER_ALERT_TITLES.gm}</AlertTitle>
      <AlertDescription>
        It is absent from every player's data rather than merely undrawn, and so is the square
        it is standing on — so <em>that something is standing there</em> is hidden too, which
        is most of what an ambush is. Nothing is destroyed and one press of{' '}
        <span className="font-medium">Everyone</span> puts all of it back, in a single write.
      </AlertDescription>
    </Alert>
  ),
}

/**
 * Which layer the coin is on. ⚠️ **The other secrecy write, and the broadest one on the
 * board.**
 *
 * Buttons rather than a select, and they say what happens rather than naming a layer.
 * `TokenAddDialog` settled that wording and this **is** that control now rather than a
 * second copy of it — `LayerChoice` — because it is the same question asked about an
 * existing coin, and the app's broadest secrecy write should not have two spellings of any
 * of its buttons. Applied on the press rather than behind a Save, for the reason
 * `GridCalibrator`'s grid checkbox is: this is one decision, not a run of typing to wait
 * out, and a DM revealing an ambush wants it revealed now.
 *
 * ⚠️ **The copy above and `TokenControlPanel`'s own alert are two halves, and the line
 * between them is which question the DM is asking.** These are about the *act*: what the
 * press takes off every player's screen, and that the press reverses. That one is about the
 * *resting state* of a grant — tick a box on a coin nobody else can move and the player sees
 * no change, which is correct rather than broken.
 *
 * **The standing consequence is written there and not here**, and it used to be written in
 * both. That a granted seat is refused the drag, and on the GM layer is sent neither the coin
 * nor the bound creature's sheet nor its exact hit points, and that the grant survives
 * untouched rather than being revoked, is a fact about a grant on a coin players cannot move
 * — so it belongs beside the boxes that make one, for two reasons. `TokenControlPanel` is
 * what the *Sheets* tab mounts on its own, where nothing else would ever say it; and in this
 * tab both panels are on screen at once, four sections apart, which is exactly how two alerts
 * about one layer come to disagree after somebody edits one of them.
 */
function LayerControl({
  code,
  dmCode,
  token,
}: {
  code: string
  dmCode: string
  token: PublicToken
}) {
  const setLayer = useMutation(api.board.setLayer)
  const action = useLobbyAction()

  const busy = action.pending !== null

  function move(layer: TokenLayer) {
    void action.run(
      'layer',
      `Could not change who can see ${token.name}.`,
      () => setLayer({ code, dmCode, tokenId: token._id, layer }),
      { report: 'field' },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The add dialog's own picker, shared: the layers a DM may create on and may move
          to are one set, so they are one control saying one pair of things. The value is
          the server's answer read straight off the payload rather than a draft — this is
          one decision per gesture, applied on the press. */}
      <LayerChoice layer={token.layer} onChange={move} disabled={busy} />

      {LAYER_NOTES[token.layer]}

      <FieldError message={action.error} />
    </div>
  )
}

/**
 * The three cosmetic fields, saved together.
 *
 * `board.updateToken` is absolute over all three, which is `scenes.updateGrid`'s shape and
 * is right for the same reason: a name, a size and a colour are one appearance, edited in
 * one form, and committing them one at a time would show the table a coin nobody chose in
 * between.
 *
 * ⚠️ **Behind a Save, unlike `GridCalibrator`, and the difference is worth stating because
 * that file argues hard for the opposite.** Calibrating a grid is a loop of nudge-and-look
 * where the *point* is watching the overlay move, so a button in the middle of it means
 * either saving twenty times or concluding the app is broken. Renaming a coin is not that
 * loop: there is nothing to check the value against, and a write on every keystroke would
 * re-push `board.tokens` — every name, every signed art URL — to every client at the table
 * once per character typed. So the draft is local and explicit, which is also the
 * arrangement `CharacterSheetEditor` uses for the same trade.
 *
 * The draft resyncs by remount rather than by an effect: the panel above is mounted with
 * `key={token._id}`, so choosing a different coin brings that coin's stored values. The
 * consequence to know about is the same one the sheet editor lives with — a second DM
 * browser renaming this coin will not move a field this one has already typed into, and
 * Save is absolute, so the last Save wins. One DM is the normal case and the roster is
 * where a second one is visible.
 */
function AppearanceForm({
  code,
  dmCode,
  token,
}: {
  code: string
  dmCode: string
  token: PublicToken
}) {
  const updateToken = useMutation(api.board.updateToken)
  const action = useLobbyAction()

  // One piece of state for the three fields, which is the shape `TokenAppearanceFields`
  // writes and the shape `board.updateToken` takes.
  const [draft, setDraft] = useState<TokenAppearanceDraft>({
    name: token.name,
    size: String(token.sizeSquares),
    tint: token.tint,
  })

  const sizeSquares = parseNumber(draft.size)
  const busy = action.pending !== null
  // The add dialog's own predicate, which is the courtesy half of the check
  // `requireTokenAppearance` runs server-side.
  const usable = isUsableAppearance(draft)
  // Nothing to send is a Save with nothing to do. Compared against the payload rather than
  // tracked with a flag, so a DM who types over a name and types it back is not offered a
  // write that would re-push the board for no change.
  const dirty =
    draft.name !== token.name || sizeSquares !== token.sizeSquares || draft.tint !== token.tint

  function submit(event: React.FormEvent) {
    event.preventDefault()

    void action.run(
      'appearance',
      `Could not save ${token.name}.`,
      () =>
        updateToken({
          code,
          dmCode,
          tokenId: token._id,
          name: draft.name,
          sizeSquares,
          tint: draft.tint,
        }),
      { report: 'field' },
    )
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      {/* The add dialog's own three fields, hints included — see `TokenAppearanceFields`
          for why the copy travels with them. No `children`: the layer question has its own
          section above, and the DM is editing a coin that already exists rather than
          deciding what to make. */}
      <TokenAppearanceFields draft={draft} onChange={setDraft} disabled={busy} />

      <FieldError message={action.error} />

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !dirty || !usable}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {/* Says which of the three states the button is in, because a disabled button with
            no explanation is a DM wondering whether they have already saved. */}
        <span className="text-muted-foreground text-xs">
          {!usable
            ? `Give it a name and a whole number of squares from ${MIN_TOKEN_SQUARES} to ${MAX_TOKEN_SQUARES}.`
            : dirty
              ? 'Not saved yet.'
              : 'Saved.'}
        </span>
      </div>
    </form>
  )
}

/**
 * The coin's picture: change it, or take it away.
 *
 * ⚠️ **The one token write that destroys something outside the row it patches**, and the
 * blob accounting is split across two calls for a reason that is easy to get backwards.
 *
 * - The **outgoing** blob is deleted inside `board.setArt`'s own transaction, by
 *   `replaceTokenArt`. It has to be: `files.discard` refuses any blob a token still points
 *   at, so the only transaction permitted to delete it is the one that stops referencing
 *   it. There is nothing to do here, and nothing that *could* be done — `publicToken`
 *   carries the signed `artUrl` and never the `imageId`, so the old id is not readable from
 *   this bundle at all. That absence is deliberate and this control is the proof it costs
 *   nothing.
 * - The **refused** blob is discarded from here, by `useUpload`'s `commit`. Also
 *   unavoidable: a mutation is one transaction, so a `setArt` that throws on the byte count
 *   cannot tidy up after itself — the delete rolls back with the throw. The hook's catch is
 *   the call that commits because it is the call that succeeds (ADR 0004), which is why the
 *   mutation is invoked *inside* `commit` rather than after an upload.
 *
 * Reusing the hook is the whole of the reuse: `kind: 'token'` downscales to 256 px before
 * the network, which is what makes CLAUDE.md invariant 6 something a DM watches happen —
 * and the server reads the stored blob's size again, which is the check that counts.
 */
function ArtControl({
  code,
  dmCode,
  token,
}: {
  code: string
  dmCode: string
  token: PublicToken
}) {
  const setArt = useMutation(api.board.setArt)
  const upload = useUpload({ code, dmCode, kind: 'token' })
  const action = useLobbyAction()
  const fieldId = useId()

  const busy = action.pending !== null || upload.stage !== null

  async function apply() {
    const done = await action.run(
      'art',
      `Could not change the art on ${token.name}.`,
      () =>
        upload.commit((image) =>
          setArt({ code, dmCode, tokenId: token._id, imageId: image.imageId }),
        ),
      { report: 'field' },
    )
    // Only on success, so a refused upload leaves the chosen file in the field for the DM
    // to try again with — or to replace, which is the more likely answer to *that one is
    // too big*.
    if (done) upload.reset()
  }

  function clear() {
    void action.run(
      'art:clear',
      `Could not clear the art on ${token.name}.`,
      () => setArt({ code, dmCode, tokenId: token._id, imageId: null }),
      { report: 'field' },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {/* The coin as it is now, drawn the way the board draws it. A before-and-after
            beside a file field is the only way a DM can tell that the picture they are
            replacing is the one they thought. */}
        <TokenSwatch name={token.name} tint={token.tint} artUrl={token.artUrl} size="md" />
        <p className="text-muted-foreground text-xs">
          {token.artUrl === null
            ? 'No art. Drawn as a coloured coin with its initials, which is enough to play with and saves an upload per goblin.'
            : 'Replacing it deletes the old picture from storage there and then. There is no undo, and no other token is using it.'}
        </p>
      </div>

      <UploadPicker
        id={`${fieldId}-art`}
        label="New art"
        upload={upload}
        hint="Shrunk to 256 px here before uploading. The server checks the size again."
        disabled={busy}
      />

      <FieldError message={action.error} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || upload.prepared === null}
          onClick={() => void apply()}
        >
          {upload.stage === 'uploading' ? 'Uploading…' : 'Use this picture'}
        </Button>
        {token.artUrl === null ? null : (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={clear}>
            Clear the art
          </Button>
        )}
      </div>
    </div>
  )
}
