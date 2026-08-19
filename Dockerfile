# syntax=docker/dockerfile:1

# Build-only container: compiles the Nuxt SPA (ssr:false -> static .output/public) and, at RUNTIME,
# publishes it into the ./client-dist bind mount Caddy serves. A build-time COPY into /output would
# be shadowed by that mount, so the copy happens in CMD.

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The committed .env sets NUXT_PUBLIC_AUTH_DISABLED=true, which disables every route guard.
# Force it off for a real build; process.env wins over the .env file.
ENV NUXT_PUBLIC_AUTH_DISABLED=false
# `generate`, not `build`: this SPA (ssr:false) is served statically by Caddy with no Node process,
# so it needs a prerendered static index.html in .output/public. `nuxt build` targets the Nitro
# server and emits no static entry HTML - Caddy's try_files /index.html would 404.
RUN pnpm generate

FROM alpine:3.22
COPY --from=build /app/.output/public /dist
CMD ["sh", "-c", "cp -a /dist/. /output/ && echo 'client published to /output'"]
