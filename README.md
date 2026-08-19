# micro-ai-client

The browser half of **MicroAI**, a fungal-microscopy identification teaching platform. Students
photograph slides and identify organisms; instructors run classes, assignments, exams and grading;
an ML worker assists detection.

A **Nuxt 4 SPA** - `ssr: false`, so there is no Node process in production: `pnpm generate` emits a
static bundle that Caddy serves. It consumes `micro-ai-server`'s HTTP API but does not define it.

This repo is a submodule of the MicroAI superproject, which carries the other services and the docs. Architecture decisions live in `docs/architecture.md`
there - the `FE-ADR-*` entries are this repo's, and later ADRs supersede parts of earlier ones.

## Run it

**pnpm only.** The lockfile is pnpm's; npm or yarn will produce a different tree.

```shell
pnpm install
pnpm dev            # http://localhost:3001
```

You also need **`micro-ai-server` running on :3000**. Nothing here talks to it directly - every
request goes to the relative `/api`, which a Vite dev proxy forwards (FE-ADR-002), so there is no
CORS to configure and no base URL to set. Changing `nuxt.config.ts` needs a **full dev-server
restart**; a browser reload will not pick it up.

```shell
pnpm dev:https      # same server over HTTPS, reachable from a phone on the LAN
```

Use that when testing the camera on a real device: `getUserMedia` only runs in a secure context, so
the in-app viewfinder and its zoom are dead over `http://<lan-ip>` no matter what the code does - the
Camera button falls back to the phone's own camera app. The `//dev:https` key in `package.json` has
the details, including the self-signed-certificate dance on iOS Safari.

`NUXT_PUBLIC_AUTH_DISABLED=true` in `.env` bypasses the route guard entirely (a demo toggle). If
pages seem publicly reachable, check that first.

## Scripts

| | |
|---|---|
| `pnpm dev` / `pnpm dev:https` | dev server on :3001 |
| `pnpm build` / `pnpm preview` | production build, and serve it |
| `pnpm generate` | the static bundle the Docker image publishes - **not** `build` |
| `pnpm typecheck` | `nuxt typecheck` |
| `pnpm test` | vitest, for the pure helpers |
| `pnpm lint:fix` | prettier then eslint |
| `pnpm release:publish vX.Y.Z` | mirror a tag onto GitHub Releases from `CHANGELOG.md` |
| `pnpm release:check` | report tags with no release, lightweight tags, missing changelog sections |

Husky runs commitlint (conventional commits) and lint-staged on commit and push.

Most of this app is verified through the superproject's `e2e-playwright-ui` suite and by hand rather
than by unit tests - only the pure helpers under `app/core/helpers/` have specs, which is where the
rules worth holding (grading text, the student-vs-staff summary) live.

## Architecture

**Three layers, strictly (FE-ADR-001). Nothing calls `$fetch` or `useFetch` from a page or a store.**

1. `app/plugins/api.ts` creates `$api`, owning the Bearer header and the global 401 handler.
2. `app/services/routes/*.ts` holds every URL string - services never hardcode a path.
3. `app/services/*.ts` are typed methods that call `$api` and **validate every response with Zod** at
   the boundary; the types are inferred from the schemas. Pages and stores call services only.

`app/core/` is reusable and app-agnostic: auto-imported (`imports.dirs: ['core/**']`), with its
components globally registered under the **`Mc`** prefix. `app/features/` is domain-specific, and
`app/pages/` is file-based routing.

Auth (`useAuth`, FE-ADR-003) persists the token and profile to `localStorage`;
`app/middleware/auth.global.ts` gates routes and pages opt into roles with
`definePageMeta({ role: 'instructor' })`. **This is UX, not a security boundary** - the API enforces
access. The role is read from the JWT rather than the stored profile, so the two cannot drift.

Prefer `computed` and derived state over `watch`.

## Versioning

`CHANGELOG.md` is the record. What the version number promises is the *browser-facing surface* - the
pages and journeys, the roles that gate them, the shape of what the UI puts on screen; an API change
is a `micro-ai-server` bump, not this one. Each entry names the server version it was developed
against, as documentation rather than an enforced pairing.

`package.json`'s `version` is baked into `runtimeConfig.public.appVersion` at build time and shown in
the admin console's About panel, so a release bump is the only place it needs changing.

### Branches

**`feature` -> `develop` -> `release`.** Work happens on a branch off `develop` and goes back in
through a PR. `release` is a standing branch that carries what `develop` has blessed, and it is only
ever **fast-forwarded** from it:

```sh
git checkout release && git merge --ff-only develop && git push origin release
```

A release is never cut from a feature branch. `release` should hold the same commit as `develop`
whenever no release is in flight, so a fast-forward is always possible and a merge commit on
`release` means something went in sideways.

**Merge PRs with a merge commit, not a squash or a rebase.** A version tag sits on the real commit
that bumped it, which lives on the feature branch; squashing or rebasing rewrites that commit and
leaves the tag pointing at something outside `develop`'s history.

### Cutting a release

1. Write the version's section in `CHANGELOG.md` - including the **Compatibility** notes naming the
   `micro-ai-server` version it was built against.
2. Bump `version` in `package.json`, commit both as `chore(release): vX.Y.Z - CHANGELOG and version bump`.
3. Merge the PR into `develop`, then fast-forward `release` onto it (above). The tag goes on that
   tip, so `release`, `develop` and the tag all name one commit.
4. **Tag it annotated** - `git tag -a vX.Y.Z` - with a subject line reading
   `micro-ai-client vX.Y.Z - <what it is>` and a short body. The subject becomes the GitHub release
   title, so it is worth a sentence's thought. Lightweight tags are a defect here, not a shortcut.
5. `git push origin vX.Y.Z`, then `pnpm release:publish vX.Y.Z`.

`pnpm release:check` reports drift - a tag with no GitHub release, a lightweight tag, a tag with no
changelog section - and exits non-zero, so it can be run before a coordinated superproject release.

### GitHub Releases

The tag is the record; `scripts/gh-release.sh` mirrors it onto the repo's Releases page so a reader
landing there sees what `CHANGELOG.md` says instead of a bare tag list. The body is that version's
changelog section verbatim, the title is the annotated tag's subject, and `-rc.N` tags are published
as **pre-releases** so "Latest" always points at a real one. Re-running it on an existing release
updates that release rather than adding another, so a corrected changelog entry can be pushed out
with `pnpm release:publish vX.Y.Z` again.

Everything below `0.6.0-rc.1` was reconstructed from git history (FE-ADR-009); those releases carry a
note saying so.

## Known state

`app/data/*.json` are **mock fixtures**. A few student-facing surfaces still read them instead of the
services and carry `TODO` comments naming their server-backed replacement. Treat anything importing
`~/data/*.json` as not yet real.
