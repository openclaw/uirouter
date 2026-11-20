import { describe, expect, it } from "vitest";
import { createRouter, type RouterHistory } from "../src/index";
import { createMemoryHistory, deferred, location } from "./fixtures";

type RouteId = "a" | "b";
function createPendingDestination() {
  const { promise: loaderGate, resolve: finishLoader } = deferred<void>();
  const { promise: componentGate, resolve: finishComponent } = deferred<void>();
  const router = createRouter<RouteId, string, string, string>({
    routes: [
      {
        id: "a",
        path: "/a",
        component: () => "view-a",
        loader: () => "data-a",
      },
      {
        id: "b",
        path: "/b",
        component: () => componentGate.then(() => "view-b"),
        loader: () => loaderGate.then(() => "data-b"),
      },
    ],
  });
  const history = createMemoryHistory(location("/a"));
  return { router, history, finishLoader, finishComponent };
}

function expectDestinationB(
  history: RouterHistory,
  router: ReturnType<typeof createPendingDestination>["router"],
): void {
  expect(history.location().pathname).toBe("/b");
  expect(router.getState().location.pathname).toBe("/b");
  expect(router.getState().matches[0]?.routeId).toBe("b");
  expect(router.getState().status).toBe("success");
  expect(router.getState().matches[0]?.data).toBe("data-b");
}

function createPendingMatchDestination() {
  const { promise: loaderGate, resolve: finishLoader } = deferred<void>();
  const router = createRouter<"chat", string, string, string>({
    routes: [
      {
        id: "chat",
        path: "/chat",
        component: () => "view-chat",
        loaderDeps: (_context, routeLocation) => routeLocation.search,
        loader: (_context, options) =>
          options.deps === "?session=two"
            ? loaderGate.then(() => `data-${options.deps}`)
            : `data-${options.deps}`,
      },
    ],
  });
  const history = createMemoryHistory(location("/chat", "?session=one"));
  return { router, history, finishLoader };
}

function expectSecondChatMatch(
  history: RouterHistory,
  router: ReturnType<typeof createPendingMatchDestination>["router"],
  firstMatchId: string,
): void {
  expect(history.location()).toEqual(location("/chat", "?session=two"));
  expect(router.getState().location).toEqual(location("/chat", "?session=two"));
  expect(router.getState().pendingMatches).toEqual([]);
  expect(router.getState().matches[0]).toMatchObject({
    routeId: "chat",
    status: "success",
    data: "data-?session=two",
  });
  expect(router.getState().matches[0]?.id).not.toBe(firstMatchId);
}

it.each([false, true])(
  "preserves the resolved location while navigation is pending (started: %s)",
  async (started) => {
    const { router, history, finishLoader, finishComponent } = createPendingDestination();
    if (started) {
      await router.start(history, "", "ctx");
    }
    const resolved = router.getState().resolvedLocation;
    const navigation = router.navigate("b", "ctx");
    expect(router.getState().resolvedLocation).toBe(resolved);

    const latest = location("/b", "?joined", "#entry");
    const joined = router.navigate("b", "ctx", {}, latest);
    expect(router.getState().location).toEqual(latest);
    expect(router.getState().resolvedLocation).toBe(resolved);

    finishComponent();
    finishLoader();
    await Promise.all([navigation, joined]);
    expect(router.getState().resolvedLocation).toEqual(latest);
    router.stop();
  },
);

describe("invalidate during a pending navigation", () => {
  it.each(["invalidate", "revalidate"] as const)(
    "lets a pending route finish during untargeted %s",
    async (method) => {
      const { router, history, finishLoader, finishComponent } = createPendingDestination();
      await router.start(history, "", "ctx");
      const navigation = router.navigate("b", "ctx", { history: "push" });

      if (method === "revalidate") {
        await router.revalidate("ctx");
      } else {
        await router.invalidate();
      }
      finishComponent();
      finishLoader();
      await navigation;

      expectDestinationB(history, router);
      router.stop();
    },
  );

  it.each(["invalidate", "revalidate"] as const)(
    "lets a pending dependency change finish during untargeted %s",
    async (method) => {
      const { router, history, finishLoader } = createPendingMatchDestination();
      await router.start(history, "", "ctx");
      const firstMatchId = router.getState().matches[0]?.id;
      if (!firstMatchId) {
        throw new Error("expected an active match");
      }
      const navigation = router.navigate(
        "chat",
        "ctx",
        { history: "push" },
        location("/chat", "?session=two"),
      );

      if (method === "revalidate") {
        await router.revalidate("ctx");
      } else {
        await router.invalidate();
      }
      finishLoader();
      await navigation;

      expectSecondChatMatch(history, router, firstMatchId);
      router.stop();
    },
  );

  it("preserves invalidation when the previous active match moves into cache", async () => {
    let loadACount = 0;
    const { promise: componentBGate, resolve: finishComponentB } = deferred<void>();
    const router = createRouter<RouteId, string, string, string>({
      routes: [
        {
          id: "a",
          path: "/a",
          staleTime: 60_000,
          component: () => "view-a",
          loader: () => `data-a-${++loadACount}`,
        },
        {
          id: "b",
          path: "/b",
          component: () => componentBGate.then(() => "view-b"),
          loader: () => "data-b",
        },
      ],
    });
    const history = createMemoryHistory(location("/a"));
    await router.start(history, "", "ctx");
    const navigation = router.navigate("b", "ctx", { history: "push" });

    await router.invalidate();
    finishComponentB();
    await navigation;

    expectDestinationB(history, router);
    await router.navigate("a", "ctx", { history: "push" });
    expect(loadACount).toBe(2);
    expect(router.getState().matches[0]).toMatchObject({
      routeId: "a",
      data: "data-a-2",
    });
    router.stop();
  });
});
