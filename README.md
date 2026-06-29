# @openclaw/uirouter

Small, framework-agnostic router for OpenClaw UI surfaces. It handles route
matching, lazy component loading, data loading with caching and revalidation,
and reactive navigation state.

- ESM-only, TypeScript-first, zero runtime dependencies
- Bring-your-own history (browser, memory, or otherwise)
- Per-route loaders with preload, invalidation, and stale reload
- `notFound` / `redirect` loader control flow
- Fine-grained subscriptions (whole state, selector, or single match)

## Install

```sh
pnpm add @openclaw/uirouter
# or
npm install @openclaw/uirouter
# or
yarn add @openclaw/uirouter
```

Requires Node `^22.18.0 || >=24.11.0`. The package ships ESM and TypeScript
declarations only — there is no CommonJS build.

## Quick start

```ts
import { createRouter, definePage } from "@openclaw/uirouter";

const home = definePage({
  id: "home",
  path: "/",
  component: () => import("./pages/home.js"),
});

const chat = definePage({
  id: "chat",
  path: "/chat",
  component: () => import("./pages/chat.js"),
  loader: async (context, { signal }) => {
    const response = await fetch(`/api/threads/${context.userId}`, { signal });
    return response.json();
  },
});

const router = createRouter<"home" | "chat", { userId: string }>({
  routes: [home, chat],
});

await router.navigate("chat", { userId: "u_1" });
const { matches } = router.getState();
```

The first generic is the union of route ids; the second is the loader
**context** type — an arbitrary value you pass into every navigation so loaders
and hooks can read from session, auth, or DI without reaching for globals.

## History integration

The router does not bind to `window.history` directly. Provide a `RouterHistory`
adapter and call `router.start(history, basePath, context)`:

```ts
import type { RouterHistory, RouteLocation } from "@openclaw/uirouter";

const browserHistory: RouterHistory = {
  location: () => ({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  }),
  push: (loc) => window.history.pushState(null, "", serialize(loc)),
  replace: (loc) => window.history.replaceState(null, "", serialize(loc)),
  listen: (listener) => {
    const onPop = () => listener(browserHistory.location());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  },
};

function serialize(loc: RouteLocation): string {
  return `${loc.pathname}${loc.search}${loc.hash}`;
}

await router.start(browserHistory, "/app", { userId: "u_1" });
```

`start` matches the current location, runs its loader, and subscribes to
history changes. Call `router.stop()` to detach and clear caches.

For programmatic navigation, use `navigate(routeId, context, options)` or
`navigateLocation(location, context)`. Pass `{ history: "push" | "replace" }`
to have the router update the underlying history.

## Loaders, deps, and caching

A `loader` returns the route data; `loaderDeps` derives a string key from
context and location. Two navigations that produce the same `(routeId, deps)`
share a match, so dependency-driven re-fetching is just a matter of returning
a different deps string.

```ts
definePage({
  id: "thread",
  path: "/thread",
  component: () => import("./pages/thread.js"),
  loaderDeps: (_, location) => new URLSearchParams(location.search).get("id") ?? "",
  loader: async (context, { signal, deps }) => {
    const response = await fetch(`/api/threads/${deps}`, { signal });
    return response.json();
  },
  staleTime: 30_000,
  gcTime: 5 * 60_000,
});
```

Per-route cache knobs (all optional, all in milliseconds):

| Option             | Default      | Meaning                                                             |
| ------------------ | ------------ | ------------------------------------------------------------------- |
| `staleTime`        | `0`          | How long a successful match is considered fresh.                    |
| `staleReloadMode`  | `background` | `background`: show cached data and refetch; `blocking`: wait.       |
| `preloadStaleTime` | `30_000`     | Freshness for matches produced by `preloadRoute`/`preloadLocation`. |
| `gcTime`           | `30 min`     | How long an unused cached match is kept.                            |
| `preloadGcTime`    | `30 min`     | GC for preloaded matches.                                           |

The same defaults can be set router-wide via `createRouter({ staleTime, defaultStaleReloadMode, preloadStaleTime, preloadGcTime, gcTime })`.

## Redirects and not-found

Loaders signal control flow by **throwing** the result of `redirect()` or
`notFound()`. Returning them works too; the router treats both equivalently.

```ts
import { definePage, notFound, redirect } from "@openclaw/uirouter";

definePage({
  id: "thread",
  path: "/thread",
  component: () => import("./pages/thread.js"),
  loader: async (context, { signal }) => {
    if (!context.session) {
      throw redirect({ pathname: "/login", search: "", hash: "" });
    }
    const response = await fetch(`/api/thread`, { signal });
    if (response.status === 404) throw notFound({ reason: "thread-missing" });
    return response.json();
  },
});
```

When a redirect is thrown during a real navigation (not a preload), the router
chases it with `history: "replace"`. A `notFound` sets the router status to
`"notFound"` and exposes the payload on the match's `error`.

Unmatched locations also produce `notFound` router state. Applications decide
how to present or redirect that state; the router does not choose a default
route.

## Subscriptions

`getState()` returns the current `RouterState`. To react to changes:

```ts
const unsubscribe = router.subscribe((state) => {
  render(state.matches[0]);
});

// Only fire when status changes
router.subscribeSelector(
  (state) => state.status,
  (status) => console.log(status),
);

// Watch a single match by id (e.g. for a preloaded route)
router.subscribeMatch(matchId, (match) => {
  if (match?.status === "success") prefetchAssets(match.module);
});
```

Selector subscriptions use `Object.is` by default; pass a custom `equal`
comparator for structural checks.

## Preloading, invalidation, and revalidation

```ts
await router.preloadRoute("chat", context);
await router.preloadLocation({ pathname: "/chat", search: "?t=1", hash: "" }, context);

await router.invalidate(); // mark all matches stale
await router.invalidate("chat"); // single route
await router.revalidate(context); // force refetch of the active match
```

`preload*` populates the cache without making the route active. If a cached
match is fresh on the next navigation, it's promoted instantly; otherwise the
router refetches in the background or blocks per `staleReloadMode`.

## Lifecycle hooks

`onEnter` runs after a successful navigation; `onLeave` runs when the previous
match is being replaced by a different route. Both receive the load context,
the resolved data, and the standard `RouteHookOptions` (signal, location,
deps, cause, `shouldRun`).

```ts
definePage({
  id: "chat",
  path: "/chat",
  component: () => import("./pages/chat.js"),
  onEnter: (context, data) => analytics.pageview("chat", data),
  onLeave: () => analytics.flush(),
});
```

If a hook throws, the match transitions to `"error"` and the error propagates
out of the originating `navigate` call.

## API reference

### `createRouter(options)`

Returns a `Router`. Options:

- `routes: PageDefinition[]` — required.
- `staleTime`, `defaultStaleReloadMode`, `preloadStaleTime`,
  `preloadGcTime`, `gcTime` — router-wide defaults.

### `Router`

| Member                                            | Purpose                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| `routes`                                          | Compiled, normalized route definitions.              |
| `getRoute(id)`                                    | Lookup a `PageDefinition` by id.                     |
| `getMatch(matchId)`                               | Lookup a match across active/pending/cached pools.   |
| `getState()`                                      | Current `RouterState`.                               |
| `subscribe(listener)`                             | Subscribe to state changes.                          |
| `subscribeSelector(selector, listener, equal?)`   | Subscribe to a derived slice.                        |
| `subscribeMatch(matchId, listener)`               | Subscribe to a single match.                         |
| `pathForRoute(id, basePath?)`                     | Build a URL pathname for a route.                    |
| `routeIdFromPath(pathname, basePath?)`            | Resolve a path to a route id, or `null`.             |
| `start(history, basePath, context)`               | Attach to history and load the current location.     |
| `navigate(routeId, context, options?, location?)` | Navigate to a route.                                 |
| `navigateLocation(location, context)`             | Navigate to an arbitrary location.                   |
| `preloadRoute(routeId, context)`                  | Warm the cache for a route.                          |
| `preloadLocation(location, context)`              | Warm the cache for a location.                       |
| `revalidate(context, routeId?)`                   | Force refetch of the active or named route.          |
| `invalidate(routeId?)`                            | Mark all (or one) match(es) stale.                   |
| `stop()`                                          | Detach history, abort in-flight loads, clear caches. |

### `definePage(page)`

Identity helper that returns its argument while inferring the strongest
generic types. Use it instead of plain object literals so route ids stay
narrowed.

### `notFound(data?)` / `redirect(location)`

Construct control-flow values for loaders. Throw them (or return them) from a
`loader` to short-circuit a navigation.

### Types

The package exports types for every shape it consumes or produces:

`PageDefinition`, `Router`, `RouterOptions`, `RouterState`, `RouterHistory`,
`RouterNavigationOptions`, `RouterStateSelector`, `RouteMatch`,
`RouteMatchStatus`, `RouteMatchFetching`, `RouteLocation`, `RouteLoadCause`,
`RouteLoaderOptions`, `RouteLoaderResult`, `RouteHookOptions`, `RouteNotFound`,
`RouteRedirect`, `MaybePromise`.

Path helpers: `normalizeRoutePath`, `normalizeRouteBasePath`.

## Scripts

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run check
```

## License

[MIT](LICENSE) © OpenClaw
