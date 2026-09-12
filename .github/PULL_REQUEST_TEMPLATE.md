## What Problem This Solves

<!--
Describe the concrete problem this PR addresses for consumers of
`@openclaw/uirouter` (apps, integrators, or downstream OpenClaw surfaces).
Use one short, plain-language sentence. For fixes, prefer:
"Fixes: <what goes wrong> when <trigger or condition>."
For other changes, describe the need without inventing a bug.

Name the affected router surface (route matching, navigation, loader lifecycle,
caching, subscriptions, history adapter, exports, types). Do not describe the
code-level cause here.
-->

## User Impact

<!--
"User impact: <what router consumers can now do or expect>."
Lead with the concrete outcome in plain language, usually one sentence.
For internal-only changes, say there is no user-visible change; do not invent a benefit.
Keep important risks, breaking changes, migrations, and required user actions visible here.
Mention changes to public exports, types, history adapters, loader cancellation,
cache or revalidation behavior, lifecycle hooks, and runtime support only when
relevant. For breaking changes, describe the migration and update `CHANGELOG.md`.
For internal layout, tooling, tests, or docs that ship nothing new in `dist/`, say so.
-->

## Why This Change Was Made

<!--
Briefly explain how the change addresses the problem without repeating the impact.
Keep the body short. Leave file lists, internal acronyms, and root-cause walkthroughs
in the diff or optional <details>; include technical detail only when it explains
behavior or a material tradeoff. Do not hide risks or required actions in <details>.
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
Summarize what was checked and the result; note meaningful gaps. Link long output
or put it in optional <details>, keeping the useful evidence summary visible.
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
