# Changelog

All notable changes to `micro-ai-client` are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/).

**What the version number promises:** the *browser-facing surface* - the pages and journeys a student
or instructor can reach, the roles that gate them, and the shape of what the UI puts on screen. The
client consumes the server's HTTP API but does not define it, so an API change is a `micro-ai-server`
version bump, not this one; what moves this number is what a user can see or do.

It also carries the client half of one **hand-mirrored** contract: `normalizeSlideNumber` /
`compareSlideNumbers` / `isValidSlideNumber` (`app/core/helpers/slideNumber.ts`) mirror
`micro-ai-server/src/slide-collections/slide-number.ts` with no codegen and no shared package, so a
change to the canonical pattern is a change in both repos **in the same commit** - otherwise grading
silently diverges. See [`docs/cross-repo-contract.md`](../docs/cross-repo-contract.md).

Each release records the `micro-ai-server` version it was developed and demoed against. The repos are
independently versioned (the numbers do not track each other), and there is no runtime compatibility
gate - no `/v1` path segment, no version header - so the pairing below is documentation, not
enforcement.

Architecture decisions referenced below (`FE-ADR-*`, `BE-ADR-*`) live in
[`docs/architecture.md`](../docs/architecture.md).

> **Everything below `0.6.0-rc.1` was reconstructed from git history**, not written at release time -
> the repo had no `CHANGELOG.md` and no tags until 2026-08-12 (FE-ADR-009). Entries are grouped from
> the first-parent history on `develop`; dates are the last commit in each range. Treat the grouping
> as a fair summary rather than a contemporaneous record, and the linked commits as the primary
> source. `package.json` carries a `version` only from `0.6.0-rc.1` onward.

---

## [0.9.1-rc.1] - 2026-09-10

### Added

- **A downloadable CSV template for the student import.** The Import Students dialog now has a
  Download template button below the drop zone. It hands back the exact file the importer accepts,
  the `student_id, email, firstname, lastname` header plus one example row, generated in the browser
  so the file never leaves the machine and nobody has to guess the column order.

### Compatibility

- Developed against `micro-ai-server` v0.14.0-rc.1, unchanged from 0.9.0-rc.1: this release is
  browser-facing only and adds no new server dependency.

## [0.9.0-rc.1] - 2026-09-08

### Added

- **The image library, rebuilt and usable with a finger.** Filter, search and album membership; drag
  to file; bulk select with add-to-album, run-model, annotate and download; and an inspector panel,
  all responsive down to a phone.
- **Annotation assignments, end to end.** A new assignment type where students box and label an
  album's images against the instructor's own boxes as the key. Students annotate on a canvas;
  instructors review each image (approve, flag, incorrect) with a per-image remark and overall
  feedback, and can return work for changes. No auto-grading.
- **A mobile and iPad layout pass for the annotator and review screens.** Bottom-sheet panels, a
  filmstrip pager, touch select-and-drag on the canvas, and thumbnails plus verdict dots in the
  review image list.
- **A Manage tab on a class**, gathering what was previously scattered or missing: editing the class,
  the student roster, and the staff table. Staff are assigned **by email** (the address you actually
  have), with the API resolving it and the form surfacing what comes back: an unknown address, an
  address belonging to a student rather than staff, and someone already on the class are three
  different messages, not one failure.
- **An Archive action, for the class that will not delete.** `DELETE` refuses a class that has
  enrolled students or coursework, which is exactly the class an instructor wants off their list at
  the end of a term. Archiving hides it instead: it leaves the class lists but stays reachable by
  direct link, and a normal status edit brings it back. `status` now has three values, and
  `classSchema` parses all three.
- **A staff table that names the owner.** `GET /classes/:id/staff` returns the roster flattened to
  name, email, a display role, and when they were added, with the creator marked `owner`. The
  server derives that role for display, so `admin` reads as `instructor` inside a class: being a
  system administrator is not a teaching role.
- **An Admin item in the sidebar**, for a staff account whose role is `admin`. `/admin` was
  reachable only by typing it. Gated on the same rule as the route guard, read the same way.

### Changed

- **Delete and Archive are hidden unless you created the class.** `isClassOwner` compares
  `class.created_by` to the signed-in user; the server enforces the same rule and returns 403
  regardless, so this is the UI agreeing with the API rather than guarding it.
- **The class list is now whatever the server says it is.** A staff member sees the classes they are
  on rather than every class in the system, and archived classes are absent. The client stopped
  filtering client-side and reads the list directly.
- **The admin console uses `McSelect`**, the app's select everywhere else, for all five of its
  selects. Choices are data with labels now, so `local` and `azure` read as "Local (password)" and
  "Azure (SSO)" rather than as the enum values underneath them.
- **A student can now see the answers they submitted before their work is graded.** The feedback
  page showed the answer cards only once `graded`, so a student told to redo returned work could
  not see what they were fixing, and one waiting on a mark saw nothing at all. Both states now
  render the answers, photo included. Marks, comments and AI output stay hidden: the server nulls
  every one of them for a non-graded read.
- **Detection images are addressed by `image_id`, not by detection id** (BE-ADR-027). A detection
  id does not name a stable file: `DATABASE_INIT_STRATEGY=recreate` restarts ids at 1 while the
  image volume persists, so the old URL could mean a different picture, and the server now sends
  it `no-cache` for that reason. `detectionService.imageBlobUrl` takes an image name and calls
  `GET /detections/images/:imageId`, which is `immutable` and means it. This is also what makes a
  photo visible before grading: `image_id` survives the server's grade strip and `detection` does
  not. `img_path` is no longer read, and is now optional in the schema so the server can stop
  sending it without breaking every parse.

### Fixed
- **The exam lock told the student to do something that no longer works.** Three places promised the
  AI detection tool "returns once you submit", which stopped being true when BE-ADR-022 was amended
  on 2026-08-19: a windowed exam holds the lock until it closes, submitted or not. The sidebar
  tooltip, the home banner and the wall on `/image-detection` now say when it actually comes back,
  and the sentence lives in one tested helper (`detectionReleaseText`) instead of three templates.
- **After submitting, the lock could not name the exam it came from.** `pickBlockingExam` still
  dropped every submitted exam, mirroring the pre-amendment server rule, so the moment a student
  handed in their exam the banner lost the exam name and the "Go to exam" button degraded to "Go to
  my classes" - at exactly the point they most needed the closing time. It now mirrors the shipped
  predicate: a submission only releases an exam that has no closing bound.
- **"Reject & return" never appeared on an exam that graded itself.** `canReject` required status
  `submitted`, but an exam with no review-bound answer finalizes at submit and never reaches it.
  It now also offers the button for a `graded` submission with `graded_by` null, matching the
  server's amended rule.
- **Redoing returned work started from a completely blank form**, on both an assignment and an
  exam. The student was sent back with nothing filled in, and re-submitting replaces the row
  (BE-ADR-019, there is no un-reject), so the attempt they were told to fix was unreadable and then
  gone. Both forms now put back what the student answered, and show the photo they sent for each
  image answer. **That photo counts as the answer**: it is refetched at full size and re-uploaded
  on submit unless the student replaces it. Requiring a fresh file instead blocked the form
  outright, since the "answered" check only ever looked for a newly attached file, and it would
  have meant a student whose work came back over a wrong diagnosis had to re-photograph a slide
  they may no longer have.
- **The grading page never said which answer was blocking Finalize.** `needs_review` was on the
  wire but shown nowhere; the only signal was one line of text at the bottom of the page saying
  that something was unmarked. Each such answer now carries a "Needs your review" warning on its
  card. Grader-only, opt-in like the answer key: to a student it would be an unexplained warning
  on work they have handed in and cannot act on.

- **`navy-5` and `navy-15` were used but never defined.** `tw:bg-navy-5` appears in six components
  and `tw:border-navy-15` in seven, including the grading page's response box, but neither token
  existed in `main.css`, so those elements rendered with no background and a default border rather
  than the intended greys. Both are now defined, interpolated along the existing navy scale.

- **A `slide_identification` question on a normal assignment rendered nothing at all.**
  `StudentExerciseForm` had branches for the other four types and no fallback, so the question
  showed its prompt and no input, and its "answered" check could never pass, which blocked the
  whole assignment from being submitted. The type now renders the exam's station layout: the photo
  beside the slide label and the diagnosis, all three required, sending the same payload
  `StudentExamForm` sends (normalized `slide_number` plus `slide_number_raw`).

- **A normal assignment can now name a slide collection**, which is what makes the slide question
  above auto-gradable: the grader resolves the slide from the assignment's collection, so without
  one every slide answer routed to the instructor. The picker appears on the assignment detail tab
  once the assignment has a slide question (or already has a collection), and the read view shows
  which collection is in use, with a warning when none is. Staff only: which collection keys the
  answers is the answer key by another name.

- **Whole-page states rendered as a short card at the top of an empty page**: submitted, outside
  the exam window, nothing to answer. All five now fill the viewport, via a shared `McStatePanel`.
  A component rather than a class string on purpose: Tailwind only extracts class names from
  templates, so a height that lives in a script constant is never emitted at all.
- **A closed exam told the student to resubmit.** Rejection reopens the form, never the window, so
  the button led to a page the server would refuse. The feedback page and the exam page now say
  what happened and point at the instructor instead, and a returned exam past its closing time
  shows its reason and a link to the work rather than a bare padlock.
- **A submitted photo was fitted into a black band.** A portrait phone photo arrived as two black
  pillars either side of it, tall enough to push the answer and the next question off screen. It
  now renders at its own shape, bounded by width, with the rounding the other mode always had.

### Compatibility

- **Requires `micro-ai-server` v0.14.0-rc.1 or later.** Two of that release's changes are breaking,
  and this client is the first that satisfies both:
  - `POST /classes/:id/staff` takes `{ email }` where it took `{ staff_id }`. There is no
    compatibility shim on either side: the server's `whitelist: true` strips the old field and the
    request then fails validation, so an older client gets a **400**, not a silent no-op.
  - `GET /classes` returns only the classes a non-admin staff member is on, archived excluded.
    Admins still receive all of them. The response *shape* is unchanged; the row count is not.
- **Against a server before v0.14.0-rc.1**, the Manage tab's staff assignment fails with a 400 and
  the Archive action 404s. The rest of the class surface is unaffected. This is a hard requirement,
  not a graceful degradation. Pair the versions.
- **`PATCH /classes/:id/archive`, `GET /classes/:id/staff` and `classes.created_by` all arrive in
  v0.14.0-rc.1** (BE-ADR-040), along with `archived` on the class status enum.
- **Also in v0.14.0-rc.1, and relevant if you run against a migrated database:** that release fixes a
  server bug where a database built from migrations was missing three columns the annotation-grading
  code required, so `POST /submissions` returned 500 before writing anything. Any environment stood
  up from migrations between server v0.13.0-rc.1 and v0.14.0-rc.1 needs the new migration applied.
  If annotation submissions were failing against a shared dev server, that was why, and it was ours.

## [0.8.0-rc.1] - 2026-08-19

Two unrelated bodies of work. The phone half of `/image-detection`, worked through against a real
iPhone: every rule below is gated on `lg` unless it says otherwise, and the shape of it is
**FE-ADR-010**. Two entries under Changed are the exception, the desktop workbench's viewer needed
the same treatment once the phone one had it.

Then the exam and grading surfaces, where a student told to redo an exam could not get back into it
and an instructor grading one was walked onto the wrong page. Neither needed a server change: in
both cases the API had been right all along and the client was throwing the answer away.

### Added

- **A 1:1 crop in the staged preview.** The preview *is* the cropper: drag to pan, pinch or ctrl+wheel to
  zoom inside a fixed square window, and what is framed is what gets analysed. New
  `McImageCropper` plus `app/core/composables/imageCrop.ts` - `coverScale`, `clampOffset`, `cropRect`,
  `isUntouched` - pure and DOM-free, with 15 tests including an exhaustive sweep (3 aspect ratios × 4 zooms
  × 25 pan positions) asserting the selected rect never leaves the image. An untouched square photo submits
  the **original bytes**, so the common path re-encodes nothing - and the run waits for the picture to
  measure, so a tap that beats the `<img>`'s `load` event cannot submit the uncropped original behind the
  frame's back.
- **A zoom scrubber in the iOS idiom** - value above, 21 ticks with every fifth taller, filled behind the
  thumb - drawn over a real `<input type="range">` that keeps the dragging, the keyboard and the accessible
  name.
- **Two slots in the app bar for page-level actions** (`SidebarMain`): `#mc-header-lead` and
  `#mc-header-actions`, both empty and unconditional so a Teleport into either always finds a target. While a
  photo is staged `/image-detection` fills them with **`‹ Retake`**, history and **`Start detection`** - one
  line, iOS bar-button style, tinted text rather than fills. Nothing floats over the picture any more, and the
  cropper's 56px top band went with the controls it existed to clear: the frame now starts directly under the
  bar, inset equally on all four sides.
- **A `compact` shape for `McDetectionModelPicker`** - an iOS grouped list under a `MODELS` header, rendered
  inline on the staged screen. Changing model is one tap; the descriptions stay on the desktop workbench.
- **A way back out of a result.** The results screen was a dead end on a phone: the bar carried history
  and nothing else, so changing the model or taking another photo meant reloading the page. The leading slot
  now holds **`‹ Back`** there, returning to the staged photo - which is where Retake and the model rows
  already live, making a second opinion back-pick-run. One button with two destinations rather than a Retake
  and a Change model crowded into the results bar, where the second only leads to the first.
- **A history record loads its bytes, not just its picture**, so an old run is a re-runnable image: backing
  out of it lands on the staged screen with Start detection live. Read back from the object URL already in
  memory, and the record's own `source` is carried over so a re-run is recorded as what it is.
- **`examWindow.ts`** - `isExamOpen` / `pickBlockingExam`, pure and hand-mirroring the server's
  `src/detections/exam-window.ts` and its `studentHasOpenExam` join (inclusive bounds, null = unbounded, any
  submission row counts as submitted), with 12 tests. Feeds `useBlockingExam`, which asks the two lists a
  student can already read. Explanation only - the server still decides, and BE-ADR-012 records why a drift
  here cannot unlock anything.
- **Date and type filters on detection history**, both in the panel's controls row. Type is the detected
  class (a `NO_FINDINGS` sentinel covers runs that found nothing); date is a set of quick ranges resolved over
  whole *local* days, so "Today" means the user's today. `historyClassOptions` lists only classes that
  actually appear, the count reads "8 of 24 shown" whenever a filter is narrowing, and **Clear** appears only
  when there is something to clear. Filters and matching live in `core/helpers/detectionHistory.ts`
  (`historyClassLabel`, `withinDateRange`, `filterHistory`) with 18 new tests.
- **The model that produced a result is named on the result** - in the desktop Display block and, on a phone,
  in the results sheet, from the manifest's display name rather than the raw id. A record loaded out of
  history was otherwise indistinguishable from one run under whatever model happens to be selected now.
- **A `fill` mode for `McAnnotatedImage`**: the image sizes itself and the box takes its height, so the
  results sheet sits flush against the picture with a gradient softening the join.

- **The slide label a student typed, kept and shown to the grader.** An exam answer now carries
  `slide_number_raw` beside the canonical `slide_number`, and the grading card shows it, tinted,
  with "no slide matched this label". Normalizing is lossy: a label outside the provisional pattern
  in `slideNumber.ts` becomes null, and that answer used to reach the instructor as `Slide -`, so a
  mistyped label and a skipped station looked identical to the one person who has to tell them
  apart. **The server does not store the field yet**, see Compatibility.
- **The date a submission was returned**, on the student's feedback page, under the instructor's
  reason. `rejected_at` was on the wire from the detail read all along and the schema was dropping
  it; a student saw "Submitted 14 Aug 2026 09:12" in the header and a returned notice with no date
  under it, and could not tell which came first.

### Changed

- **The history panel stopped downloading the whole history as pictures** (client side of **BE-ADR-026**,
  server v0.11.0-rc.1). It opened by fetching a full-resolution microscopy frame *per row, all at once*, and
  held the spinner until the slowest resolved - several hundred multi-MB downloads to fill a 48px slot. Rows
  now fetch the server's cached 256px variant (`?size=thumb`, ~20 KB) **as they scroll into view** - each
  row observing itself (`McDetectionHistoryRow`) against the scrolling list as its root - and the spinner
  clears when the *metadata* arrives. A row per observer rather than one over a `v-for` ref array, because
  Vue mutates that array in place: a single observer kept targeting the `<li>`s that were detached the last
  time the panel reloaded, and every row after a Refresh stayed blank. The
  `ETag` + `immutable` headers that shipped with it mean a remount costs nothing on the wire.
- **The History badge counts without downloading anything.** `refreshHistoryCount` fetched the entire
  history - every step and every polygon of every run - and read `.length`; it now asks for one row and reads
  the `total` beside it. A server that predates the paging params answers with the bare list, which is itself
  the answer and is counted in place, so it stays one request against either version.
- **Deliberately NOT paged, though the server now offers it.** The panel's class and date filters, and the
  class dropdown's own options, are computed over the loaded rows; with no filter params on the endpoint,
  paging would quietly turn "All classes" into "classes on this page" and let a date filter hide rows that
  exist - the failure `classService.getStudents` warns about in its own docblock. Bounding the images gets
  the cost that actually hurts without touching what the filters mean. Paging stays available if the list
  JSON itself becomes the bottleneck.
- **Desktop: the viewer holds one shape from viewfinder to result.** Four sizes used to pass in front of you
  on the way to an answer - a live square of 583px, a 480px capture painting at its natural size, an upload
  filling the panel at 632, and the result at 632 again - because the picture area was the whole panel with
  `object-scale-down` while the viewfinder was a height-bound square. The staged image and the annotated
  result are now that same square. Measured at 1440×900, all four states paint **583px at the same document
  position**, where before the picture shrank and dropped 76px the instant you pressed the shutter.
- **`McAnnotatedImage` gained `upscale`** - fill a fixed box, enlarging when the source is smaller than it,
  as the sibling of `fill` (which instead lets the box take the image's height). The overlay follows for
  free: `scale` is the single source for both the CSS and the box geometry, so a 480px capture and a 3478px
  upload both draw their boxes exactly on the picture. Off by default, so the grading page is untouched.
- **Desktop: the zoom row's band is reserved whether or not the control is in it.** It appeared with the
  camera and vanished with it, and the stage above takes its height from what is left - so the stage itself
  resized by 48px on every transition. A held space costs 48px once; a moving one costs a jump every time.
- **`/image-detection` is no longer one 1,951-line file.** Nothing about it behaves differently; it is split
  where the seams already were, so the next person to open it can find the part they came for:
  `core/helpers/modelLabel.ts` (pure, and now tested - 11 cases for the name/descriptor split and how a
  chained pass is attributed), `core/composables/detectionModels.ts` (the catalogue, the two selections and
  the chaining rule), `features/components/detection/DetectionUnavailable.vue` (the door a blocked student
  meets) and `.../DetectionOverlays.vue` (the model sheet, and history as a sheet or a modal). The page keeps
  the scanner itself.
- **Desktop: the viewer panel is a square**, sized by the column's spare height. The picture inside it is a
  square in every state - the viewfinder has to be, since that is what the shutter keeps - so a panel wider
  than the picture was a panel with black down both sides. The slack now falls outside the panel as page
  background instead of inside it as bands: measured at 1440×900 and 1280×800, the live view, a capture and a
  square upload all fill the stage exactly, 0px on every edge. A genuinely non-square upload still letterboxes
  inside the square (a 4:3 file leaves 73px top and bottom) - the alternative is cropping bytes that desktop
  submits whole.
- **Desktop: the inline camera fills its stage** instead of sitting in a 16px gutter with its own corner
  radius. The stage already draws a rounded, ringed, clipping box, so that made three nested frames - and
  the gutter came off the *height*, which is the binding dimension there, so the decoration cost the picture
  32px and widened the black bands beside it. The phone's full-bleed square and the exam flow's modal keep
  what they had; only `inline && !fullBleed` changed.
- **A blocked student is told which exam is blocking them, on the first screen.** The availability check
  already ran on arrival and greyed the nav item out correctly, but nothing on screen said *why* unless you
  hovered the padlock - so the way to find out was to go and open the exam, which is also the way to fix it.
  The home page now carries a notice naming the exam, its closing time and a **Go to exam** button; the
  detection page's wall names it too and its primary action goes straight there instead of to the class list.
  Two requests, only for a student who is actually blocked (`GET /exams` + `GET /submissions`, shared state,
  15s throttle); staff issue none, and a student with nothing open issues none either.
- **The home page's Image Detection tile locks with the sidebar item** (padlock, "Locked during your exam").
  It was bright and clickable next to a padlocked menu entry, and it led to a page that turns the student
  away - the one screen in the app that contradicted the rule it was enforcing.
- **The full-bleed viewfinder is a centred square** rather than the whole stage. Filling a 390×796 screen
  made `object-cover` scale a 640×480 camera up 1.66×, so the square the shutter kept was ~235 source pixels.
  Sized as a square the crop keeps **480×480** - the sensor's full height, no enlargement, twice the detail
  for the detector. Its width is capped at `100cqh` from a `container-type: size` row, so it shrinks instead
  of overflowing on a short screen.
- **The captured file carries the preview's mirror.** A front camera's preview is mirrored by convention;
  the file now matches it, so the frame you aimed with is the frame you get.
- **The staged screen is a single column in normal flow** - picture, zoom, then the model list - with the
  spare height split 2:1 above and below the list, so it sits low where a thumb is without touching the edge.
  The run button was previously floated over the stage's bottom edge, where it landed on top of the zoom
  scrubber once the cropper grew one; absolutely-positioned controls over a picture that can now be dragged
  turned out to be the wrong idea twice over.
- **The run button is a bar button on a phone at every height**, not a pill in the page. Reordering it inside
  the layout was tried both ways - under the model rows it fell off the bottom of a 700pt screen, above the
  picture it took a row from the thing being framed - and a toolbar of its own read as a second header while
  costing 48px. The bar is the only place that costs no content height, and it stops the action moving as the
  phone rotates. Desktop keeps the block button in its controls column.
- **The scroll lock no longer applies over a staged image** - that screen is taller than a short viewport,
  and locking it stranded the last control with no way to reach it.
- **The results sheet sits flush against the image** (overlapping its lower edge), and the detection guide
  overlays are gone: no legend row, no camera corner brackets, no crop frame.
- **Wording**: the run button reads **Start detection** / **Detecting…** rather than repeating the page name;
  the results sheet's scroll control reads **Show more** / **Back to top**.
- **Model labels put the descriptor in brackets** - `RT-DETR-L (5-class detector)`, from the manifest's
  `RT-DETR-L (5-class detector)`. A middle dot was tried first and read as two equal halves of one long
  label, when the name is what you are choosing between and the rest says what it does. A chained
  segmentation pass goes inside the brackets with it (`RT-DETR-L (5-class detector + segmentation)`), and the
  compact rows now ellipsize: the grouped list is ~40px short of the longest label at 393px, and clipping it
  mid-word left the bracket open, which reads as broken rather than as shortened.

- **An exam accepts any slide label the student types.** The Slide field was checked against
  `SLIDE_NUMBER_PATTERN` before the form would submit, and that pattern is marked PROVISIONAL: it
  came from the single "Slide V7" example in the request, not from a real answer key. An unfamiliar
  label therefore stopped a student submitting, in the one place where the cost cannot be
  recovered. The server never asked for that strictness (**BE-ADR-017** has it store an
  unresolvable label as null and route the answer to instructor review rather than fail the
  upload), and keeping the raw entry above is what makes matching it safe.
- **The station number stays on screen in an exam.** The badge used to swap the number for a check
  icon once a station was complete, so the anchor a student uses to cross-reference the bench with
  the screen disappeared on exactly the stations they had finished. Completion is the badge fill
  now. The check beside "3 of 5 complete" went too: the count is the message.
- **No em dashes or middle dots anywhere in the client**, in code comments, docs or on screen. The
  nine middle dots were rewritten rather than swapped, since each was two facts pushed together:
  the home page's locked notice reads "Lab Exam 2 closes at 18:30. The AI tool returns as soon as
  you submit the exam, or once it closes", staff exam rows read "Open until Aug 19, 14:30",
  detection boxes read "Candida (94%)". The one exception is the em dash inside the manifest's
  model display names, which `modelLabel.ts` splits on and the client cannot change alone.

### Fixed

- **A rejected exam was a dead end for the student.** `StudentExamForm` locked on any existing
  submission, and a rejected one is still a submission, so a student an instructor had told to redo
  their exam read "Your exam was submitted, it's final and can't be changed" with no way back in.
  The assignment form has had the exception since PR #11 and the exam form never got it, which is
  where it matters most: an objective assignment auto-finalizes to `graded` at submit and the
  server refuses to reject anything that is not still `submitted`, so exams and image answers are
  what actually gets returned. The rule is one tested function now, `isAnswerFormLocked`, called by
  both forms rather than written inline in each, and the exam form shows the instructor's reason
  the way the assignment form already did.
- **Grading an exam walked the instructor onto the assignment page.** The breadcrumb, "Back to
  Submissions" and the post-rejection redirect all hardcoded `/assignments/:id` as the parent of a
  submission. For an exam that URL does not fail, because `GET /assignments/:id` serves exams too,
  so the exam rendered as an ordinary assignment: no window, no countdown, no slide collection.
  All three now read `assignment.is_exam` off the submission. The assignment page additionally
  redirects an exam id to `/classes/:id/exams/:id`, which closes the same hole for a bookmark or a
  stale link, including the student-facing case where the generic form renders no input at all for
  a `slide_identification` question and the exam cannot be submitted.
- **The student's "resubmit" button ignored exams** on the feedback page, sending them to the
  assignment form. It is the entire recovery path out of a rejection (**BE-ADR-019**: re-submitting
  is the only way out), so it is the last place to land someone on a form they cannot answer.
- **Detection boxes drew against the wrong picture after a crop.** Coordinates come back normalised to what
  was *sent*, and the viewer was still showing the uncropped original - every box plausibly but wrongly
  placed. The viewer now swaps to the submitted crop.
- **The zoom control read 3.7× while the picture sat at 1×.** `:value` was bound before `:min`/`:max`, and a
  range input clamps and step-snaps against the range it has *at that moment*.
- **Nothing in the app had ever animated.** There is no `tw-animate-css` or `tailwindcss-animate` dependency
  and no keyframes, so every `animate-in` / `slide-in-from-bottom` class the sheet and dialog components ship
  was inert. Added `.mc-slide-up` in `main.css` for the one animation wanted - 320ms in, 240ms out, honouring
  `prefers-reduced-motion` - rather than pulling in the plugin and setting every overlay in the app moving.
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
- **The `100cqh` in the old capture scrim resolved against nothing** - no ancestor set `container-type`.

### Removed

- The full-width **detection history panel at the foot of the page**; history is a full-screen overlay from
  the header button on every viewport - a bottom sheet on a phone, a modal on desktop.
- The **model chip and its settings sheet** from the staged screen, replaced by the inline picker.
- The **breadcrumb on `/image-detection`** (`setBreadcrumbs([])`). It read "Image Detection", which is the one
  thing that bar does not need to say once it carries Retake, history and the run action - and at 393px the
  trail was truncating to "Image D…" to make room for them. Desktop still has the page's own `h1`.
- The **sidebar toggle, for as long as a photo is on screen** - staged or analysed
  (`html.mc-hide-sidebar-trigger` + `data-mc-sidebar-trigger`). Shell navigation sitting between Retake and
  Start detection read as one row of unrelated controls, and `‹ Back ☰` in the results bar is the same
  interleaving. Navigation is one step away either way (back, then Retake), and the camera and the empty
  chooser - the flow's root - both keep the toggle, as does every other route.

### Compatibility

- **Pairs with `micro-ai-server` v0.11.0-rc.1**, unchanged. Nothing in this release needs a server
  change to be correct: the exam fixes are client-side, and `is_exam` and `rejected_at` were both
  already on the wire and merely unparsed.
- **`slide_number_raw` is sent but not yet stored.** The API's `whitelist: true` strips an unknown
  field rather than rejecting the request, so submitting is unaffected and the grading card falls
  back to the canonical label until the server lands a nullable `varchar(64)` column, the field on
  `AnswerDto` with no `@Transform`, and one assignment in `buildAnswer`. Inert, not broken.
- **`rejected_at` is on the detail read only.** The list read model whitelists its fields, so the
  returned-attempt banners on the assignment and exam forms still show the reason without a date.
- No change to the slide-label contract (`app/core/helpers/slideNumber.ts`), unchanged since
  `0.5.0-rc.1`. The exam form no longer *enforces* the pattern at entry, but the shared helper and
  the canonical form it produces are untouched, so grading still compares like with like.

---

## [0.7.0] - 2026-08-17

`/image-detection` becomes usable on the device the slides are actually photographed with. On a
phone the page stops being a scaled-down desktop workbench and becomes a scanner; on a desktop it is
unchanged. Alongside it: past runs are browsable, and the AI summary is one tested function instead
of markup.

### Added

- **A phone layout for `/image-detection`** (`34ec053`, `be70acb`). Below `lg` the camera opens on
  arrival, the viewfinder is the screen, and the result rises under the shot as a sheet. Heights are
  cut to the state - full viewport for the camera and a staged image, short of the fold for the
  chooser so its buttons clear the browser's toolbar, and a fixed reserve once results exist so the
  Display filters and the Detection Results card both land above the fold. The page does not scroll
  before a result and does after one, with a chevron and a fade saying so. **Desktop keeps the
  two-column workbench**; every one of these rules is gated.
- **`McCameraCapture`, one capture screen for the whole app** (`db692eb`). Stream lifecycle,
  front/back switching, zoom (the native track constraint where a browser offers one, a CSS
  transform with a matching crop where it does not) and a square guide the capture honours, so the
  frame and the file agree. The exam flow moved onto it, losing ~250 lines of its own viewfinder.
  `useCameraAvailability()` answers "can this device photograph, and in-app or only via the OS" in
  one place - `getUserMedia` needs a secure context, so a phone on `http://<lan-ip>` never gets the
  in-app route. Hence `pnpm dev:https`, documented beside the script it explains.
- **Detection history (BE-ADR-024)** (`7293f04`, `3bb82ab`). Past runs, newest first, with
  thumbnails; picking one loads it back into the viewer instead of re-running the worker. Staff can
  switch the list to every user's runs. Desktop puts the panel at the foot of the page; a phone
  reaches it from a History button in the scanner, since the foot of a non-scrolling page is nowhere
  (`be70acb`).
- **An About panel in `/admin`** (`10e9b7d`), reporting the client, server and worker versions. The
  client's own comes from `runtimeConfig.public.appVersion`, baked from `package.json` at build time
  rather than fetched - the SPA deploys separately, so asking the server for "the client version"
  reports the wrong half whenever only one side has shipped.

### Changed

- **The AI Analysis Summary is assembled by `buildSummary()`** (`424f676`), a pure function under
  `app/core/helpers/`, replacing two long branching paragraphs in the template. The wording is the
  client's spec and has to stay diagnosis-free for students, which is a rule worth holding in tests
  rather than in markup - and the segments render through `v-text`, which is what finally removed
  the `"Clue cell , which it"` spacing artefact the old markup produced.
- **The app shell measures itself in `svh`, not `vh`** (`db27929`). `vh` is the *large* viewport -
  the height with iOS's toolbars retracted - so every page was a toolbar taller than the screen and
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
- `pnpm install` is required - a dependency was removed.

---

## [0.7.0-rc.1] - 2026-08-13

An admin console, and the toolchain repaired. The visible half is `/admin`; the rest is a dependency
update that broke the build outright and the two-line convention that keeps it fixed.

### Added

- **Admin console at `/admin`, admin-only** (`03180c2`, `b65a934`, `7c16596`). **Runtime config**
  driven generically off `GET /system-config` - boolean renders a switch, anything else a text field
  - so a flag added server-side appears without a client change; saving is live immediately.
  **Accounts** split into **Local** (password) and **SSO** (Azure) tables via a shared
  `AccountsTable`, with inline edit, promote/demote, delete, a Created column, an Azure-linked badge
  and client-side pagination, plus a create-account form for staff or student.
- **An `admin` role gate** in `auth.global.ts` (`03180c2`), which previously knew only staff and
  student. The role is read from the JWT claim, not the stored profile, so the two cannot drift.
  **UX only** - the server's `RolesGuard` is the boundary (FE-ADR-003).
- **`Dockerfile` and `.dockerignore` for the SPA** (`049f995`). Build-only image: it runs
  `pnpm generate`, not `pnpm build`, because `ssr: false` means Caddy serves a prerendered
  `.output/public` with no Node process, and `nuxt build` emits no static entry HTML. It publishes
  into the `client-dist` bind mount at **runtime** - a build-time `COPY` would be shadowed by the
  mount - and forces `NUXT_PUBLIC_AUTH_DISABLED=false` over the committed `.env`.

### Changed

- **`/image-detection` is reachable anonymously** (`a5b1cf8`). `useDetectionAvailability` consults
  the anonymous-aware availability endpoint, so the tool opens when `detections.allow_public` is on
  and shows a sign-in message when it is off. Previously the 401 became a forced sign-in, which made
  the switch unreachable from the UI - the flag existed but could not be observed.
- **Icons come from `@lucide/vue`** (`ab083b1`, `3366209`); `lucide-vue-next` is deprecated upstream
  and is gone. A specifier swap across 55 files - all 70 icon names in use exist unchanged.

### Fixed

- **`pnpm build` failed outright after a dependency update** (`18dbb6e`), with five
  `[@vue/compiler-sfc] Failed to resolve extends base type` errors pointing at `reka-ui`. reka-ui was
  not the cause. `imports.dirs: ['core/**']` auto-imports exported types, and for a type exported
  from an SFC Nuxt writes an **extensionless** path into `.nuxt/types/imports.d.ts` - a *global type
  file* for `@vue/compiler-sfc`, whose resolver tries `.ts`/`.d.ts`/`index.*` but **never `.vue`**.
  The global scope then failed to parse, and Vue re-reported that inner error at whichever `extends`
  happened to trigger the lookup, so every blame landed on a dependency. `ConfirmModalProps` and
  `SidebarMenuButtonProps` moved to their sibling `index.ts`.
  **The convention this sets: never export a TypeScript type from a `.vue` file under `app/core/`.**
- **`pnpm typecheck` never ran** (`18dbb6e`). Nuxt 4.5 requires an explicit type checker and
  `vue-tsc` is only an optional peer, so the script errored before reading a line of code - while
  `pre-push` treated it as a gate.
- **The config-save toast reported failure on success** (`a5b1cf8`) - `PATCH /system-config` returns
  the bare row, which the write path did not parse. Also: select coercions moved out of inline
  template handlers (`a803b4d`), and account filters onto one row (`a5b1cf8`).

### Compatibility

- **Requires `micro-ai-server` past v0.8.0-rc.1** - specifically the **BE-ADR-023** admin account
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

## [0.6.0-rc.1] - 2026-08-12

Exam integrity, LMS exports, and the student exam station rebuilt. Pairs with `micro-ai-server`
**v0.8.0-rc.1**, whose matching half is the server-side refusal - the client changes here are the
visible surface of one rule, not the rule itself.

### Added

- **The AI tool is refused to a student with an open exam** (client request 5.2, BE-ADR-022,
  `d52c258`). `useDetectionAvailability` reads `GET /detections/availability`; the sidebar entry is
  **disabled with a tooltip naming the reason** rather than hidden (`412b020`), because a vanished
  menu item reads as a bug. Availability refreshes rather than being read once (`304439d`), polls
  while the student sits idle so the tool returns the moment the exam closes (`e2d595a`), and is
  forced past its throttle on submit. The server enforces it; this is the door, not the lock.
- **Canvas / Mango score export** (`fb58334`) - an assignment's scores as CSV from the submissions
  tab, plus the class's running grades from the Students tab (`603daf6`) in a matching format
  (`4dc1898`). `app/core/helpers/scoreExport.ts`, unit-tested.
- **Rubric diagnosis quick-picks on the exam station** (`7a1ee2d`, client request 3.1) - the model
  manifest's `displayText` offered as buttons, the same vocabulary the answer-key importer uses. The
  field stays free text underneath: BE-ADR-018 routes an answer outside the vocabulary to instructor
  review, and that branch only exists while something outside the list can be submitted.
- **Mobile upload guard** (`7a1ee2d`, client request 3.2) - `app/core/helpers/imageUpload.ts` rejects
  HEIC at selection with instructions (the worker has no `pillow-heif`, so it would otherwise fail
  *after* an apparently successful submit), bounds the file size, and sets `capture="environment"` so
  a phone opens the rear camera.
- **The student's name and id** on the welcome page and sidebar (`bc158d9`), backed by the server's
  widened `GET /users/profile`. Every name display previously fell back to the email address.

### Changed

- **The exam station was reworked** (`3c818af`) - photo tile left, answers right, both the same
  height; a square frame, because a field of view is round and a wide crop loses it; the tile grows
  on mobile once a photo is attached so the preview is checkable. Drag-and-drop attaches, with the
  same upload guard as the picker.

### Fixed

- **Answer-key validation checked the wrong map** (`a9b494b`) - answers were validated against the
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

## [0.5.0-rc.1] - 2026-08-10

**The state pinned by the project's first two coordinated releases** - the superproject's
`v2026.08.0-rc.1` and `v2026.08.1-rc.1` both reference this commit, by SHA, as "client develop". It
is named here retroactively.

Pairs with `micro-ai-server` **v0.6.0-rc.1**.

### Added

- **Letter-code slide labels and Excel answer-key import** (`41459cb`, PR #14, BE-ADR-020). A slide's
  label became text carrying an optional letter code (`V7`, `VVC12`, `G3A`) rather than an integer.
  `app/core/helpers/slideNumber.ts` lands here as the **mirror** of the server's authoritative
  `slide-number.ts` - canonical pattern, max length 16, the same normalization and natural sort. The
  workbook is parsed in the browser (SheetJS) and only validated rows are POSTed, keeping BE-ADR-007's
  no-upload rule intact.
- **Roster-wide submissions table** and screen-fitting tables (`bf36fa3`), with the roster driven
  from the server's own page rather than a client-side slice (`9c8f2d1`).

### Changed

- **Students see the element, not the diagnosis**, in image detection (`8316157`) - BE-ADR-012's rule
  applied to the standalone tool's own output.
- The slide table was rebuilt on `McDataTable` (`8f4c255`); the roster grade format moved into the
  shared helper (`13f9618`).

### Fixed

- **The submissions filter fired a request per keystroke** (`678cebd`, PR #15) - debounced, sharing
  one delay constant.

### Compatibility

- Requires `micro-ai-server` **v0.6.0-rc.1** for the letter-code columns and the bulk slide endpoint.
- **Lockstep:** `slideNumber.ts` must agree with the server's `slide-number.ts` from this release
  onward. Change both together.

---

## [0.4.0-rc.1] - 2026-07-24

Exam mode, the grading workflow, and the reject/redo loop - the release where the client stopped being
an assignment CRUD surface and started modelling how a course is actually run.

Pairs with `micro-ai-server` **v0.5.0-rc.1**.

### Added

- **Unknown-slide identification exam mode** (`d0a9f07`, PR #10, BE-ADR-011/017) - exam authoring
  against a slide collection, and the student station form.
- **Reject-submission flow** (`d50ea6b`, PR #11, BE-ADR-019) - a staff reject button and student
  resubmit. A returned submission is a status, not a graded zero.
- **Release workflow and the grading/feedback split** (`bc5a287`, PR #9), with detection filters,
  late-submission badges and tab persistence (`e083be2`).
- **Optional time picker on `McDatePicker`** (`59edf89`), and due dates that carry a time on a 24h
  clock (`9808732`).
- `typecheck` script (`12bfa14`).

### Changed

- **Image-detection controls and results reworked** (`1cb7f84`, `c939eb8`, PRs #12) - mirrored camera,
  verbose summary, dashboard chart fixes, and `watch` removed in favour of derived state.

### Fixed

- **Due-date status compared dates, not instants** (`58aa6cb`), so an assignment due later the same
  day already read as late.

### Compatibility

- Requires `micro-ai-server` **v0.5.0-rc.1** for the exam and reject endpoints.

---

## [0.3.0] - 2026-07-18

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

- **Sign-in ignored the user's role when routing** (`2d90031`) - everyone landed on the same page.
- The sidebar barrel re-exported `useSidebar`, breaking its injection context (`f818131`).
- Assignment points were submitted as a string (`6ee77f0`).
- `@internationalized/date` pinned to dedupe with reka-ui (`7d867db`).

---

## [0.2.0] - 2026-06-25

**The client stopped being a mockup.** Every screen moved from `app/data/*.json` fixtures onto the
real API, and the three-layer architecture that still governs the codebase was established here.

Pairs with `micro-ai-server` **v0.2.0**.

### Added

- **The three-layer API architecture** (FE-ADR-001): `app/plugins/api.ts` creates `$api` and owns the
  Bearer header and global 401 handler; `app/services/routes/*.ts` holds every URL; `app/services/*.ts`
  exposes typed methods that validate every response with Zod at the boundary. Pages and stores call
  services only.
- **Auth service and store** (`9c91022`, FE-ADR-003) - real JWT login with `useStorage` persistence.
- **Class management wired to the API** (`6dec946`), assignment and submission services (`bc1ec67`),
  exercise and question CRUD (`60ec693`, PR #8), and the dashboard driven off the real endpoint
  (`46a73ae`, PR #7).
- **Detection service and routes** (`23f269f`, FE-ADR-005) - multipart POST with a named model
  constant.

### Changed

- **Dev CORS solved with a Vite proxy** (`1ce5648`, FE-ADR-002): `/api/*` → `localhost:3000`, so
  `apiBaseUrl` stays the relative `/api` and no server CORS config is needed.
- Role checks moved to `user_type` (`57540c6`).

### Fixed

- `profileSchema` did not match what the server returned, breaking sign-in (`53a8142`); the student
  roster schema had the same problem (`3c24f0d`).

---

## [0.1.0] - 2026-03-20

The static UI shell - every screen drawn and navigable against mock data, with no backend behind it.
This is the release the proposal was demoed from.

### Added

- **Dashboard layout and sidebar** (PR #1), the dashboard and classes pages with stats and class
  management (`d6b1ffc`), and a bar chart (`270375d`).
- **Instructor-mode screens** (PR #3) - assignment submission form with file attachment and a
  submission detail page (`c939a70`), and the remaining pages mocked (`d631ec4`).
- **Login UI** with form validation (PR #4, `b832eb4`).
- **Component groundwork**: table (`66464dc`), select (`e5b25bb`), badge (`f80afe5`), dialog
  (`61d9a01`), pagination (`fa01a64`), progress; dayjs and camera plugins (`44991d6`).
- Class joining and role-specific actions on the index page (`1d34091`, PR #5); auth flow and UI
  updates (`847c78b`).

### Notes

- No API integration at all - every surface reads fixtures. The mock-data era ends at `0.2.0`, though
  a few student-facing pages still read `~/data/*.json` well past it.

---

## [0.0.1] - 2026-02-24

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
