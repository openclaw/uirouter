## What Problem This Solves

<!--
Describe the concrete problem this PR addresses for consumers of
`@openclaw/uirouter` (apps, integrators, or downstream OpenClaw surfaces).
For fixes, begin with:
"Fixes an issue where consumers <do X> would <experience Y> when <condition>."
or:
"Resolves a problem where..."

Name the affected router surface (route matching, navigation, loader lifecycle,
caching, subscriptions, history adapter, exports, types). Do not describe the
code-level cause here.
-->

## Why This Change Was Made

<!--
In one or two sentences, explain the complete shipped solution, key design
decisions, and relevant boundaries or non-goals. Call out anything that affects
the router contract: public exports, types, history adapter shape, loader
cancellation, stale/revalidation semantics, caching, lifecycle hooks, or
supported runtimes. Avoid file-by-file narration.
-->

## User Impact

<!--
State what consumers of `@openclaw/uirouter` can now do or expect. Lead with
the concrete benefit and use user-facing language.

If this is a breaking change, describe what breaks and the migration path, and
make sure `CHANGELOG.md` is updated. If this only affects internal layout,
tooling, tests, or docs and ships nothing new in `dist/`, say so plainly.
-->

## Evidence

<!--
Show the most useful proof that this change works. Useful evidence includes:

- output of `pnpm run check` (baseline gate)
- focused vitest test names from `test/router-*.test.ts`
- before/after behavior for navigation, loading, redirect, notFound, preload,
  invalidate, revalidate, or subscription scenarios
- tarball contents from `pnpm run pack:check` when packaging changes
- CI run links or redacted logs

Reviewers will inspect the code, tests, and CI. Use this section to make the
validation easy to understand, not to restate the diff.
-->

<!--
Optional linked context:
Add a visible `Closes #<issue-number>` or `Related: #<issue-number>` line below
this comment.

Required PR title:
type: user-facing description
Use a parenthesized scope only when it adds clarity:
fix(loader): preload retains cached match after redirect

Types: feat, fix, improve, refactor, docs, chore.
Suggested scopes: router, matches, loading, types, history, exports, build,
ci, deps, docs, tests.

For fixes, describe the user-visible symptom and trigger:
fix(loading): preload retains cached match after loader throws redirect
Avoid implementation details such as:
fix: add null check in navigate

Reminder: never commit `dist/` or `.artifacts/` — they are build/local-only.
-->
