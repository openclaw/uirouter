# Changelog

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
  CODEOWNERS, SECURITY.md, CONTRIBUTING.md, and the repository autoreview
  helper.
