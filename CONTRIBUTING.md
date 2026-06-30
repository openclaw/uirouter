# Contributing to @openclaw/uirouter

Thanks for helping improve the standalone router used by OpenClaw UI surfaces.

Report security issues privately as described in [SECURITY.md](SECURITY.md).

## Before You Start

- Bugs and small fixes can go directly to a focused pull request.
- Discuss breaking API changes or large routing semantics changes in an issue
  before implementation.
- Search existing issues and pull requests before opening a duplicate.

## Development Setup

Use the Node.js and pnpm versions declared by the repository.

```bash
pnpm install --frozen-lockfile
pnpm run check
```

Use the smallest relevant command while iterating:

```bash
pnpm run build
pnpm run test
```

Do not replace pnpm, regenerate the lockfile with another package manager, or
edit generated output by hand.

## Pull Requests

- Keep one logical change per pull request.
- Use a conventional title such as `fix(loading): suppress stale loader result`.
- Explain the problem, the chosen solution, and compatibility implications.
- Add or update tests for behavior changes.
- Cover affected matching, history, loader, cache, subscription, or lifecycle
  paths when behavior is shared.
- Update `CHANGELOG.md` for user-visible, compatibility, security, or
  operational changes.
- Run `pnpm run check` and report the exact validation performed.
- Resolve addressed review conversations before requesting another review.

Route matching, navigation results, loader cancellation, stale-result handling,
subscriptions, exported types, and package output are public compatibility
surfaces. Prefer additive changes and call out any deliberate break explicitly.

For non-trivial changes, run the repository autoreview helper before handoff:

```bash
.agents/skills/autoreview/scripts/autoreview
```

## Reporting Bugs

Use the bug report template and include:

- the exact package version or commit
- the runtime and operating system
- a minimal reproduction
- expected and actual behavior
- relevant redacted route definitions, state, or logs

Never include credentials, private hostnames, personal paths, or sensitive
application data.

## Release Process

After the one-time registry bootstrap package, maintainers publish from a
`vX.Y.Z` tag on `main` through the trusted-publishing workflow. Do not add an
npm automation token.
