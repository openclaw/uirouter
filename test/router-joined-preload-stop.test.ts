import { describe, expect, it } from "vitest";
import { createRouter, type RouteLocation, type RouterHistory } from "../src/index";

function createMemoryHistory(initial: RouteLocation): RouterHistory {
  let current = initial;
  const listeners = new Set<(location: RouteLocation) => void>();
  return {
    location: () => current,
    push(nextLocation) {
      current = nextLocation;
      for (const listener of listeners) {
        listener(nextLocation);
      }
    },
    replace(nextLocation) {
      current = nextLocation;
      for (const listener of listeners) {
        listener(nextLocation);
      }
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe("joined preload stop", () => {
  it("aborts a preload adopted by navigate when the router stops", async () => {
    let finishAlice!: (value: string) => void;
    const alicePending = new Promise<string>((resolve) => {
      finishAlice = resolve;
    });
    let signal: AbortSignal | undefined;
    const router = createRouter<"a", string, string, string>({
      routes: [
        {
          id: "a",
          path: "/a",
          component: () => "view-a",
          loader: (context, options) => {
            if (context !== "alice") {
              return context;
            }
            signal = options.signal;
            return alicePending;
          },
        },
      ],
    });

    const preload = router.preloadRoute("a", "alice");
    const navigation = router.navigate("a", "alice");
    expect(signal).toBeDefined();
    router.stop();
    expect(signal?.aborted).toBe(true);

    const history = createMemoryHistory({ pathname: "/", search: "", hash: "" });
    await router.start(history, "", "bob");
    await router.navigate("a", "bob");
    expect(router.getState().matches).toMatchObject([
      { routeId: "a", status: "success", data: "bob", preload: false },
    ]);

    finishAlice("alice");
    await preload;
    await navigation;
    expect(router.getState().matches).toMatchObject([
      { routeId: "a", status: "success", data: "bob", preload: false },
    ]);
    router.stop();
  });
});
