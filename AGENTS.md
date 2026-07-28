<!-- Generated: 2026-07-21 | Updated: 2026-07-21 -->

# text_rpg — 창귀록 倀鬼錄

## Purpose

Single-file Korean text mystery RPG set in early-Joseon Hanyang. A disgraced-noble
constable (한서린) has five in-game days to solve six disappearances. Pure scripted
branching — **no LLM calls, no build step, no dependencies**. Ship by handing someone
the URL. One playthrough is ~40–50 minutes; the ending codex accumulates across runs
via localStorage.

## Key Files

| File | Description |
|------|-------------|
| `changgwirok.html` | The entire game — ~1610 lines: inline `<style>` (L10–110), DOM shell (L112–175), inline `<script>` (L176–end). This is the product. |
| `check.mjs` | Self-check. `node check.mjs` — 29 assertions, zero dependencies. Boots the game in a hand-rolled DOM shim, plays 300 randomized games for crashes/dead-ends, and directly exercises the good-ending gates the random walk can't reach (2막 진입, `free()`, `skipIntro`). The `ok()` helper self-counts, so the total never drifts. |
| `개선계획.md` | Narrative/UX improvement plan (5 items), all implemented. Kept as the rationale record — each change cites the review that produced it. |
| `창귀록_설계명세.md` | Design spec extracted *from* the code. **Now stale in places** — see Known Discrepancies. |

There are no subdirectories. `.omc/` is OMC operational state, not project content.

## For AI Agents

### Working In This Directory

- **The code is the source of truth.** The spec says so itself (line 4): if spec and
  `changgwirok.html` disagree, fix the spec, not the code.
- **Keep it one file.** No bundler, no `package.json`, no npm. Splitting into modules
  breaks the "send a friend a URL" premise, which is the whole point.
- **Open `changgwirok.html` in a browser to test.** Append `#dev` or `?dev` to the URL
  to unlock the prequel and full ending codex instantly (`DEV` flag, L191).
- Read the spec's §1.2 invariants before touching narrative logic. They are load-bearing:
  breaking one silently guts an ending path.
- Everything is global scope inside one `<script>`. Function names are the API. Grep,
  don't guess.

### Testing Requirements

**Run `node check.mjs` after every change.** It needs no dependencies and no install —
it extracts the `<script>` block, compiles it to catch syntax breakage, exercises the
pure logic (`tier`, `CHAIN`), then boots the whole game in a minimal DOM shim and plays
300 seeded random games hunting for crashes and screens with no clickable choice.

The suite referenced by spec §10 (`/home/claude/rpg/audit.js`, `play.js`, `tr.js`, …)
does not exist in this repo. `check.mjs` replaces the crash-hunting part of it. It does
**not** check prose rendering or ending reachability for the good endings — random play
only reaches 창귀 / 반쪽 / 관인 / 무고, and reaches act 2 in roughly 1% of games.
Anything touching a good-ending gate still needs a real browser playthrough with `#dev`.

The action budget is tight: 15 day-actions against 10 required (11 with the forced
`jongsa` sabotage). A change costing one extra action can make the true ending
unreachable. The 무병 window is tighter still — the true ending needs `mu >= 60` at
`vowScene` and death waits at 100, and nights force a ±choice every single day.

### Common Patterns

- **Every screen is `show(nodes, choices)`** (L281). `nodes` is `[[cssClass|null, html], …]`,
  `choices` is `[{k:'label', t:'description', f:handler, cls?, off?}]`. Scene functions
  call `show()` and return; the handler drives the next scene. No router, no state machine.
- `paint()` (L257) redraws the HUD from `S` after every `show()`. Never touch DOM gauges directly.
- Helpers: `E(id)`, `has(clue)`, `give(clue)`, `mu(delta)` (clamped 0–100), `knows(k)`.
- Interrogations go through `grill(cfg)` (L590) — a shared config-driven scene. Add a
  suspect by writing a config, not a new scene type.
- Data lives in top-level const tables: `CLUE`, `OPENS`, `GHOST`, `NAMEOF`, `BENE`,
  `PEOPLE`, `INCIDENTS`, `SABO`, `RECALL`, `ENDINGS`, `CHAIN`, `DEADFALL`, `FREED`,
  `INTRO_PICK`. Edit the table, not the scenes. `FREED[k]` holds each 창귀's release
  prose; `free()` splices its last node (an `sp`) *after* the `got` badge so the scene
  closes on the differentiating line — don't spread `FREED[k]` whole or the scene ends
  on a badge. `DEADFALL[id]` is the per-suspect "this run is now dead" signal pushed
  after a press catastrophe; keep 산군/나례 out of the seoun/gyusu entries (those losses
  kill act 2 outright, so promising a 산군 confrontation would be a lie).
- `show()` checks `S.mu >= 100` on every render and diverts to `burnout()` — the death
  condition needs no per-scene handling.
- Degrade gracefully: stars canvas, localStorage, and DOM wiring are each in their own
  `try{}catch{}`. `CANSAVE=false` when storage is blocked (`file://` on iOS) and the game
  still runs. Keep new side features inside the same guard.
- Korean prose is content, not strings-to-extract. There is no i18n layer.

### State

`S` is built by one factory, `INIT()`, and `save`/`restore`/`reset` all route through it —
`save` serializes `{...S, at}` with a replacer that unwraps Sets, `restore` starts from
`INIT()` and copies only keys the save actually has (so a save written by an older build
keeps the current defaults instead of leaking `undefined`), `reset` is `S = INIT()`.
**Add a field in `INIT()` and nothing else needs touching** — but add it to `SETS` too if
it is a Set. `S` is a `let` and is reassigned by `reset`/`restore`, so never cache it in a
local that outlives a scene.

### Save Keys

`changgwirok.save.v1` (in-progress run) and `changgwirok.endings.v1` (ending codex,
persists across runs). Changing the shape of `S` requires bumping `KEY` or handling
old saves in `restore()` (L204) — a stale save silently corrupts a run otherwise.

## Known Discrepancies

The spec is no longer authoritative on these points. Code wins; fix the spec when you
next touch it.

- **Spec §4 miscounts sabotage.** It says "방해 손실 최대 2". `saboteur()` is
  deterministic — `avail[S.chase % avail.length]` picks `false` (no action cost) at
  chase 1 and `jongsa` (−1 action) at chase 2. The action loss is always exactly 1.
- **Spec §6 and §10 describe `pansaEdge` wrongly.** They claim `tedge.js` verified the
  `0~1 검거 / 2+ 무고` threshold. Before the fix, `pansaEdge` had a single increment
  site and could never exceed 1, so `unravel` was unreachable and the claimed test
  passed on a dead branch. `summon` now also increments it — `check.mjs` proves the
  threshold is reached by driving the two incidents directly.
- **Spec §2.2 conflates two gates for `uigeum`.** `ready()` is `has('jangbu')` (avoids
  the wasted trip) but `needClue` is `'chingching'` (wins the interrogation). Both are
  required and they are not the same condition.
- **Spec §6.2's "깊이 5" for 아들/제관 is really 4 independent gates.** `hasYugo` in
  `vowScene` is always true by the time it is read: the 추격 button requires
  `has('yugo')`, `S.done.add('pansa')` fires only inside `pansa()`, `reckoning()`
  requires `done.pansa`, and clues are never removed except by `reset()`. So
  `perfect = allFreed && hasYugo` reduces to `allFreed`, and two text branches never
  render — the `'bad'` arm of the yugo recap, and 제관's `allFreed ? …` arm.
  This is narratively load-bearing, not a bug: chase step 1 reads the judge's
  handwriting *against the father's manuscript*, so the chase cannot happen without it.
  Restoring yugo as a genuine fifth gate would mean rewriting that scene.
  `check.mjs` pins the three conditions this conclusion rests on.
- Spec §11's open items still stand: `gukVisited` and `wary` have no ending impact, and
  act 1 is identical on every replay. No human end-to-end playtest has been done.

## Dependencies

### External
- Google Fonts (Song Myung, Nanum Myeongjo, Gothic A1) via CDN — cosmetic only; the game
  works offline with fallback fonts.
- That's it. No runtime libraries.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
