# Changelog

## Unreleased

### Fixed

- Keep the module loaded after restart when a component import from before stop resolves later.

- Keep empty route IDs and dependency keys containing null characters distinct during matching, and resolve generated paths for routes with repeated trailing slashes.

- Resolve generated route paths consistently when a history adapter starts with a base ending in repeated slashes.

- Replace the history entry when a loader redirects to an unmatched location, keeping the address in sync with the not-found state.

- Start a new loader when returning to a route whose cancelled navigation is still settling.

- Keep a restarted router’s cached component when an import from before stop rejects.

- Release state, selector, and match subscriptions on stop so listeners from a previous session do not receive updates after restart.

- Keep the router idle and skip further loads when a subscriber stops a pending or redirecting navigation.

- Resolve seven development-tool security advisories by selecting patched Vite and refreshing compatible source-map and ID-generator dependencies.

- Force a fresh load when revalidating a named route that is still fresh in the cache.

- Cancel a preload superseded by a forced load so its late failure cannot evict fresh data or follow an obsolete redirect.

- Allow preloading a cached route again after navigating away during revalidation.

### Performance

- Update individual cache entries during preload and navigation. Match lists are copied on demand when a caller reads state or a state subscriber needs a snapshot.

### CI

- Start workflow lint on changes to workflows, action manifests, or lint inputs. Manual CI continues to run it.

- Use the prebuilt actionlint image to skip compiling the workflow linter in each CI run.

- Refresh the formatter, linter, bundler, Vite, and CodeQL patches while preserving runtime requirements and package exports. Thanks @dependabot.

- Reuse the previous pnpm store for each OS and architecture when a dependency update changes the lockfile.

- Pin development to pnpm 11.28.10, the version the CI setup action installs during bootstrap.

- Update Vitest to 5.1.0 and tsdown to 0.23.4, align Oxlint ranges, and remove expired TypeScript cooldown exceptions while retaining the two-day policy. Thanks @dependabot[bot].

- Run ClawSweeper dispatch and weekly stale triage on single-CPU Linux runners.

- Prioritize the latest main commit when merges overlap and let manual CI finish independently.

- Keep full weekly CodeQL analysis without duplicate main-push scans, isolate scheduled and manual runs, and analyze PRs when marked ready for review.

- Refresh tsdown, Vitest, and the type-aware lint backend after retiring Node 25 development qualification; preserve the package's exports and runtime engine range.

- Qualify patched Node 26.12.1 in place of Node 25 for development and retire its dependency-update restrictions. Preserve the published JavaScript engine range and Node 22/24 qualification. Thanks @joshavant.

- Cancel outstanding PR matrix jobs after the first package check fails. Main and manual runs report every platform.

- Split macOS and Windows checks between Node 24 on pull requests and Node 22 on main. Manual runs cover both versions.

- Pin Node 22/24 CI checks to 22.23.4/24.22.1 while retaining Node 25 compatibility coverage.

- Keep tsdown and Vitest on their Node 25-compatible release lines, prevent incompatible automated upgrades, and refresh the formatter, linter, test patches, and pnpm 11 tooling. Thanks @dependabot.

- Use Node.js24.22.1 for release tooling to reject the disclosed eMudhra incident keys.

- Update CodeQL to 4.39.0 while preserving the Node 25-compatible build and test toolchain. Thanks @dependabot.
- Skip allocating a dispatch runner for issue and comment events that fail the existing author checks.

- Run macOS checks on Apple Silicon `xcode-27` runners and support non-publishing release validation on `main`.

- Update oxfmt to 0.73.0 and oxlint to 1.88.0 while retaining the complete Node 25-compatible build toolchain. Thanks @dependabot.
- Refresh the formatter, linter, and Node setup action while preserving Node 25-compatible build tooling. Thanks @dependabot.
- Refresh Node types and check Node 25 in CI while retaining compatible build and test tools. Thanks @dependabot.

## 0.1.2 - 2026-10-01

**Highlights:** Navigation, refresh, cancellation, and cache state now stay aligned across overlapping route transitions.

### Fixed

- Abort a preload joined by navigation when the router stops so a late loader result cannot replace the next active match.
- Let a pending navigation finish when invalidate or revalidate runs without a route id, so the destination stays active instead of leaving history and router state split.
- Reject loader redirect cycles and chains longer than 10 redirects during navigation and preload; even terminating chains above the limit now fail. Thanks @SebTardif.
- Restore strict dependency engine checks with pnpm 11 so unsupported development installs fail early. Thanks @dependabot.
- Ignore cancelled preload failures and redirects after stopping so late results cannot start new loads or remove replacement cached matches.
- Contain synchronous component and loader exceptions so parallel load failures cannot escape as unhandled rejections or prevent component loading.
- Ignore late lifecycle-hook failures after navigation is superseded or the router stops, preserving the current route state.
- Prevent infinite or oversized cache retention from overflowing host timers, preserving finite expiry and clearing obsolete preload timers. Thanks @SebTardif.
- Use the latest navigation context for history changes and establish new context before listening when restarting history. Thanks @SebTardif.

### CI

- Refresh Node types, the type-aware linter, and CodeQL while retaining the Node 25-compatible build toolchain. Thanks @dependabot.
- Refresh development dependencies, pnpm, and pinned GitHub Actions without changing the router API or runtime requirements.
- Pass the repository explicitly to the GitHub Release job so it works without a local checkout.

## 0.1.1

### Fixed

- Cancel pending navigation when returning to the active route so stale loaders cannot win later.

## 0.1.0

Initial standalone release of `@openclaw/uirouter`.

### Added

- Added the framework-independent router core with route matching, route
  identity, history integration, navigation, redirects, not-found results,
  lifecycle hooks, and reactive subscriptions.
- Added active, pending, and cached route match records with dependency-keyed
  identity through `loaderDeps`.
- Added component loading and route data loading with preload, stale reload,
  invalidation, revalidation, retry, cancellation, stale-result suppression,
  and garbage collection.
- Added public TypeScript contracts and ESM package exports for the router API,
  page definitions, route locations, history adapters, matches, loader results,
  redirects, and not-found results.
- Added package contract tests for route matching, navigation, control results,
  stale navigation, preloading, invalidation, subscriptions, history, loading,
  lifecycle hooks, retry, and cache behavior.
- Added package validation that builds, packs, verifies the tarball allowlist,
  installs the packed package, and imports `@openclaw/uirouter`.

### Documentation

- Added README coverage for installation, quick start, browser history
  integration, loaders, loader dependencies, caching, redirects, not-found
  results, subscriptions, preloading, invalidation, revalidation, lifecycle
  hooks, and API reference.
- Added GitHub PR and issue templates tailored to router package changes.
- Added agent instructions documenting package ownership, architecture
  boundaries, commands, verification, and contribution expectations.

### CI

- Added GitHub Actions CI across Node 22 and Node 24 on Ubuntu, macOS, and
  Windows.
- Added CodeQL scanning for JavaScript/TypeScript and GitHub Actions workflows.
- Added tag-driven npm trusted-publishing release automation, stale triage,
  CODEOWNERS, SECURITY.md, and CONTRIBUTING.md.
