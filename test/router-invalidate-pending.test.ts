import { describe, expect, it } from "vitest";
import { createRouter, type RouteLocation, type RouterHistory } from "../src/index";

type RouteId = "a" | "b";
type HistoryOperation = {
  type: "push" | "replace";
  location: RouteLocation;
};
type MemoryHistory = RouterHistory & {
  operations: HistoryOperation[];
  emit: (location: RouteLocation) => void;
};

function location(pathname: string, search = "", hash = ""): RouteLocation {
  return { pathname, search, hash };
}

function createMemoryHistory(initial: RouteLocation): MemoryHistory {
  let current = initial;
  const listeners = new Set<(location: RouteLocation) => void>();
  const operations: HistoryOperation[] = [];
  return {
    operations,
    location: () => current,
    push(nextLocation) {
      current = nextLocation;
      operations.push({ type: "push", location: nextLocation });
    },
    replace(nextLocation) {
      current = nextLocation;
      operations.push({ type: "replace", location: nextLocation });
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(nextLocation) {
      current = nextLocation;
      for (const listener of listeners) {
        listener(nextLocation);
      }
    },
  };
}

function createPendingDestination() {
  let finishLoader!: () => void;
  const loaderGate = new Promise<void>((resolve) => {
    finishLoader = resolve;
  });
  let finishComponent!: () => void;
  const componentGate = new Promise<void>((resolve) => {
    finishComponent = resolve;
  });
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
  history: MemoryHistory,
  router: ReturnType<typeof createPendingDestination>["router"],
): void {
  expect(history.location().pathname).toBe("/b");
  expect(router.getState().location.pathname).toBe("/b");
  expect(router.getState().matches[0]?.routeId).toBe("b");
  expect(router.getState().status).toBe("success");
  expect(router.getState().matches[0]?.data).toBe("data-b");
}

function createPendingMatchDestination() {
  let finishLoader!: () => void;
  const loaderGate = new Promise<void>((resolve) => {
    finishLoader = resolve;
  });
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
  history: MemoryHistory,
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

describe("invalidate during a pending navigation", () => {
  it("lets the pending route finish when invalidate is called without a route id", async () => {
    const { router, history, finishLoader, finishComponent } = createPendingDestination();
    await router.start(history, "", "ctx");
    const navigation = router.navigate("b", "ctx", { history: "push" });

    await router.invalidate();
    finishComponent();
    finishLoader();
    await navigation;

    expectDestinationB(history, router);
    router.stop();
  });

  it("lets the pending route finish when revalidate is called without a route id", async () => {
    const { router, history, finishLoader, finishComponent } = createPendingDestination();
    await router.start(history, "", "ctx");
    const navigation = router.navigate("b", "ctx", { history: "push" });

    await router.revalidate("ctx");
    finishComponent();
    finishLoader();
    await navigation;

    expectDestinationB(history, router);
    router.stop();
  });

  it("lets a pending match of the active route finish when invalidate has no route id", async () => {
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

    await router.invalidate();
    finishLoader();
    await navigation;

    expectSecondChatMatch(history, router, firstMatchId);
    router.stop();
  });

  it("lets a pending match of the active route finish when revalidate has no route id", async () => {
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

    await router.revalidate("ctx");
    finishLoader();
    await navigation;

    expectSecondChatMatch(history, router, firstMatchId);
    router.stop();
  });

  it("preserves invalidation when the previous active match moves into cache", async () => {
    let loadACount = 0;
    let finishComponentB!: () => void;
    const componentBGate = new Promise<void>((resolve) => {
      finishComponentB = resolve;
    });
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
