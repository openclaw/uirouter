import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouter, definePage, type RouteLoadCause, type RouteLocation } from "../src/index";

type RouteId = "slow" | "fast" | "chat";
type TestContext = {
  label: string;
};
type TestModule = {
  view: string;
};
type TestData = {
  label: string;
  route: RouteId;
  cause?: RouteLoadCause;
  dep?: string;
  version?: number;
};
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function ignoreResolve(_value: unknown): void {}

function ignoreReject(_error: unknown): void {}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = ignoreResolve;
  let reject: (error: unknown) => void = ignoreReject;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function location(pathname: string, search = "", hash = ""): RouteLocation {
  return { pathname, search, hash };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}

describe("router loading", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes a loaded target component before slower route data resolves", async () => {
    const data = deferred<TestData>();
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          component: () => ({ view: "chat" }),
          loader: () => data.promise,
        }),
      ],
    });

    const navigation = router.navigate("chat", { label: "agent" });
    await waitFor(() => router.getState().matches[0]?.module !== undefined);

    const loadingState = router.getState();
    expect(loadingState.status).toBe("loading");
    expect(loadingState.pendingMatches).toEqual([]);
    expect(loadingState.matches[0]).toMatchObject({
      routeId: "chat",
      status: "pending",
      module: { view: "chat" },
    });
    expect(loadingState.matches[0]?.data).toBeUndefined();

    data.resolve({ label: "agent", route: "chat" });
    await navigation;
    expect(router.getState().matches[0]).toMatchObject({
      routeId: "chat",
      status: "success",
      data: { label: "agent", route: "chat" },
    });
  });

  it("does not let stale async navigation overwrite the current route", async () => {
    const slowData = deferred<TestData>();
    let slowSignal: AbortSignal | undefined;
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"slow", TestContext, TestModule, TestData>({
          id: "slow",
          path: "/slow",
          component: () => ({ view: "slow" }),
          loader: (_context, options) => {
            slowSignal = options.signal;
            return slowData.promise;
          },
        }),
        definePage<"fast", TestContext, TestModule, TestData>({
          id: "fast",
          path: "/fast",
          component: () => ({ view: "fast" }),
          loader: (context) => ({ label: context.label, route: "fast" }),
        }),
      ],
    });

    const slowNavigation = router.navigate("slow", { label: "old" });
    await router.navigate("fast", { label: "new" });
    slowData.resolve({ label: "old", route: "slow" });
    await slowNavigation;

    const state = router.getState();
    const [match] = state.matches;
    expect(slowSignal?.aborted).toBe(true);
    expect(state.status).toBe("success");
    expect(match).toMatchObject({
      routeId: "fast",
      status: "success",
      data: { label: "new", route: "fast" },
      module: { view: "fast" },
    });
  });

  it("keeps stale active content visible during background reload", async () => {
    const reloadData = deferred<TestData>();
    let loadCount = 0;
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          staleTime: -1,
          component: () => ({ view: "chat" }),
          loader: (context, options) => {
            loadCount += 1;
            if (loadCount === 2) {
              return reloadData.promise;
            }
            return {
              label: context.label,
              route: "chat",
              cause: options.cause,
              version: loadCount,
            };
          },
        }),
        definePage<"fast", TestContext, TestModule, TestData>({
          id: "fast",
          path: "/fast",
          component: () => ({ view: "fast" }),
          loader: (context) => ({ label: context.label, route: "fast" }),
        }),
      ],
    });

    await router.navigate("chat", { label: "old" });
    await router.navigate("fast", { label: "other" });
    await router.navigate("chat", { label: "new" });

    const staleState = router.getState();
    expect(staleState.status).toBe("success");
    expect(staleState.matches[0]).toMatchObject({
      routeId: "chat",
      status: "success",
      isFetching: "loader",
      data: { label: "old", route: "chat", cause: "navigation", version: 1 },
    });

    reloadData.resolve({ label: "new", route: "chat", cause: "navigation", version: 2 });
    await waitFor(() => router.getState().matches[0]?.isFetching === false);
    expect(router.getState().matches[0]).toMatchObject({
      routeId: "chat",
      status: "success",
      data: { label: "new", route: "chat", cause: "navigation", version: 2 },
    });
  });

  it("preloads a route into cache and reuses the fresh match on navigation", async () => {
    const loadCauses: RouteLoadCause[] = [];
    let componentCalls = 0;
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          component: () => {
            componentCalls += 1;
            return { view: "chat" };
          },
          loader: (context, options) => {
            loadCauses.push(options.cause);
            return {
              label: context.label,
              route: "chat",
              cause: options.cause,
            };
          },
        }),
      ],
    });

    await router.preloadRoute("chat", { label: "preloaded" });

    const [cached] = router.getState().cachedMatches;
    expect(cached).toMatchObject({
      routeId: "chat",
      status: "success",
      preload: true,
      data: { label: "preloaded", route: "chat", cause: "preload" },
      module: { view: "chat" },
    });

    await router.navigate("chat", { label: "navigated" });

    const [match] = router.getState().matches;
    expect(loadCauses).toEqual(["preload"]);
    expect(componentCalls).toBe(1);
    expect(match).toMatchObject({
      routeId: "chat",
      status: "success",
      preload: false,
      data: { label: "preloaded", route: "chat", cause: "preload" },
      module: { view: "chat" },
    });
  });

  it("invalidates the active route and refreshes it with the latest context", async () => {
    let loadCount = 0;
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          component: () => ({ view: "chat" }),
          loader: (context, options) => {
            loadCount += 1;
            return {
              label: context.label,
              route: "chat",
              cause: options.cause,
              version: loadCount,
            };
          },
        }),
      ],
    });

    await router.navigate("chat", { label: "agent" });
    await router.invalidate("chat");

    const [match] = router.getState().matches;
    expect(loadCount).toBe(2);
    expect(match).toMatchObject({
      routeId: "chat",
      status: "success",
      data: { label: "agent", route: "chat", cause: "revalidate", version: 2 },
      invalid: false,
    });
  });

  it("keys route identity by loader dependencies", async () => {
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          component: () => ({ view: "chat" }),
          loaderDeps: (_context, routeLocation) => routeLocation.search,
          loader: (context, options) => ({
            label: context.label,
            route: "chat",
            dep: options.deps,
          }),
        }),
      ],
    });

    await router.navigate("chat", { label: "one" }, {}, location("/chat", "?session=one"));
    const firstMatch = router.getState().matches[0];
    await router.navigate("chat", { label: "two" }, {}, location("/chat", "?session=two"));
    const secondMatch = router.getState().matches[0];

    expect(firstMatch?.id).not.toBe(secondMatch?.id);
    expect(secondMatch).toMatchObject({
      routeId: "chat",
      data: { label: "two", route: "chat", dep: "?session=two" },
    });
    expect(router.getState().cachedMatches[0]).toMatchObject({
      id: firstMatch?.id,
      data: { label: "one", route: "chat", dep: "?session=one" },
    });
  });

  it("garbage-collects expired cached preload matches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          preloadGcTime: 10,
          component: () => ({ view: "chat" }),
          loader: (context) => ({ label: context.label, route: "chat" }),
        }),
      ],
    });

    await router.preloadRoute("chat", { label: "preloaded" });
    expect(router.getState().cachedMatches).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(11);

    expect(router.getState().cachedMatches).toEqual([]);
  });

  it("aborts in-flight work and clears route state on stop", async () => {
    const data = deferred<TestData>();
    let signal: AbortSignal | undefined;
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          component: () => ({ view: "chat" }),
          loader: (_context, options) => {
            signal = options.signal;
            return data.promise;
          },
        }),
      ],
    });

    void router.navigate("chat", { label: "agent" });
    await waitFor(() => signal !== undefined);
    router.stop();

    expect(signal?.aborted).toBe(true);
    expect(router.getState()).toMatchObject({
      status: "idle",
      matches: [],
      pendingMatches: [],
      cachedMatches: [],
    });
  });
});
