# Product and interface guidelines

How to decide what to build, where to put it, how it should look and behave,
and how to check it. These are principles, not rigid rules: use judgment,
and never make the app harder to use just to follow a rule to the letter.

Read this before any change to the interface or a feature. It sits next to
the other rule files and does not repeat them:

- `AGENTS.md`: the stack, the architecture rules and the product decisions.
  Those are binding and win over anything here.
- `docs/UI-TEXT.md`: every text the user sees.
- `docs/COMMENTING.md`: comments in the code.
- `docs/ARCHITECTURE.md`: how the code is organised (modules, screen layout).

Each section below separates **Established** (what the project already does;
keep it) from **Recommended** (added by this document; follow it unless
there is a reason not to).

## 1. Product decisions

**Established**
- The product principles are in `AGENTS.md` ("Product principles"); they
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
  navigation (a rail on the left from 1000 px, a bar at the bottom below),
  and the content in the middle (`docs/ARCHITECTURE.md`, "Screen layout").
- Panels (Settings, Profile, the reset confirm) share one window style:
  `.win` and `.win-title`.
  Each option is an `.opt` row: name (and a description only if needed) on
  the left, the control on the right.
- Boxes size to their content rather than to a fixed height (the result
  card, the panels).
- Rare actions (Export, Import, Reset all progress) live in Settings, not on the main screen.

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
- Breakpoints in `web/responsive.css` and `web/stats.css`: 1000 px (rail vs bottom bar), 860 px (stats
  columns), 640 px (phone), 380 px (very small phone).
- Sizes follow the window: the keyboard key size `--u` and the text width
  `--tw` are computed from the viewport, not picked from presets.
- Phones and tablets (a touch screen, no mouse) show only the stats and the
  account: no typing screen, no navigation, a short line says that practice
  needs a computer keyboard (thumbs on glass would skew the letter model).
  On a phone, check that the stats are not broken; the
  typing screen is checked at desktop widths only.
- Long names are cut with "…" instead of pushing other things away.

**Recommended**
- Design each size for how it is used, not as a shrunken desktop: on a phone
  the thumb reaches the bottom, the screen is narrow and the system keyboard
  takes half of it.
- Check every change at about 390 px, 768 px and 1280 px wide, and drag the
  window between them: these widths are spot checks, not a guarantee.
  Nothing may be clipped, overlap, scroll sideways or wrap into one word per
  line.
- When a row does not fit, decide what wraps and how (see the length
  filter in `stats.css`), instead of letting the browser decide.

## 4. Visual hierarchy

**Established**
- What changes (typed text, numbers, results, messages) is bright; fixed
  labels are small and grey (`.lbl-ui`, `--sub`).
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

All rules are in `docs/UI-TEXT.md`. In short: every text earns its place,
nothing for the obvious, explain what is not obvious and what has
consequences, the same word for the same thing. All text lives in
`web/i18n.js`.

## 6. Interaction and feedback

**Established**
- Typing feels instant: a keypress only flips classes on one or two letters;
  the caret moves once per animation frame; animations use CSS transitions
  or the Web Animations API, never JS timers (`AGENTS.md`). Feel numbers
  live in `web/feel.js`. Responses to a key are 80-180 ms, start in the same
  frame and ease out; they animate colour, opacity, filter or transform only
  (nothing that moves the layout). Colours for JavaScript animations come
  from the theme (`themeColor` in `state.js`), never hard-coded.
- A screen that opens (the result, the stats) does it as one short
  sequence of small rises (`rise` in `stats.css`), not as scattered effects;
  a redraw on resize does not replay it.
- Selected states use `aria-pressed` / `aria-selected` and the accent fill.
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
- Reusable patterns: `.win` panels, `.opt` rows, `.seg` segmented controls
  (Off on the left, On on the right), `.btn` buttons (`.danger` for
  destructive), `data-tip` tooltips, `--ctl` (38 px) as the height of every
  control.
- Naming: Learn, Climb, Freetype, Stats, Settings; round, focus, mastered, level
  (`docs/UI-TEXT.md`, word list).

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
- Go standard library only (plus the PostgreSQL driver); plain HTML, CSS and
  ES modules, no build step; the three-layer import rule in `web/state.js`;
  no magic numbers (`internal/config/config.go`, `web/feel.js`).
- The same code runs as a server and as WebAssembly on GitHub Pages.

**Recommended**
- Read the code and try the feature before changing it. Look at the
  neighbours: shared CSS classes, other screens that use the same module,
  the phone layout, the Pages build, both themes.
- Prefer the smallest change that solves the problem in the right place
  over a workaround somewhere else.
- When the change touches behaviour, update the docs that describe it in the
  same task (`docs/ALGORITHM.md`, `docs/USER-GUIDE.md`, `docs/ARCHITECTURE.md`).

## 10. Testing and verification

**Established**
- `gofmt -w .`, `go vet ./...`, `go test ./...` and the WebAssembly build pass
  before a task is done; CI runs them on every pull request.
- New engine logic gets unit tests, including empty and zero cases.

**Recommended**
- Look at the real result in a browser, not just the code: the screen that
  changed, at phone and desktop width, in both themes when colours change.
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
