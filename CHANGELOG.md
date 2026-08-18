# Changelog

All notable changes to `micro-ai-client` are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/).

**What the version number promises:** the *browser-facing surface* — the pages and journeys a student
or instructor can reach, the roles that gate them, and the shape of what the UI puts on screen. The
client consumes the server's HTTP API but does not define it, so an API change is a `micro-ai-server`
version bump, not this one; what moves this number is what a user can see or do.

It also carries the client half of one **hand-mirrored** contract: `normalizeSlideNumber` /
`compareSlideNumbers` / `isValidSlideNumber` (`app/core/helpers/slideNumber.ts`) mirror
`micro-ai-server/src/slide-collections/slide-number.ts` with no codegen and no shared package, so a
change to the canonical pattern is a change in both repos **in the same commit** — otherwise grading
silently diverges. See [`docs/cross-repo-contract.md`](../docs/cross-repo-contract.md).

Each release records the `micro-ai-server` version it was developed and demoed against. The repos are
independently versioned (the numbers do not track each other), and there is no runtime compatibility
gate — no `/v1` path segment, no version header — so the pairing below is documentation, not
enforcement.

Architecture decisions referenced below (`FE-ADR-*`, `BE-ADR-*`) live in
[`docs/architecture.md`](../docs/architecture.md).

> **Everything below `0.6.0-rc.1` was reconstructed from git history**, not written at release time —
> the repo had no `CHANGELOG.md` and no tags until 2026-08-12 (FE-ADR-009). Entries are grouped from
> the first-parent history on `develop`; dates are the last commit in each range. Treat the grouping
> as a fair summary rather than a contemporaneous record, and the linked commits as the primary
> source. `package.json` carries a `version` only from `0.6.0-rc.1` onward.

---

## [Unreleased]

The phone half of `/image-detection`, worked through against a real iPhone. Desktop is untouched
throughout — every rule below is gated on `lg`. The shape of it is **FE-ADR-010**.

### Added

- **A 1:1 crop in the staged preview.** The preview *is* the cropper: drag to pan, pinch or ctrl+wheel to
  zoom inside a fixed square window, and what is framed is what gets analysed. New
  `McImageCropper` plus `app/core/composables/imageCrop.ts` — `coverScale`, `clampOffset`, `cropRect`,
  `isUntouched` — pure and DOM-free, with 15 tests including an exhaustive sweep (3 aspect ratios × 4 zooms
  × 25 pan positions) asserting the selected rect never leaves the image. An untouched square photo submits
  the **original bytes**, so the common path re-encodes nothing.
- **A zoom scrubber in the iOS idiom** — value above, 21 ticks with every fifth taller, filled behind the
  thumb — drawn over a real `<input type="range">` that keeps the dragging, the keyboard and the accessible
  name.
- **Two slots in the app bar for page-level actions** (`SidebarMain`): `#mc-header-lead` and
  `#mc-header-actions`, both empty and unconditional so a Teleport into either always finds a target. While a
  photo is staged `/image-detection` fills them with **`‹ Retake`**, history and **`Start detection`** — one
  line, iOS bar-button style, tinted text rather than fills. Nothing floats over the picture any more, and the
  cropper's 56px top band went with the controls it existed to clear: the frame now starts directly under the
  bar, inset equally on all four sides.
- **A `compact` shape for `McDetectionModelPicker`** — an iOS grouped list under a `MODELS` header, rendered
  inline on the staged screen. Changing model is one tap; the descriptions stay on the desktop workbench.
- **A way back out of a result.** The results screen was a dead end on a phone: the bar carried history
  and nothing else, so changing the model or taking another photo meant reloading the page. The leading slot
  now holds **`‹ Back`** there, returning to the staged photo — which is where Retake and the model rows
  already live, making a second opinion back-pick-run. One button with two destinations rather than a Retake
  and a Change model crowded into the results bar, where the second only leads to the first.
- **A history record loads its bytes, not just its picture**, so an old run is a re-runnable image: backing
  out of it lands on the staged screen with Start detection live. Read back from the object URL already in
  memory, and the record's own `source` is carried over so a re-run is recorded as what it is.
- **`examWindow.ts`** — `isExamOpen` / `pickBlockingExam`, pure and hand-mirroring the server's
  `src/detections/exam-window.ts` and its `studentHasOpenExam` join (inclusive bounds, null = unbounded, any
  submission row counts as submitted), with 12 tests. Feeds `useBlockingExam`, which asks the two lists a
  student can already read. Explanation only — the server still decides, and BE-ADR-012 records why a drift
  here cannot unlock anything.
- **Date and type filters on detection history**, both in the panel's controls row. Type is the detected
  class (a `NO_FINDINGS` sentinel covers runs that found nothing); date is a set of quick ranges resolved over
  whole *local* days, so "Today" means the user's today. `historyClassOptions` lists only classes that
  actually appear, the count reads "8 of 24 shown" whenever a filter is narrowing, and **Clear** appears only
  when there is something to clear. Filters and matching live in `core/helpers/detectionHistory.ts`
  (`historyClassLabel`, `withinDateRange`, `filterHistory`) with 18 new tests.
- **The model that produced a result is named on the result** — in the desktop Display block and, on a phone,
  in the results sheet, from the manifest's display name rather than the raw id. A record loaded out of
  history was otherwise indistinguishable from one run under whatever model happens to be selected now.
- **A `fill` mode for `McAnnotatedImage`**: the image sizes itself and the box takes its height, so the
  results sheet sits flush against the picture with a gradient softening the join.

### Changed

- **The history panel stopped downloading the whole history as pictures** (client side of **BE-ADR-026**,
  server v0.11.0-rc.1). It opened by fetching a full-resolution microscopy frame *per row, all at once*, and
  held the spinner until the slowest resolved — several hundred multi-MB downloads to fill a 48px slot. Rows
  now fetch the server's cached 256px variant (`?size=thumb`, ~20 KB) **as they scroll into view** — each
  row observing itself (`McDetectionHistoryRow`) against the scrolling list as its root — and the spinner
  clears when the *metadata* arrives. A row per observer rather than one over a `v-for` ref array, because
  Vue mutates that array in place: a single observer kept targeting the `<li>`s that were detached the last
  time the panel reloaded, and every row after a Refresh stayed blank. The
  `ETag` + `immutable` headers that shipped with it mean a remount costs nothing on the wire.
- **The History badge counts without downloading anything.** `refreshHistoryCount` fetched the entire
  history — every step and every polygon of every run — and read `.length`; it now asks for one row and reads
  the `total` beside it. A server that predates the paging params answers with the bare list, which is itself
  the answer and is counted in place, so it stays one request against either version.
- **Deliberately NOT paged, though the server now offers it.** The panel's class and date filters, and the
  class dropdown's own options, are computed over the loaded rows; with no filter params on the endpoint,
  paging would quietly turn "All classes" into "classes on this page" and let a date filter hide rows that
  exist — the failure `classService.getStudents` warns about in its own docblock. Bounding the images gets
  the cost that actually hurts without touching what the filters mean. Paging stays available if the list
  JSON itself becomes the bottleneck.
- **A blocked student is told which exam is blocking them, on the first screen.** The availability check
  already ran on arrival and greyed the nav item out correctly, but nothing on screen said *why* unless you
  hovered the padlock — so the way to find out was to go and open the exam, which is also the way to fix it.
  The home page now carries a notice naming the exam, its closing time and a **Go to exam** button; the
  detection page's wall names it too and its primary action goes straight there instead of to the class list.
  Two requests, only for a student who is actually blocked (`GET /exams` + `GET /submissions`, shared state,
  15s throttle); staff issue none, and a student with nothing open issues none either.
- **The home page's Image Detection tile locks with the sidebar item** (padlock, "Locked during your exam").
  It was bright and clickable next to a padlocked menu entry, and it led to a page that turns the student
  away — the one screen in the app that contradicted the rule it was enforcing.
- **The full-bleed viewfinder is a centred square** rather than the whole stage. Filling a 390×796 screen
  made `object-cover` scale a 640×480 camera up 1.66×, so the square the shutter kept was ~235 source pixels.
  Sized as a square the crop keeps **480×480** — the sensor's full height, no enlargement, twice the detail
  for the detector. Its width is capped at `100cqh` from a `container-type: size` row, so it shrinks instead
  of overflowing on a short screen.
- **The captured file carries the preview's mirror.** A front camera's preview is mirrored by convention;
  the file now matches it, so the frame you aimed with is the frame you get.
- **The staged screen is a single column in normal flow** — picture, zoom, then the model list — with the
  spare height split 2:1 above and below the list, so it sits low where a thumb is without touching the edge.
  The run button was previously floated over the stage's bottom edge, where it landed on top of the zoom
  scrubber once the cropper grew one; absolutely-positioned controls over a picture that can now be dragged
  turned out to be the wrong idea twice over.
- **The run button is a bar button on a phone at every height**, not a pill in the page. Reordering it inside
  the layout was tried both ways — under the model rows it fell off the bottom of a 700pt screen, above the
  picture it took a row from the thing being framed — and a toolbar of its own read as a second header while
  costing 48px. The bar is the only place that costs no content height, and it stops the action moving as the
  phone rotates. Desktop keeps the block button in its controls column.
- **The scroll lock no longer applies over a staged image** — that screen is taller than a short viewport,
  and locking it stranded the last control with no way to reach it.
- **The results sheet sits flush against the image** (overlapping its lower edge), and the detection guide
  overlays are gone: no legend row, no camera corner brackets, no crop frame.
- **Wording**: the run button reads **Start detection** / **Detecting…** rather than repeating the page name;
  the results sheet's scroll control reads **Show more** / **Back to top**.
- **Model labels put the descriptor in brackets** — `RT-DETR-L (5-class detector)`, from the manifest's
  `RT-DETR-L — 5-class detector`. A middle dot was tried first and read as two equal halves of one long
  label, when the name is what you are choosing between and the rest says what it does. A chained
  segmentation pass goes inside the brackets with it (`RT-DETR-L (5-class detector + segmentation)`), and the
  compact rows now ellipsize: the grouped list is ~40px short of the longest label at 393px, and clipping it
  mid-word left the bracket open, which reads as broken rather than as shortened.

### Fixed

- **Detection boxes drew against the wrong picture after a crop.** Coordinates come back normalised to what
  was *sent*, and the viewer was still showing the uncropped original — every box plausibly but wrongly
  placed. The viewer now swaps to the submitted crop.
- **The zoom control read 3.7× while the picture sat at 1×.** `:value` was bound before `:min`/`:max`, and a
  range input clamps and step-snaps against the range it has *at that moment*.
- **Nothing in the app had ever animated.** There is no `tw-animate-css` or `tailwindcss-animate` dependency
  and no keyframes, so every `animate-in` / `slide-in-from-bottom` class the sheet and dialog components ship
  was inert. Added `.mc-slide-up` in `main.css` for the one animation wanted — 320ms in, 240ms out, honouring
  `prefers-reduced-motion` — rather than pulling in the plugin and setting every overlay in the app moving.
- **The fade where the picture meets the results sheet was in the markup and not on screen.** At 80px and
  55% the last row of pixels was still more than half photograph, so a white sheet met a mid-tone and the join
  stayed as hard as it had been without it. It now reaches opaque black over 128px, which also puts the
  sheet's rounded corners on the page's own black instead of on a slice of somebody's slide.
- **A 40px black band under the results image**: the emptied run slot was still laid out with its padding.
- **White stripes down both sides of the scanner on a tablet.** The layout's `container` caps a page at
  768px from `md` up, so on an iPad Air's 820px viewport the black surface stopped 26px short of each edge and
  the app's `#f9f9f9` showed through. The page's negative margins cancel the container's padding but cannot
  undo a max-width on an ancestor, so the layout now offers `data-mc-page-container` and the page drops the
  cap below `lg` (`html.mc-full-bleed`). Not a `100vw` bleed: vw counts the classic scrollbar, which would
  overhang into a horizontal scroll on a desktop window of the same width.
- **The staged screen's black wrapper was a fixed `100dvh-3rem`**, so on a short phone the button row hung
  below it onto the page's pale background. It is a minimum in that state.
- **The header and filters scrolled away** in the history panel; only the list scrolls now, so the close
  button stays reachable.
- **The `100cqh` in the old capture scrim resolved against nothing** — no ancestor set `container-type`.

### Removed

- The full-width **detection history panel at the foot of the page**; history is a full-screen overlay from
  the header button on every viewport — a bottom sheet on a phone, a modal on desktop.
- The **model chip and its settings sheet** from the staged screen, replaced by the inline picker.
- The **breadcrumb on `/image-detection`** (`setBreadcrumbs([])`). It read "Image Detection", which is the one
  thing that bar does not need to say once it carries Retake, history and the run action — and at 393px the
  trail was truncating to "Image D…" to make room for them. Desktop still has the page's own `h1`.
- The **sidebar toggle, for as long as a photo is on screen** — staged or analysed
  (`html.mc-hide-sidebar-trigger` + `data-mc-sidebar-trigger`). Shell navigation sitting between Retake and
  Start detection read as one row of unrelated controls, and `‹ Back ☰` in the results bar is the same
  interleaving. Navigation is one step away either way (back, then Retake), and the camera and the empty
  chooser — the flow's root — both keep the toggle, as does every other route.

---

## [0.7.0] — 2026-08-17

`/image-detection` becomes usable on the device the slides are actually photographed with. On a
phone the page stops being a scaled-down desktop workbench and becomes a scanner; on a desktop it is
unchanged. Alongside it: past runs are browsable, and the AI summary is one tested function instead
of markup.

### Added

- **A phone layout for `/image-detection`** (`34ec053`, `be70acb`). Below `lg` the camera opens on
  arrival, the viewfinder is the screen, and the result rises under the shot as a sheet. Heights are
  cut to the state — full viewport for the camera and a staged image, short of the fold for the
  chooser so its buttons clear the browser's toolbar, and a fixed reserve once results exist so the
  Display filters and the Detection Results card both land above the fold. The page does not scroll
  before a result and does after one, with a chevron and a fade saying so. **Desktop keeps the
  two-column workbench**; every one of these rules is gated.
- **`McCameraCapture`, one capture screen for the whole app** (`db692eb`). Stream lifecycle,
  front/back switching, zoom (the native track constraint where a browser offers one, a CSS
  transform with a matching crop where it does not) and a square guide the capture honours, so the
  frame and the file agree. The exam flow moved onto it, losing ~250 lines of its own viewfinder.
  `useCameraAvailability()` answers "can this device photograph, and in-app or only via the OS" in
  one place — `getUserMedia` needs a secure context, so a phone on `http://<lan-ip>` never gets the
  in-app route. Hence `pnpm dev:https`, documented beside the script it explains.
- **Detection history (BE-ADR-024)** (`7293f04`, `3bb82ab`). Past runs, newest first, with
  thumbnails; picking one loads it back into the viewer instead of re-running the worker. Staff can
  switch the list to every user's runs. Desktop puts the panel at the foot of the page; a phone
  reaches it from a History button in the scanner, since the foot of a non-scrolling page is nowhere
  (`be70acb`).
- **An About panel in `/admin`** (`10e9b7d`), reporting the client, server and worker versions. The
  client's own comes from `runtimeConfig.public.appVersion`, baked from `package.json` at build time
  rather than fetched — the SPA deploys separately, so asking the server for "the client version"
  reports the wrong half whenever only one side has shipped.

### Changed

- **The AI Analysis Summary is assembled by `buildSummary()`** (`424f676`), a pure function under
  `app/core/helpers/`, replacing two long branching paragraphs in the template. The wording is the
  client's spec and has to stay diagnosis-free for students, which is a rule worth holding in tests
  rather than in markup — and the segments render through `v-text`, which is what finally removed
  the `"Clue cell , which it"` spacing artefact the old markup produced.
- **The app shell measures itself in `svh`, not `vh`** (`db27929`). `vh` is the *large* viewport —
  the height with iOS's toolbars retracted — so every page was a toolbar taller than the screen and
  scrolled with nowhere to go. Long breadcrumbs are capped rather than allowed to widen the bar, and
  the sign-in heading drops a step so the form fits without scrolling.
- **The README describes this app** (`1a05d00`). It had not been touched since the initial commit:
  "Nuxt Minimal Starter", npm/yarn/bun in a pnpm-only repo, and the dev server pointed at the
  *server's* port.

### Removed

- **`simple-vue-camera`** (`7f5b8b1`). `app/plugins/camera.ts` was its only importer and went with
  the shared capture screen, which drives `getUserMedia` directly.

### Compatibility

- **Pairs with `micro-ai-server` v0.10.0-rc.1**, which is where the two endpoints this release's
  admin surfaces consume were added: `GET /detections/all` for history's "all users" scope
  (**BE-ADR-024**) and `GET /system` for the About panel (**BE-ADR-025**). That server release also
  brings run-level detection dedup, which is why a re-run of an identical image returns instantly and
  still records a history row of its own.
- **Against server v0.9.0-rc.1 those two surfaces degrade** rather than breaking the page: the scope
  switch reports that it needs the endpoint, and About shows the versions it can reach. Everything a
  student or instructor touches works on either.
- No change to the slide-label contract (`app/core/helpers/slideNumber.ts`), unchanged since
  `0.5.0-rc.1`.
- `pnpm install` is required — a dependency was removed.

---

## [0.7.0-rc.1] — 2026-08-13

An admin console, and the toolchain repaired. The visible half is `/admin`; the rest is a dependency
update that broke the build outright and the two-line convention that keeps it fixed.

### Added

- **Admin console at `/admin`, admin-only** (`03180c2`, `b65a934`, `7c16596`). **Runtime config**
  driven generically off `GET /system-config` — boolean renders a switch, anything else a text field
  — so a flag added server-side appears without a client change; saving is live immediately.
  **Accounts** split into **Local** (password) and **SSO** (Azure) tables via a shared
  `AccountsTable`, with inline edit, promote/demote, delete, a Created column, an Azure-linked badge
  and client-side pagination, plus a create-account form for staff or student.
- **An `admin` role gate** in `auth.global.ts` (`03180c2`), which previously knew only staff and
  student. The role is read from the JWT claim, not the stored profile, so the two cannot drift.
  **UX only** — the server's `RolesGuard` is the boundary (FE-ADR-003).
- **`Dockerfile` and `.dockerignore` for the SPA** (`049f995`). Build-only image: it runs
  `pnpm generate`, not `pnpm build`, because `ssr: false` means Caddy serves a prerendered
  `.output/public` with no Node process, and `nuxt build` emits no static entry HTML. It publishes
  into the `client-dist` bind mount at **runtime** — a build-time `COPY` would be shadowed by the
  mount — and forces `NUXT_PUBLIC_AUTH_DISABLED=false` over the committed `.env`.

### Changed

- **`/image-detection` is reachable anonymously** (`a5b1cf8`). `useDetectionAvailability` consults
  the anonymous-aware availability endpoint, so the tool opens when `detections.allow_public` is on
  and shows a sign-in message when it is off. Previously the 401 became a forced sign-in, which made
  the switch unreachable from the UI — the flag existed but could not be observed.
- **Icons come from `@lucide/vue`** (`ab083b1`, `3366209`); `lucide-vue-next` is deprecated upstream
  and is gone. A specifier swap across 55 files — all 70 icon names in use exist unchanged.

### Fixed

- **`pnpm build` failed outright after a dependency update** (`18dbb6e`), with five
  `[@vue/compiler-sfc] Failed to resolve extends base type` errors pointing at `reka-ui`. reka-ui was
  not the cause. `imports.dirs: ['core/**']` auto-imports exported types, and for a type exported
  from an SFC Nuxt writes an **extensionless** path into `.nuxt/types/imports.d.ts` — a *global type
  file* for `@vue/compiler-sfc`, whose resolver tries `.ts`/`.d.ts`/`index.*` but **never `.vue`**.
  The global scope then failed to parse, and Vue re-reported that inner error at whichever `extends`
  happened to trigger the lookup, so every blame landed on a dependency. `ConfirmModalProps` and
  `SidebarMenuButtonProps` moved to their sibling `index.ts`.
  **The convention this sets: never export a TypeScript type from a `.vue` file under `app/core/`.**
- **`pnpm typecheck` never ran** (`18dbb6e`). Nuxt 4.5 requires an explicit type checker and
  `vue-tsc` is only an optional peer, so the script errored before reading a line of code — while
  `pre-push` treated it as a gate.
- **The config-save toast reported failure on success** (`a5b1cf8`) — `PATCH /system-config` returns
  the bare row, which the write path did not parse. Also: select coercions moved out of inline
  template handlers (`a803b4d`), and account filters onto one row (`a5b1cf8`).

### Compatibility

- **Requires `micro-ai-server` past v0.8.0-rc.1** — specifically the **BE-ADR-023** admin account
  endpoints (`GET/PATCH/DELETE /users`, promote-demote) and `GET /detections/availability` under
  `OptionalAuthGuard`. Both are merged on server `main` (`7d5d389`) but **unreleased**: the server
  carries them under `[Unreleased]`, so this is the first client release whose paired server half has
  no version number yet. Against v0.8.0-rc.1 proper, `/admin` loads but every account call 404s and
  anonymous detection still forces a sign-in.
- Slide-label contract unchanged since `0.5.0-rc.1`.
- Toolchain moved under this release: Nuxt 4.3 → **4.5**, reka-ui 2.8 → **2.10**, Vue 3.5.28 →
  **3.5.41**, plus eslint 10.8 and prettier 3.9. `pnpm install` is required; a stale `node_modules`
  reproduces the build failure above.

---

## [0.6.0-rc.1] — 2026-08-12

Exam integrity, LMS exports, and the student exam station rebuilt. Pairs with `micro-ai-server`
**v0.8.0-rc.1**, whose matching half is the server-side refusal — the client changes here are the
visible surface of one rule, not the rule itself.

### Added

- **The AI tool is refused to a student with an open exam** (client request 5.2, BE-ADR-022,
  `d52c258`). `useDetectionAvailability` reads `GET /detections/availability`; the sidebar entry is
  **disabled with a tooltip naming the reason** rather than hidden (`412b020`), because a vanished
  menu item reads as a bug. Availability refreshes rather than being read once (`304439d`), polls
  while the student sits idle so the tool returns the moment the exam closes (`e2d595a`), and is
  forced past its throttle on submit. The server enforces it; this is the door, not the lock.
- **Canvas / Mango score export** (`fb58334`) — an assignment's scores as CSV from the submissions
  tab, plus the class's running grades from the Students tab (`603daf6`) in a matching format
  (`4dc1898`). `app/core/helpers/scoreExport.ts`, unit-tested.
- **Rubric diagnosis quick-picks on the exam station** (`7a1ee2d`, client request 3.1) — the model
  manifest's `displayText` offered as buttons, the same vocabulary the answer-key importer uses. The
  field stays free text underneath: BE-ADR-018 routes an answer outside the vocabulary to instructor
  review, and that branch only exists while something outside the list can be submitted.
- **Mobile upload guard** (`7a1ee2d`, client request 3.2) — `app/core/helpers/imageUpload.ts` rejects
  HEIC at selection with instructions (the worker has no `pillow-heif`, so it would otherwise fail
  *after* an apparently successful submit), bounds the file size, and sets `capture="environment"` so
  a phone opens the rear camera.
- **The student's name and id** on the welcome page and sidebar (`bc158d9`), backed by the server's
  widened `GET /users/profile`. Every name display previously fell back to the email address.

### Changed

- **The exam station was reworked** (`3c818af`) — photo tile left, answers right, both the same
  height; a square frame, because a field of view is round and a wide crop loses it; the tile grows
  on mobile once a photo is attached so the preview is checkable. Drag-and-drop attaches, with the
  same upload guard as the picker.

### Fixed

- **Answer-key validation checked the wrong map** (`a9b494b`) — answers were validated against the
  manifest's `elements` rather than its diagnosis map, so valid rubric diagnoses were rejected on
  import.
- **The date-picker label wrapped and spilled its border** on long placeholders (`30b8ddf`).
- **The image-detection viewer resized between preview and results** (`6a1fdb0`), so the page jumped
  when a detection completed.

### Compatibility

- Requires `micro-ai-server` **v0.8.0-rc.1** for `GET /detections/availability` and for
  `GET /users/profile` to return `firstname` / `lastname` / `student_id`. Against an older server the
  availability call fails and the profile falls back to the email address.
- Slide-label contract unchanged since `0.5.0-rc.1`.

---

## [0.5.0-rc.1] — 2026-08-10

**The state pinned by the project's first two coordinated releases** — the superproject's
`v2026.08.0-rc.1` and `v2026.08.1-rc.1` both reference this commit, by SHA, as "client develop". It
is named here retroactively.

Pairs with `micro-ai-server` **v0.6.0-rc.1**.

### Added

- **Letter-code slide labels and Excel answer-key import** (`41459cb`, PR #14, BE-ADR-020). A slide's
  label became text carrying an optional letter code (`V7`, `VVC12`, `G3A`) rather than an integer.
  `app/core/helpers/slideNumber.ts` lands here as the **mirror** of the server's authoritative
  `slide-number.ts` — canonical pattern, max length 16, the same normalization and natural sort. The
  workbook is parsed in the browser (SheetJS) and only validated rows are POSTed, keeping BE-ADR-007's
  no-upload rule intact.
- **Roster-wide submissions table** and screen-fitting tables (`bf36fa3`), with the roster driven
  from the server's own page rather than a client-side slice (`9c8f2d1`).

### Changed

- **Students see the element, not the diagnosis**, in image detection (`8316157`) — BE-ADR-012's rule
  applied to the standalone tool's own output.
- The slide table was rebuilt on `McDataTable` (`8f4c255`); the roster grade format moved into the
  shared helper (`13f9618`).

### Fixed

- **The submissions filter fired a request per keystroke** (`678cebd`, PR #15) — debounced, sharing
  one delay constant.

### Compatibility

- Requires `micro-ai-server` **v0.6.0-rc.1** for the letter-code columns and the bulk slide endpoint.
- **Lockstep:** `slideNumber.ts` must agree with the server's `slide-number.ts` from this release
  onward. Change both together.

---

## [0.4.0-rc.1] — 2026-07-24

Exam mode, the grading workflow, and the reject/redo loop — the release where the client stopped being
an assignment CRUD surface and started modelling how a course is actually run.

Pairs with `micro-ai-server` **v0.5.0-rc.1**.

### Added

- **Unknown-slide identification exam mode** (`d0a9f07`, PR #10, BE-ADR-011/017) — exam authoring
  against a slide collection, and the student station form.
- **Reject-submission flow** (`d50ea6b`, PR #11, BE-ADR-019) — a staff reject button and student
  resubmit. A returned submission is a status, not a graded zero.
- **Release workflow and the grading/feedback split** (`bc5a287`, PR #9), with detection filters,
  late-submission badges and tab persistence (`e083be2`).
- **Optional time picker on `McDatePicker`** (`59edf89`), and due dates that carry a time on a 24h
  clock (`9808732`).
- `typecheck` script (`12bfa14`).

### Changed

- **Image-detection controls and results reworked** (`1cb7f84`, `c939eb8`, PRs #12) — mirrored camera,
  verbose summary, dashboard chart fixes, and `watch` removed in favour of derived state.

### Fixed

- **Due-date status compared dates, not instants** (`58aa6cb`), so an assignment due later the same
  day already read as late.

### Compatibility

- Requires `micro-ai-server` **v0.5.0-rc.1** for the exam and reject endpoints.

---

## [0.3.0] — 2026-07-18

The component library and the authoring surfaces built on it.

Pairs with `micro-ai-server` **v0.2.0** (no server change was needed).

### Added

- **UI components**: calendar, popover and native select (`1afce53`), date picker (`9ab1aa5`),
  `McTabs` (`cbac15e`), `McConfirmDialog` (`fe9a40f`), textarea auto-list with vertical resize
  (`321e9ce`).
- **Student roster management** and an enrolled-only class view (`4ccee90`).
- Time-based greeting and date on the welcome page (`5803e16`).

### Changed

- **Sign-in page redesigned** and the auth form hardened (`6391cfc`).
- **Assignment create form revamped** (`4fb3de5`); the detail page split into tab and form components
  (`e61eb81`); new and edit question forms visually differentiated (`cf270e4`).
- `apiErrorMessage` extracted into a shared helper (`9211106`). Toast colours made semantic
  (`b61c932`); scrollbars thinned and made dark-mode aware (`f26a237`).

### Fixed

- **Sign-in ignored the user's role when routing** (`2d90031`) — everyone landed on the same page.
- The sidebar barrel re-exported `useSidebar`, breaking its injection context (`f818131`).
- Assignment points were submitted as a string (`6ee77f0`).
- `@internationalized/date` pinned to dedupe with reka-ui (`7d867db`).

---

## [0.2.0] — 2026-06-25

**The client stopped being a mockup.** Every screen moved from `app/data/*.json` fixtures onto the
real API, and the three-layer architecture that still governs the codebase was established here.

Pairs with `micro-ai-server` **v0.2.0**.

### Added

- **The three-layer API architecture** (FE-ADR-001): `app/plugins/api.ts` creates `$api` and owns the
  Bearer header and global 401 handler; `app/services/routes/*.ts` holds every URL; `app/services/*.ts`
  exposes typed methods that validate every response with Zod at the boundary. Pages and stores call
  services only.
- **Auth service and store** (`9c91022`, FE-ADR-003) — real JWT login with `useStorage` persistence.
- **Class management wired to the API** (`6dec946`), assignment and submission services (`bc1ec67`),
  exercise and question CRUD (`60ec693`, PR #8), and the dashboard driven off the real endpoint
  (`46a73ae`, PR #7).
- **Detection service and routes** (`23f269f`, FE-ADR-005) — multipart POST with a named model
  constant.

### Changed

- **Dev CORS solved with a Vite proxy** (`1ce5648`, FE-ADR-002): `/api/*` → `localhost:3000`, so
  `apiBaseUrl` stays the relative `/api` and no server CORS config is needed.
- Role checks moved to `user_type` (`57540c6`).

### Fixed

- `profileSchema` did not match what the server returned, breaking sign-in (`53a8142`); the student
  roster schema had the same problem (`3c24f0d`).

---

## [0.1.0] — 2026-03-20

The static UI shell — every screen drawn and navigable against mock data, with no backend behind it.
This is the release the proposal was demoed from.

### Added

- **Dashboard layout and sidebar** (PR #1), the dashboard and classes pages with stats and class
  management (`d6b1ffc`), and a bar chart (`270375d`).
- **Instructor-mode screens** (PR #3) — assignment submission form with file attachment and a
  submission detail page (`c939a70`), and the remaining pages mocked (`d631ec4`).
- **Login UI** with form validation (PR #4, `b832eb4`).
- **Component groundwork**: table (`66464dc`), select (`e5b25bb`), badge (`f80afe5`), dialog
  (`61d9a01`), pagination (`fa01a64`), progress; dayjs and camera plugins (`44991d6`).
- Class joining and role-specific actions on the index page (`1d34091`, PR #5); auth flow and UI
  updates (`847c78b`).

### Notes

- No API integration at all — every surface reads fixtures. The mock-data era ends at `0.2.0`, though
  a few student-facing pages still read `~/data/*.json` well past it.

---

## [0.0.1] — 2026-02-24

Repository scaffold.

### Added

- Nuxt project init (`6317a85`), ESLint and Prettier (`737cd7f`, `e6637e0`, `59d8c76`), husky
  (`c7b73c3`), and the pull-request template (`e7178d1`).

[0.7.0]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.7.0
[0.7.0-rc.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.7.0-rc.1
[0.6.0-rc.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.6.0-rc.1
[0.5.0-rc.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.5.0-rc.1
[0.4.0-rc.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.4.0-rc.1
[0.3.0]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.3.0
[0.2.0]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.2.0
[0.1.0]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.1.0
[0.0.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.0.1
