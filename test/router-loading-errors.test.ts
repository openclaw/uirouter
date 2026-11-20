import { describe, expect, it, vi } from "vitest";
import { createRouter } from "../src/index";
import { deferred } from "./fixtures";

describe("router loading errors", () => {
  it("observes loader rejection when the component throws synchronously", async () => {
    const componentError = new Error("component failed");
    const loaderError = new Error("loader failed");
    const { promise: data, reject: rejectLoader } = deferred<string>();
    const router = createRouter({
      routes: [
        {
          id: "page",
          path: "/page",
          component: () => {
            throw componentError;
          },
          loader: () => data,
        },
      ],
    });

    await expect(router.navigate("page", undefined)).rejects.toBe(componentError);
    rejectLoader(loaderError);
    // Give an unobserved rejection a turn to reach the test runner.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(router.getState()).toMatchObject({ status: "error" });
    router.stop();
  });

  it("retains a replacement component when an import from before stop rejects", async () => {
    const pending = deferred<string>();
    const component = vi
      .fn(() => Promise.resolve("new module"))
      .mockReturnValueOnce(pending.promise);
    const router = createRouter({
      routes: [{ id: "page", path: "/page", component, loaderDeps: (context: string) => context }],
    });

    const old = router.preloadRoute("page", "old");
    router.stop();
    await router.preloadRoute("page", "replacement");
    pending.reject(new Error("old import failed"));
    await old;
    await router.preloadRoute("page", "another match");

    expect(component).toHaveBeenCalledTimes(2);
    router.stop();
  });

  it("keeps a replacement module when an import from before stop resolves", async () => {
    const { promise, resolve } = deferred<string>();
    let loads = 0;
    const component = vi.fn(() => Promise.resolve("replacement"));
    component.mockReturnValueOnce(promise);
    const router = createRouter({
      routes: [
        {
          id: "page",
          path: "/page",
          component,
          loader: () => {
            loads += 1;
            if (loads === 1) {
              throw new Error("loader failed");
            }
            return "fresh";
          },
        },
      ],
    });

    await router.preloadRoute("page", undefined);
    router.stop();
    await router.preloadRoute("page", undefined);
    expect(router.getState().cachedMatches[0]).toMatchObject({
      data: "fresh",
      module: "replacement",
    });
    resolve("stale module");
    await promise;
    await new Promise<void>((done) => {
      setTimeout(done, 0);
    });

    expect(router.getState().cachedMatches[0]).toMatchObject({
      data: "fresh",
      module: "replacement",
    });
    expect(component).toHaveBeenCalledTimes(2);
    router.stop();
  });

  it("loads the component even when a synchronous loader fails and permits retry", async () => {
    const failure = new Error("loader failed");
    const component = vi.fn(() => ({ view: "page" }));
    let attempts = 0;
    const router = createRouter({
      routes: [
        {
          id: "page",
          path: "/page",
          component,
          loader: (context: string) => {
            if (attempts++ === 0) {
              throw failure;
            }
            return context;
          },
        },
      ],
    });

    await expect(router.navigate("page", "initial")).rejects.toBe(failure);
    expect(component).toHaveBeenCalledOnce();
    expect(router.getState()).toMatchObject({
      status: "error",
      matches: [{ routeId: "page", status: "error", error: failure, isFetching: false }],
    });
    await router.revalidate("retried");
    expect(attempts).toBe(2);
    expect(router.getState()).toMatchObject({
      status: "success",
      matches: [
        {
          status: "success",
          data: "retried",
          error: undefined,
          invalid: false,
          module: { view: "page" },
        },
      ],
    });
    expect(component).toHaveBeenCalledOnce();
    router.stop();
  });
});
