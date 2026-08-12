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

[0.6.0-rc.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.6.0-rc.1
[0.5.0-rc.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.5.0-rc.1
[0.4.0-rc.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.4.0-rc.1
[0.3.0]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.3.0
[0.2.0]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.2.0
[0.1.0]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.1.0
[0.0.1]: https://github.com/pnkwa/micro-ai-client/releases/tag/v0.0.1
