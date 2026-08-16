# micro-ai-client

The browser half of **MicroAI**, a fungal-microscopy identification teaching platform. Students
photograph slides and identify organisms; instructors run classes, assignments, exams and grading;
an ML worker assists detection.

A **Nuxt 4 SPA** — `ssr: false`, so there is no Node process in production: `pnpm generate` emits a
static bundle that Caddy serves. It consumes `micro-ai-server`'s HTTP API but does not define it.

This repo is a submodule of the MicroAI superproject, which carries the other services and the docs. Architecture decisions live in `docs/architecture.md`
there — the `FE-ADR-*` entries are this repo's, and later ADRs supersede parts of earlier ones.

## Run it

**pnpm only.** The lockfile is pnpm's; npm or yarn will produce a different tree.

```shell
pnpm install
pnpm dev            # http://localhost:3001
```

You also need **`micro-ai-server` running on :3000**. Nothing here talks to it directly — every
request goes to the relative `/api`, which a Vite dev proxy forwards (FE-ADR-002), so there is no
CORS to configure and no base URL to set. Changing `nuxt.config.ts` needs a **full dev-server
restart**; a browser reload will not pick it up.

```shell
pnpm dev:https      # same server over HTTPS, reachable from a phone on the LAN
```

Use that when testing the camera on a real device: `getUserMedia` only runs in a secure context, so
the in-app viewfinder and its zoom are dead over `http://<lan-ip>` no matter what the code does — the
Camera button falls back to the phone's own camera app. The `//dev:https` key in `package.json` has
the details, including the self-signed-certificate dance on iOS Safari.

`NUXT_PUBLIC_AUTH_DISABLED=true` in `.env` bypasses the route guard entirely (a demo toggle). If
pages seem publicly reachable, check that first.

## Scripts

| | |
|---|---|
| `pnpm dev` / `pnpm dev:https` | dev server on :3001 |
| `pnpm build` / `pnpm preview` | production build, and serve it |
| `pnpm generate` | the static bundle the Docker image publishes — **not** `build` |
| `pnpm typecheck` | `nuxt typecheck` |
| `pnpm test` | vitest, for the pure helpers |
| `pnpm lint:fix` | prettier then eslint |

Husky runs commitlint (conventional commits) and lint-staged on commit and push.

Most of this app is verified through the superproject's `e2e-playwright-ui` suite and by hand rather
than by unit tests — only the pure helpers under `app/core/helpers/` have specs, which is where the
rules worth holding (grading text, the student-vs-staff summary) live.

## Architecture

**Three layers, strictly (FE-ADR-001). Nothing calls `$fetch` or `useFetch` from a page or a store.**

1. `app/plugins/api.ts` creates `$api`, owning the Bearer header and the global 401 handler.
2. `app/services/routes/*.ts` holds every URL string — services never hardcode a path.
3. `app/services/*.ts` are typed methods that call `$api` and **validate every response with Zod** at
   the boundary; the types are inferred from the schemas. Pages and stores call services only.

`app/core/` is reusable and app-agnostic: auto-imported (`imports.dirs: ['core/**']`), with its
components globally registered under the **`Mc`** prefix. `app/features/` is domain-specific, and
`app/pages/` is file-based routing.

Auth (`useAuth`, FE-ADR-003) persists the token and profile to `localStorage`;
`app/middleware/auth.global.ts` gates routes and pages opt into roles with
`definePageMeta({ role: 'instructor' })`. **This is UX, not a security boundary** — the API enforces
access. The role is read from the JWT rather than the stored profile, so the two cannot drift.

Prefer `computed` and derived state over `watch`.

## Versioning

`CHANGELOG.md` is the record. What the version number promises is the *browser-facing surface* — the
pages and journeys, the roles that gate them, the shape of what the UI puts on screen; an API change
is a `micro-ai-server` bump, not this one. Each entry names the server version it was developed
against, as documentation rather than an enforced pairing.

`package.json`'s `version` is baked into `runtimeConfig.public.appVersion` at build time and shown in
the admin console's About panel, so a release bump is the only place it needs changing.

## Known state

`app/data/*.json` are **mock fixtures**. A few student-facing surfaces still read them instead of the
services and carry `TODO` comments naming their server-backed replacement. Treat anything importing
`~/data/*.json` as not yet real.
