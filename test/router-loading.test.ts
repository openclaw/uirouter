import { describe, expect, it } from "vitest";
import { createRouter, definePage, type RouteLoadCause } from "../src/index";

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

describe("router loading", () => {
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
});
