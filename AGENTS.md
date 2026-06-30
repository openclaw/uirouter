# AGENTS.md

## Overview

This repository is the standalone `@openclaw/uirouter` package. It is a small,
framework-independent TypeScript router for OpenClaw UI surfaces.

The router handles generic routing mechanics: route matching, route identity,
component loading, route data loading, cache reuse, invalidation,
revalidation, history integration, lifecycle hooks, and subscriptions.

The router is not an application framework and not an application state store.
Do not put page rendering, shell behavior, sidebar metadata, default-route
policy, Gateway calls, or app-specific state in this package.

## Architecture

The router owns:

- route matching, route identity, and route path normalization
- active, pending, and cached route matches
- route loader data and component loading
- parallel component/data loading
- preload, stale reload, invalidation, revalidation, retry, and GC
- cancellation and stale-result suppression
- redirect and not-found control results
- history adapter integration
- `onEnter` and `onLeave`
- router state, selector subscriptions, and match subscriptions

The router does not own:

- Lit, React, or any rendering adapter
- page components, page templates, or page state
- OpenClaw application context or runtime dependencies
- Gateway clients or Gateway request logic
- navigation labels, icons, ordering, sections, or sidebar behavior
- loading cards, error UI, retry UI, or not-found UI
- default application route or unknown-location policy
- generated route discovery, `import.meta.glob`, nested route-tree generation,
  or unsupported runtime behavior

Applications provide route catalogs, history adapters, and presentation
boundaries. Applications decide how pending, error, not-found, redirect, stale,
and unknown-location states are shown. The router exposes state and transition
results only.

`loaderDeps` is the match identity boundary. Do not use hidden global state or
application state to decide cache identity.

`staleTime: 0` means route data is immediately eligible for revalidation. It
does not mean the active page disappears, and it does not mean navigation must
wait for route data before a loaded component can be visible.

Successful stale matches remain visible during background revalidation. Stale
async results must never overwrite the current route.

`stop()` must release router-owned resources: history listeners, timers,
subscriptions, abort controllers, and in-flight work.

## Code Style

- Use strict TypeScript and ESM.
- Preserve zero runtime dependencies unless explicitly approved.
- Keep public exports intentional and narrow.
- Avoid `any`; use explicit generics, `unknown`, and narrowing.
- Keep types close to their owner unless they are part of the public API.
- Prefer small direct helpers when they remove real duplication or clarify
  lifecycle, cache, cancellation, or stale-result behavior.
- Do not add fallbacks, shims, aliases, or compatibility branches for internal
  behavior that is not a public package contract.
- Do not add app-specific flags, page-specific router behavior, rendering
  decisions, or unsupported feature claims.
- Comments should explain non-obvious lifecycle, cleanup, cache, cancellation,
  or stale-result invariants. Do not narrate syntax.

## Commands

Use the package manager declared in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm run check
```

Focused commands:

```sh
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run pack:check
pnpm run format:check
pnpm run format
```

`pnpm run check` is the baseline quality gate. It runs format check, build,
typecheck, lint, tests, and package pack/import validation.

## Verification

Before considering a code change ready:

- Run focused tests that prove the changed router behavior.
- Run `pnpm run check`.
- Run `git diff --check`.
- Inspect `git diff --stat` and remove unnecessary production LOC.

For package, export, build, README-visible, or release-facing changes, ensure
`pnpm run pack:check` is covered directly or through `pnpm run check`.

For workflow and GitHub-template changes, validate YAML where practical:

```sh
ruby -e 'require "yaml"; Dir[".github/**/*.yml"].sort.each { |f| YAML.load_file(f); puts "ok #{f}" }'
```

Update `README.md` when public API, package output, runtime support, or usage
examples change. Update `CHANGELOG.md` for release-facing changes. Never commit
`dist/`, `.artifacts/`, or `node_modules/`.

## GitHub / PRs

- Use the repository PR template and describe the consumer-visible problem,
  shipped behavior, user impact, and evidence.
- Call out compatibility impact for exports, types, history adapters, loaders,
  cancellation, cache semantics, revalidation, lifecycle hooks, and runtime
  support.
- Use issue templates for bugs and feature requests; keep template fields
  aligned with actual router surfaces.
- Do not post credentials, private paths, private hosts, or sensitive logs.
- Do not push, publish, create releases, or post public GitHub comments unless
  explicitly asked.
- Releases are tag-driven from `main` through `.github/workflows/release.yml`.
- After the one-time registry bootstrap package, never publish locally or add
  long-lived npm tokens to repository settings.

## Map

- `src/`: router source.
- `test/`: public behavior tests.
- `scripts/`: package validation scripts.
- `.github/`: workflows, issue templates, and PR template.
- `.agents/skills/autoreview/`: structured review closeout helper.
