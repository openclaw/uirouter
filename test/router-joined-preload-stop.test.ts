import { describe, expect, it } from "vitest";
import { createRouter } from "../src/index";
import { createMemoryHistory, deferred, location } from "./fixtures";

describe("joined preload stop", () => {
  it("aborts a preload adopted by navigate when the router stops", async () => {
    const { promise: alicePending, resolve: finishAlice } = deferred<string>();
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

    const history = createMemoryHistory(location("/"));
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
