## What Problem This Solves

<!--
Describe the concrete problem this PR addresses for consumers of
`@openclaw/uirouter` (apps, integrators, or downstream OpenClaw surfaces).
In 1–3 plain sentences, say who is affected, what happens today, and why it
matters to them. For a bug, name the trigger if known. For a feature or internal
work, describe the need in the actual workflow without inventing harm.
Could a reader understand the problem without knowing your proposed fix?

Good: "Background checks can use up a new user's model allowance before they've
asked the assistant to monitor anything."
Bad: "Turn off periodic checks on fresh installs."

For fixes, this format can help:
"Fixes: <what goes wrong> when <trigger or condition>."

Name the affected router surface (route matching, navigation, loader lifecycle,
caching, subscriptions, history adapter, exports, types). Do not describe the
code-level cause here.

Start with the reader's problem or task and why it matters, before implementation.
Illustrative examples (adapt to the actual change; do not copy as boilerplate):
- Implementation-first: "Add a navigation generation guard."
  Reader-first: "Fixes: a slow loader replaces the current route's data when
  a consumer navigates again before it finishes."
- Implementation-first: "Expand the loaderDeps documentation."
  Reader-first: "App authors need to know which inputs belong in loaderDeps
  so cached route data stays tied to the right match."
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

- before/after behavior for navigation, loading, redirect, notFound, preload,
  invalidate, revalidate, or subscription scenarios
- focused vitest test names from `test/router-*.test.ts`
- output of `pnpm run check` (baseline gate)
- tarball contents from `pnpm run pack:check` when packaging changes
- CI run links or redacted logs

Reviewers will inspect the code, tests, and CI. Use this section to make the
validation easy to understand, not to restate the diff.
Summarize what was checked and the result; note meaningful gaps. Link long output
or put it in optional <details>, keeping the useful evidence summary visible.
Put validation outcomes before commands or logs: say which behavior or artifact
was checked, what happened, and what remains unverified, then give the supporting
command, test name, or link. For example, prefer "An older loader result cannot
replace the current match after a second navigation; the focused stale-result
test passed" over only "Ran pnpm run test." Examples are illustrative, not new
tests or gates.
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
