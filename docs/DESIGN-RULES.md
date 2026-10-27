# Design rules

How the screen should look and behave, and how to check it. These are principles, not rigid rules: use judgment,
and never make the app harder to use just to follow a rule to the letter.

Read this before any change to the interface or a feature. It sits next to
the other rule files and does not repeat them:

- `docs/PRODUCT.md` and `docs/CODE-RULES.md`: the product decisions, the
  stack and the architecture rules. Those are binding and win over
  anything here.
- `docs/TEXT-RULES.md`: every text the user sees.
- `docs/HOW-THE-CODE-WORKS.md`: how the code is organised (modules, screen layout).

Each section below separates **Established** (what the project already does;
keep it) from **Recommended** (added by this document; follow it unless
there is a reason not to).

## 1. Product decisions

**Established**
- The product principles are in `docs/PRODUCT.md`; they
  are not repeated here, so the two can never disagree.

**Recommended**
- Every feature answers "what does this help the user learn or understand?"
  If the answer is "it looks nice" or "other apps have it", it waits.
- Prefer improving what exists over adding something new.
- A feature that touches Learn data must not leak into Climb or Freetype,
  and the other way round.

## 2. Layout and space

**Established**
- Three fixed places on every screen: the header (logo, account), the
  navigation (a rail on the left from 900 px, a bar at the bottom below),
  and the content in the middle (`docs/HOW-THE-CODE-WORKS.md`, "Screen layout").
- Panels (Settings, Profile, the reset confirm) share one window style:
  `.win` and `.win-title`.
  Each option is an `.opt` row: name (and a description only if needed) on
  the left, the control on the right.
- Boxes size to their content rather than to a fixed height (the result
  card, the panels).
- Rare actions (Export, Import, Reset all progress) live in Settings, not on the main screen.
- The settings window holds only what holds for the whole site. A setting of
  one screen lives on that screen, next to what it changes: on the round bar,
  in a small window opened from the control it belongs to (`openPop`), or
  above the chart it draws on (#202).

**Recommended**
- Every element has a reason to be there and a reason to be where it is.
  Things used together sit together; the most used thing is the easiest to
  reach.
- Use space on purpose: no large empty areas next to cramped ones, and no
  filling space just because it is there.
- Align to the edges and columns already on the screen. Spacing between
  groups is larger than spacing inside a group.
- Centre content that is read as a whole (the result numbers); left-align
  content that is read line by line (help points, descriptions).

## 3. Responsive design

**Established**
- Breakpoints in `web/responsive.css` and `web/stats.css`: 900 px (rail vs bottom bar; 200% browser zoom on a 1920 px screen stays above it), 860 px (stats
  columns), 640 px (phone), 380 px (very small phone).
- Sizes follow the window: the keyboard key size `--u` and the text width
  `--tw` are computed from the viewport, not picked from presets.
- Phones and tablets show only the stats and the account (`docs/PRODUCT.md`): no typing screen, no navigation, a short line
  says that practice needs a computer keyboard.
- Long names are cut with "…" instead of pushing other things away.

**Recommended**
- Check the typing screen at desktop widths (drag the window between about
  1280 px and 1920 px) and the stats screen also at about 390 px. Nothing
  may be clipped, overlap, scroll sideways or wrap into one word per line.
- When a row does not fit, decide what wraps and how (see the length
  filter in `stats.css`), instead of letting the browser decide.

## 4. Visual hierarchy

**Established**
- What changes (typed text, numbers, results, messages) is bright; fixed
  labels are smaller and grey (`.lbl-ui`, `--label`, at least 4.5:1 on both
  themes). No text is smaller than `--fs-min` (14px at the smallest root
  size); `--sub` is for things that step back (untyped text, choices not
  picked), not for labels people must read.
- One accent colour (`--accent`, gold) for the caret, the focus letter and
  the selected option; a filled gold thing uses `--accent-fill` (a slight
  gradient) and `--accent-glow`; gold as text is `--accent-text`. Green
  (`--ok`) for mastered; red (`--error`) for mistakes and destructive
  actions. Colours are CSS variables; the light theme has its own palette.
- Surfaces in three steps: the page (`--bg`), cards (`--panel`) and small
  things on them (`--panel-2`). Depth is `--lift` (a hairline edge and a
  short soft shadow), never a heavy shadow. Glass (`--glass`, a blurred
  see-through background) only for what floats over the page: windows,
  tooltips, the phone's bottom bar. Corners: `--r-sm`, `--r-md`, `--r-lg`.
- One font: Geist Mono (`--mono`, `--ui`), served from `web/fonts`
  (SIL Open Font License, `web/fonts/OFL.txt`). The one exception is the
  logo, "typeTrainer" in the header, the start screen and the stats picture:
  Sora SemiBold (`--logo`), a file with only the
  letters of the logo (`web/fonts/Sora-SemiBold-logo.woff2`, license
  `web/fonts/Sora-OFL.txt`).

**Recommended**
- The most important thing on a screen is the first one the eye finds. On
  the typing screen that is the text; on the result, the speed.
- Don't add colour, borders, icons or animation that carry no meaning. A
  line separates sections; it is not decoration.
- Don't introduce a new colour or font size when an existing variable or
  class fits.

## 5. Text and labels

All rules are in `docs/TEXT-RULES.md`. In short: every text earns its place,
nothing for the obvious, explain what is not obvious and what has
consequences, the same word for the same thing. All text lives in
`web/i18n.js`.

## 6. Interaction and feedback

**Established**
- Typing feels instant: the rules for the keypress path and how to measure
  it are in `docs/CODE-RULES.md` ("Architecture rules") and `AGENTS.md` (rule 4
  of "Current phase").
  Feel numbers live in `web/feel.js`. Responses to a key are 80-180 ms,
  start in the same frame and ease out; they animate colour, opacity, filter or transform only
  (nothing that moves the layout). Colours for JavaScript animations come
  from the theme (`themeColor` in `state.js`), never hard-coded.
- No `:has()` over a big part of the page (`body`, `#view-type`): any text
  that changes inside it (the hint, a counter) makes the browser restyle
  the whole typing screen on every key (measured:
  `docs/thesis/06-interface-finger-layout-latency.md`). A state other parts
  follow goes on `<body>` as a class instead (`boxState` in `state.js`).
- When a round starts, nothing moves and nothing disappears just because
  typing began. What is not needed right now dims (the header, the round
  switches, the Learn cells) and comes back on hover; only what has lost
  its meaning goes (the news of the last round). Each dim or fade has a
  reason (#201).
- A screen that opens (the result, the stats) does it as one short
  sequence of small rises (`rise` in `stats.css`), not as scattered effects;
  a redraw on resize does not replay it.
- Selected states use `aria-pressed` / `aria-selected`; a chosen value in a
  `.ring` group is a light accent tint. A `.ring` group is a row of cells
  side by side, with a thin line between them, so it reads as one switch.
- A destructive action asks first in a confirm window (Reset all progress:
  "Reset all progress? This can't be undone.", Cancel has the focus).
- Results stay on screen until the user presses Next round, Enter or Tab
  (Tab = new round everywhere). Esc opens the settings on every screen
  (a round being typed pauses behind it), never "next round".
- Short messages go in a toast (`web/fx.js`); live areas use
  `aria-live="polite"`.

**Recommended**
- Every action gives visible feedback: something changes, a toast appears,
  or a state flips. Silence after a click reads as "broken".
- Errors say what went wrong and what to do next.
- A control does the same thing everywhere it appears.
- Don't move focus or open the phone keyboard unless the user asked for it.

## 7. Consistency

**Established**
- Reusable patterns: `.win` panels, `.opt` rows, `.ring` switch groups (every
  choice of a few values: the round bars, the settings, the small window,
  the stats)
  (Off on the left, On on the right), `.btn` buttons (`.danger` for
  destructive), `data-tip` tooltips, `--ctl` (38 px) as the height of every
  control.
- Naming: Learn, Climb, Freetype, Stats, Settings; round, focus, mastered, level
  (`docs/TEXT-RULES.md`, word list).

**Recommended**
- Before adding a new component, style or word, search for an existing one
  that does the job. A new pattern needs a reason the old ones cannot meet.
- When a pattern changes, change it everywhere it is used in the same task.

## 8. Accessibility and usability

**Established**
- Visible keyboard focus: `button:focus-visible, input:focus-visible` get an
  accent outline.
- `prefers-reduced-motion` turns animations off (the timer bar excepted).
- Panels are dialogs (`role="dialog"`, `aria-expanded`, `aria-controls`);
  Esc closes them. The settings window and the reset confirm are native
  `<dialog>`s opened with `showModal()` (focus stays inside).
- Decorative icons have `aria-hidden="true"`.

**Recommended**
- Text contrast high enough to read in both themes; never grey on grey for
  something the user must read.
- Touch targets at least about 40 px high on a phone (`--ctl` is 38 px plus
  spacing); never two small targets right next to each other.
- Everything that works with a mouse also works with a keyboard.
- Don't rely on colour alone: mastered letters also get a tick, mistakes
  also get an underline.

## 9. Implementation quality

**Established**
- The stack, the import layers, no magic numbers and the two ways to run
  (server and GitHub Pages) are rules of `docs/CODE-RULES.md`; the import layers in
  detail: `docs/HOW-THE-CODE-WORKS.md`, "Frontend modules".

**Recommended**
- Read the code and try the feature before changing it. Look at the
  neighbours: shared CSS classes, other screens that use the same module,
  the phone layout, the Pages build, both themes.
- Prefer the smallest change that solves the problem in the right place
  over a workaround somewhere else.
- When the change touches behaviour, update the docs that describe it in the
  same task (`docs/HOW-THE-MODES-WORK.md`, `docs/HOW-THE-CODE-WORKS.md`).

## 10. Testing and verification

**Established**
- What must pass before a task is done: `AGENTS.md`, "Before you say a
  task is done"; the commands: `CONTRIBUTING.md`.

**Recommended**
- Look at the real result in a browser, not just the code: the screen that
  changed, in both themes when colours change.
- Check the edges: no data yet, a very long name, the first and the last
  letter, a time round that runs out, Climb at a low and a high level.
- Check what is next to the change, not only the element that was asked
  about.

## 11. Scope

**Established**
- Change only what was asked. Anything bigger than one
  feature gets a short plan first (`AGENTS.md`).

**Recommended**
- No unrelated refactoring, redesign or extra features inside a task. If
  something else looks wrong, mention it instead of fixing it silently.
- Exception: a small, clear problem caused by your own change, or a direct
  violation of these guidelines in the code you are touching, is fixed in
  the same task and mentioned in the summary.
