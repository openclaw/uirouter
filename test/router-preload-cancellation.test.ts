import { describe, expect, it, vi } from "vitest";
import { createRouter, redirect } from "../src/index";
import { deferred } from "./fixtures";

describe("preload cancellation", () => {
  it("ignores a preload redirect after forced revalidation replaces its data", async () => {
    const pending = deferred<string>();
    const redirected = vi.fn(() => "redirected");
    const router = createRouter({
      routes: [
        {
          id: "source",
          path: "/source",
          component: () => "source",
          loader: (context: string) => (context === "old" ? pending.promise : context),
        },
        { id: "away", path: "/away", component: () => "away" },
        { id: "target", path: "/target", component: () => "target", loader: redirected },
      ],
    });
    const preload = router.preloadRoute("source", "old");
    await router.revalidate("fresh", "source");
    await router.navigate("away", "away");
    pending.reject(redirect({ pathname: "/target", search: "", hash: "" }));
    await preload;
    expect(redirected).not.toHaveBeenCalled();
    expect(router.getState().cachedMatches).toMatchObject([{ routeId: "source", data: "fresh" }]);
    router.stop();
  });

  it.each(["returned redirect", "thrown redirect", "error"])(
    "ignores a late %s after stop without deleting a replacement preload",
    async (outcome) => {
      const { promise: pending, resolve: finish } = deferred<void>();
      const targetLoader = vi.fn(() => "target");
      let signal: AbortSignal | undefined;
      const router = createRouter<"source" | "target", string, string, string>({
        routes: [
          {
            id: "source",
            path: "/source",
            component: () => "source",
            loader: async (context, options) => {
              if (context === "replacement") {
                return context;
              }
              signal = options.signal;
              await pending;
              const result = redirect({ pathname: "/target", search: "", hash: "" });
              if (outcome === "returned redirect") {
                return result;
              }
              throw outcome === "thrown redirect" ? result : new Error("old preload failed");
            },
          },
          {
            id: "target",
            path: "/target",
            component: () => "target",
            loader: targetLoader,
          },
        ],
      });

      const preload = router.preloadRoute("source", "old");
      router.stop();
      expect(signal?.aborted).toBe(true);
      await router.preloadRoute("source", "replacement");
      const replacement = router.getState();
      finish();
      await preload;

      expect(targetLoader).not.toHaveBeenCalled();
      expect(router.getState()).toEqual(replacement);
      expect(router.getState().cachedMatches).toMatchObject([
        { routeId: "source", status: "success", data: "replacement" },
      ]);
      router.stop();
    },
  );
});
