import { describe, expect, it } from "vitest";
import { createRouter, definePage } from "../src/index";

type RouteId = "slow" | "fast";
type TestContext = {
  label: string;
};
type TestModule = {
  view: string;
};
type TestData = {
  label: string;
  route: RouteId;
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
});
