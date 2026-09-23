import { describe, expect, it, vi } from "vitest";
import { createRouter, redirect } from "../src/index";

describe("preload cancellation", () => {
  it.each(["returned redirect", "thrown redirect", "error"])(
    "ignores a late %s after stop without deleting a replacement preload",
    async (outcome) => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
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
