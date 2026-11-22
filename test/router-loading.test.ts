import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouter, definePage, type RouteLoadCause } from "../src/index";
import { deferred, location } from "./fixtures";

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
const cacheRoutes = [
  { id: "chat", path: "/chat", component: () => "chat" },
  { id: "other", path: "/other", component: () => "other" },
];
const MAX_TIMER_DELAY = 2 ** 31 - 1;

describe("router loading", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts component and data loads in parallel and publishes the component first", async () => {
    const module = deferred<string>();
    const data = deferred<string>();
    const component = vi.fn(() => module.promise);
    const loader = vi.fn(() => data.promise);
    const router = createRouter({ routes: [{ id: "chat", path: "/chat", component, loader }] });

    const navigation = router.navigate("chat", undefined);
    const calls = () => [component.mock.calls.length, loader.mock.calls.length];
    await expect.poll(calls).toEqual([1, 1]);
    module.resolve("view");
    await expect.poll(() => router.getState().matches[0]?.module).toBe("view");
    expect(router.getState()).toMatchObject({
      status: "loading",
      pendingMatches: [],
      matches: [{ routeId: "chat", status: "pending" }],
    });
    expect(router.getState().matches[0].data).toBeUndefined();

    data.resolve("loaded");
    await navigation;
    expect(router.getState().matches).toMatchObject([{ status: "success", data: "loaded" }]);
    router.stop();
  });

  it("starts a fresh loader when returning to a cancelled match", async () => {
    const first = deferred<string>();
    const loader = vi.fn((context: string) => (context === "first" ? first.promise : context));
    const router = createRouter({
      routes: [
        { id: "a", path: "/a", component: () => "a", loader },
        { id: "b", path: "/b", component: () => "b" },
      ],
    });
    const cancelled = router.navigate("a", "first");
    await router.navigate("b", "away");
    const returned = router.navigate("a", "second");
    first.resolve("obsolete");
    await Promise.all([cancelled, returned]);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(router.getState()).toMatchObject({
      status: "success",
      matches: [{ routeId: "a", status: "success", data: "second" }],
    });
    router.stop();
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

  it("cancels a pending navigation when returning to the active match", async () => {
    const slowData = deferred<TestData>();
    const slowModule = deferred<TestModule>();
    const fastLoader = vi.fn((context: TestContext) => ({
      label: context.label,
      route: "fast" as const,
    }));
    const lifecycle: string[] = [];
    let slowSignal: AbortSignal | undefined;
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"slow", TestContext, TestModule, TestData>({
          id: "slow",
          path: "/slow",
          component: () => slowModule.promise,
          loader: (_context, options) => {
            slowSignal = options.signal;
            return slowData.promise;
          },
          onEnter: () => {
            lifecycle.push("enter:slow");
          },
        }),
        definePage<"fast", TestContext, TestModule, TestData>({
          id: "fast",
          path: "/fast",
          component: () => ({ view: "fast" }),
          loader: fastLoader,
          onEnter: () => {
            lifecycle.push("enter:fast");
          },
          onLeave: () => {
            lifecycle.push("leave:fast");
          },
        }),
      ],
    });

    await router.navigate("fast", { label: "active" });
    const active = router.getState().matches[0];
    const slowNavigation = router.navigate("slow", { label: "stale" });
    await expect.poll(() => slowSignal).toBeDefined();
    const published = [] as ReturnType<typeof router.getState>[];
    router.subscribe((state) => published.push(state));

    const latest = location("/fast", "?latest=1", "#kept");
    await router.navigate("fast", { label: "latest" }, undefined, latest);

    const state = router.getState();
    expect(slowSignal?.aborted).toBe(true);
    expect(state).toMatchObject({
      status: "success",
      location: latest,
      resolvedLocation: latest,
      pendingMatches: [],
    });
    expect(state.matches[0]).toMatchObject({ routeId: "fast", location: latest });
    expect(state.matches[0]?.data).toBe(active?.data);
    expect(state.matches[0]?.module).toBe(active?.module);
    expect(fastLoader).toHaveBeenCalledOnce();
    expect(lifecycle).toEqual(["enter:fast"]);
    expect(published.length).toBeGreaterThan(0);
    expect(published.every((snapshot) => snapshot.pendingMatches.length === 0)).toBe(true);

    slowData.resolve({ label: "stale", route: "slow" });
    slowModule.resolve({ view: "slow" });
    await slowNavigation;
    expect(router.getState()).toEqual(state);
    expect(lifecycle).toEqual(["enter:fast"]);
  });

  it("keeps stale active content visible during background reload", async () => {
    const reloadData = deferred<TestData>();
    let loadCount = 0;
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          staleTime: 0,
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
    await expect.poll(() => router.getState().matches[0]?.isFetching).toBe(false);
    expect(router.getState().matches[0]).toMatchObject({
      routeId: "chat",
      status: "success",
      data: { label: "new", route: "chat", cause: "navigation", version: 2 },
    });
  });

  it.each([
    ["background", Infinity, 0, "preload:seed", "navigation:return"],
    ["background", 0, Infinity, "navigation:first", "navigation:first"],
    ["blocking", 0, Infinity, "navigation:first", "navigation:first"],
  ] as const)(
    "uses the producing load's freshness on promotion (%s, preloadStaleTime %s)",
    async (staleReloadMode, preloadStaleTime, staleTime, firstData, returnData) => {
      const component = vi.fn(() => "chat");
      const causes: RouteLoadCause[] = [];
      const router = createRouter({
        routes: [
          {
            id: "chat",
            path: "/chat",
            component,
            staleReloadMode,
            preloadStaleTime,
            staleTime,
            loader: (context: string, { cause }) => {
              causes.push(cause);
              return `${cause}:${context}`;
            },
          },
          { id: "other", path: "/other", component: () => "other" },
        ],
      });
      await router.preloadRoute("chat", "seed");
      expect(router.getState().cachedMatches).toMatchObject([
        { routeId: "chat", status: "success", preload: true, module: "chat", data: "preload:seed" },
      ]);
      const active = () => router.getState().matches[0];
      await router.navigate("chat", "first");
      await expect.poll(active).toMatchObject({
        routeId: "chat",
        status: "success",
        module: "chat",
        data: firstData,
        preload: false,
        isFetching: false,
      });
      await router.navigate("other", "away");
      await router.navigate("chat", "return");
      await expect.poll(active).toMatchObject({
        routeId: "chat",
        status: "success",
        data: returnData,
        preload: false,
        isFetching: false,
      });
      expect(causes).toEqual(["preload", "navigation"]);
      expect(component).toHaveBeenCalledOnce();
      router.stop();
    },
  );

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
    await router.navigate("chat", { label: "updated" });
    await router.invalidate("chat");

    const [match] = router.getState().matches;
    expect(loadCount).toBe(2);
    expect(match).toMatchObject({
      routeId: "chat",
      status: "success",
      data: { label: "updated", route: "chat", cause: "revalidate", version: 2 },
      invalid: false,
    });
  });

  it("preloads a cached route after its revalidation was cancelled", async () => {
    const refresh = deferred<string>();
    const router = createRouter({
      routes: [
        {
          id: "a",
          path: "/a",
          component: () => "a",
          loader: (context: string, { signal }) => {
            signal.throwIfAborted();
            return context === "refresh" ? refresh.promise : context;
          },
        },
        { id: "b", path: "/b", component: () => "b" },
      ],
    });

    await router.navigate("a", "seed");
    const refreshing = router.revalidate("refresh");
    await router.navigate("b", "away");
    expect(router.getState().cachedMatches[0]?.isFetching).toBe(false);
    await router.preloadRoute("a", "replacement");
    refresh.resolve("obsolete");
    await refreshing;

    expect(router.getState().cachedMatches).toMatchObject([
      { routeId: "a", status: "success", data: "replacement", isFetching: false },
    ]);
    router.stop();
  });

  it("refetches a named route even when its cached match is fresh", async () => {
    const loader = vi.fn((context: string, { cause }: { cause: RouteLoadCause }) => ({
      context,
      cause,
    }));
    const router = createRouter({
      staleTime: Infinity,
      routes: [
        { id: "chat", path: "/chat", component: () => "chat", loader },
        { id: "other", path: "/other", component: () => "other" },
      ],
    });
    await router.navigate("chat", "old");
    await router.navigate("other", "away");
    await router.revalidate("new", "chat");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(router.getState().matches).toMatchObject([
      { routeId: "chat", data: { context: "new", cause: "revalidate" } },
    ]);
    router.stop();
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
    const router = createRouter({
      routes: [{ id: "chat", path: "/chat", preloadGcTime: 10, component: () => "chat" }],
    });
    await router.preloadRoute("chat", undefined);
    await vi.advanceTimersByTimeAsync(9);
    expect(router.getState().cachedMatches).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(router.getState().cachedMatches).toEqual([]);
    router.stop();
  });

  it.each(["navigation", "preload"] as const)(
    "keeps %s matches with infinite retention without a timer",
    async (cause) => {
      vi.useFakeTimers();
      const router = createRouter({
        gcTime: cause === "navigation" ? Infinity : 10,
        preloadGcTime: cause === "preload" ? Infinity : 10,
        routes: [
          { id: "chat", path: "/chat", component: () => "chat" },
          { id: "other", path: "/other", component: () => "other" },
        ],
      });
      if (cause === "preload") {
        await router.preloadRoute("chat", undefined);
      } else {
        await router.navigate("chat", undefined);
        await router.navigate("other", undefined);
      }
      expect(router.getState().cachedMatches).toMatchObject([{ routeId: "chat" }]);
      expect(vi.getTimerCount()).toBe(0);
      router.stop();
    },
  );

  it.each([-Infinity, Number.NaN])("expires cached matches with gcTime %s", async (gcTime) => {
    vi.useFakeTimers();
    const router = createRouter({
      gcTime,
      routes: cacheRoutes,
    });
    await router.navigate("chat", undefined);
    await router.navigate("other", undefined);
    if (Number.isNaN(gcTime)) {
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(router.getState().cachedMatches).toEqual([]);
    router.stop();
  });

  it("cancels a finite preload timer when cache retention becomes Infinity", async () => {
    vi.useFakeTimers();
    const router = createRouter({ preloadGcTime: 10, gcTime: Infinity, routes: cacheRoutes });
    await router.preloadRoute("chat", undefined);
    expect(vi.getTimerCount()).toBe(1);
    await router.navigate("chat", undefined);
    await router.navigate("other", undefined);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10);
    expect(router.getState().cachedMatches).toMatchObject([{ routeId: "chat", status: "success" }]);
    router.stop();
  });

  it.each(["navigation", "preload"] as const)(
    "expires long %s retention only after the full duration",
    async (cause) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const retention = 30 * 24 * 60 * 60 * 1000;
      const router = createRouter({
        preloadGcTime: retention,
        gcTime: retention,
        routes: [
          { id: "chat", path: "/chat", component: () => "chat" },
          { id: "other", path: "/other", component: () => "other" },
        ],
      });

      if (cause === "preload") {
        await router.preloadRoute("chat", undefined);
      } else {
        await router.navigate("chat", undefined);
        await router.navigate("other", undefined);
      }
      await vi.advanceTimersToNextTimerAsync();
      expect(Date.now()).toBe(MAX_TIMER_DELAY);
      expect(router.getState().cachedMatches).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(retention - MAX_TIMER_DELAY - 1);
      expect(router.getState().cachedMatches).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(router.getState().cachedMatches).toEqual([]);
      router.stop();
    },
  );

  it.each(["pending", "fetching"] as const)(
    "stays idle when a subscriber stops a %s navigation",
    async (phase) => {
      const component = vi.fn(() => "page");
      const loader = vi.fn(() => "data");
      const router = createRouter({ routes: [{ id: "page", path: "/page", component, loader }] });
      const idle = router.getState();
      router.subscribe(({ pendingMatches: [pending] }) => {
        if (pending && (phase === "pending" || pending.isFetching)) {
          router.stop();
        }
      });
      await router.navigate("page", undefined);
      expect(router.getState()).toEqual(idle);
      expect(component).not.toHaveBeenCalled();
      expect(loader).not.toHaveBeenCalled();
    },
  );

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

    const navigation = router.navigate("chat", { label: "agent" });
    await expect.poll(() => signal).toBeDefined();
    router.stop();

    expect(signal?.aborted).toBe(true);
    data.resolve({ label: "late", route: "chat" });
    await navigation;
    expect(router.getState()).toMatchObject({
      status: "idle",
      matches: [],
      pendingMatches: [],
      cachedMatches: [],
    });
  });
  it("clears a preload timer when immediate cache expiry drops the match", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const router = createRouter({
      gcTime: 0,
      preloadGcTime: 60_000,
      routes: [
        { id: "chat", path: "/chat", component: () => "chat", loader: () => "data" },
        { id: "other", path: "/other", component: () => "other" },
      ],
    });

    await router.preloadRoute("chat", undefined);
    await router.navigate("chat", undefined);
    await router.navigate("other", undefined);
    expect(router.getState().cachedMatches).toEqual([]);
    router.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
