import { describe, expect, it, vi } from "vitest";
import { createRouter } from "../src/index";
import { deferred } from "./fixtures";

describe("router loading errors", () => {
  it("skips the component when the loader stops the router during startup", async () => {
    const data = deferred<string>();
    const component = vi.fn(() => "page");
    const loader = vi.fn(() => Promise.resolve("fresh"));
    const router = createRouter({ routes: [{ id: "page", path: "/page", component, loader }] });
    loader.mockImplementationOnce(() => {
      router.stop();
      return data.promise;
    });

    const stopped = router.navigate("page", undefined);
    data.reject(new Error("cancelled load"));
    await stopped;
    expect(component).not.toHaveBeenCalled();
    expect(router.getState().status).toBe("idle");
    await router.navigate("page", undefined);
    expect(component).toHaveBeenCalledOnce();
    expect(router.getState().matches[0]).toMatchObject({ data: "fresh", module: "page" });
    router.stop();
  });

  it("keeps the replacement load and component when a factory restarts the router", async () => {
    const data = deferred<string>();
    const loader = vi.fn(() => data.promise);
    const component = vi.fn(() => "replacement");
    const router = createRouter({
      routes: [{ id: "page", path: "/page", component, loader, loaderDeps: (key: string) => key }],
    });
    let replacement: Promise<void> | undefined;
    component.mockImplementationOnce(() => {
      router.stop();
      replacement = router.preloadRoute("page", "same");
      return "discarded";
    });

    const old = router.preloadRoute("page", "same");
    const joined = router.preloadRoute("page", "same");
    expect(loader).toHaveBeenCalledTimes(2);
    data.resolve("fresh");
    await Promise.all([old, replacement, joined]);
    await router.preloadRoute("page", "another");
    expect(router.getState().cachedMatches.map((match) => match.module)).toEqual([
      "replacement",
      "replacement",
    ]);
    expect(component).toHaveBeenCalledTimes(2);
    router.stop();
  });

  it("reports a joined preload's loader failure while the component is still pending", async () => {
    const component = deferred<string>();
    const data = deferred<string>();
    const router = createRouter({
      routes: [
        {
          id: "page",
          path: "/page",
          component: () => component.promise,
          loader: () => data.promise,
        },
        { id: "other", path: "/other", component: () => "other" },
      ],
    });
    const preload = router.preloadRoute("page", undefined);
    const navigation = router.navigate("page", undefined);
    const error = new Error("data unavailable");
    data.reject(error);
    await expect(navigation).rejects.toBe(error);
    await preload;
    expect(router.getState().matches).toMatchObject([{ routeId: "page", status: "error", error }]);

    await router.navigate("other", undefined);
    component.resolve("page");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(router.getState().matches).toMatchObject([{ routeId: "other", module: "other" }]);
    router.stop();
  });

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
