import { describe, expect, it } from "vitest";
import { createRouter } from "../src/index";
import { createMemoryHistory, deferred, location } from "./fixtures";

describe("refresh during a pending navigation", () => {
  it.each(["invalidate", "revalidate"] as const)(
    "lets a pending route finish during untargeted %s",
    async (method) => {
      const component = deferred<string>();
      let loads = 0;
      const router = createRouter({
        routes: [
          { id: "a", path: "/a", component: () => "a", staleTime: Infinity, loader: () => ++loads },
          { id: "b", path: "/b", component: () => component.promise, loader: () => 42 },
        ],
      });
      const history = createMemoryHistory(location("/a"));
      await router.start(history, "", undefined);
      const navigation = router.navigate("b", undefined, { history: "push" });
      await router[method](undefined);
      component.resolve("b");
      await navigation;

      expect(history.location()).toEqual(location("/b"));
      expect(router.getState()).toMatchObject({
        status: "success",
        location: location("/b"),
        pendingMatches: [],
        matches: [{ routeId: "b", data: 42 }],
      });
      await router.navigate("a", undefined);
      expect(router.getState().matches).toMatchObject([
        { routeId: "a", data: method === "invalidate" ? 2 : 1 },
      ]);
      router.stop();
    },
  );

  it.each(["invalidate", "revalidate"] as const)(
    "lets a pending dependency change finish during untargeted %s",
    async (method) => {
      const data = deferred<string>();
      const first = location("/chat", "?session=one");
      const second = location("/chat", "?session=two");
      const router = createRouter({
        routes: [
          {
            id: "chat",
            path: "/chat",
            component: () => "chat",
            loaderDeps: (_, target) => target.search,
            loader: (_, { deps }) => (deps === first.search ? "first" : data.promise),
          },
        ],
      });
      const history = createMemoryHistory(first);
      await router.start(history, "", undefined);
      const firstId = router.getState().matches[0].id;
      const navigation = router.navigate("chat", undefined, { history: "push" }, second);
      await router[method](undefined);
      data.resolve("second");
      await navigation;

      expect(history.location()).toEqual(second);
      const state = router.getState();
      expect(state).toMatchObject({
        status: "success",
        location: second,
        pendingMatches: [],
        matches: [{ routeId: "chat", status: "success", data: "second" }],
      });
      expect(state.matches[0].id).not.toBe(firstId);
      router.stop();
    },
  );
});
