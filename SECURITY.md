# Security Policy

If you believe you found a security issue in `@openclaw/uirouter`, report it
privately.

## Reporting

Open a private report through
[GitHub Security Advisories](https://github.com/openclaw/uirouter/security/advisories/new)
or email `security@openclaw.ai`.

Include:

1. affected version or commit
2. runtime and operating system
3. minimal reproduction
4. demonstrated impact
5. suggested remediation, if known

Do not open a public issue until maintainers have coordinated disclosure.

## Scope

Security issues in scope generally include:

- route matching or redirect behavior that crosses a documented trust boundary
- stale async results overwriting the active route after cancellation
- loader data leaking between route identities or subscribers
- package or release-pipeline compromise affecting the published package

Reports must demonstrate a concrete boundary bypass or impact. Application-level
authorization, page rendering, Gateway requests, and navigation policy belong to
the consuming application unless this package documents and fails to enforce a
specific router invariant.

## Operational Guidance

- Keep `@openclaw/uirouter`, Node.js, and browser runtimes current.
- Treat route parameters, loader input, and loader output as untrusted data.
- Keep application authorization checks outside the router.
- Pin and review dependency updates before publishing.

There is currently no paid bug bounty program.
