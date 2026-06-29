import { describe, expect, it } from "vitest";
import { createRouter, definePage, type RouteLocation, type RouterHistory } from "../src/index";

type RouteId = "chat" | "settings";
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

function createTestRouter() {
  return createRouter<RouteId, TestContext, TestModule, TestData>({
    routes: [
      definePage<"chat", TestContext, TestModule, TestData>({
        id: "chat",
        path: "/chat",
        component: () => ({ view: "chat" }),
        loader: (context) => ({ label: context.label, route: "chat" }),
      }),
      definePage<"settings", TestContext, TestModule, TestData>({
        id: "settings",
        path: "/settings",
        component: () => ({ view: "settings" }),
        loader: (context) => ({ label: context.label, route: "settings" }),
      }),
    ],
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}

describe("router subscriptions", () => {
  it("notifies subscribers and selector subscribers for state changes", async () => {
    const router = createTestRouter();
    const statuses: string[] = [];
    const selectedStatuses: string[] = [];

    const unsubscribeState = router.subscribe((state) => statuses.push(state.status));
    const unsubscribeSelector = router.subscribeSelector(
      (state) => state.status,
      (status) => selectedStatuses.push(status),
    );

    await router.navigate("chat", { label: "agent" });
    expect(unsubscribeSelector()).toBe(true);
    await router.navigate("settings", { label: "agent" });
    expect(unsubscribeState()).toBe(true);

    expect(statuses).toContain("loading");
    expect(statuses).toContain("success");
    expect(selectedStatuses).toEqual(["loading", "success"]);
  });
});

describe("router history", () => {
  it("uses history push and replace only when navigation requests them", async () => {
    const router = createTestRouter();
    const history = createMemoryHistory(location("/chat"));

    await router.start(history, "", { label: "agent" });
    await router.navigate("settings", { label: "agent" }, { history: "push" });
    await router.navigate("chat", { label: "agent" }, { history: "replace" });

    expect(history.operations).toEqual([
      { type: "push", location: location("/settings") },
      { type: "replace", location: location("/chat") },
    ]);
    expect(router.getState().matches[0]?.routeId).toBe("chat");
  });

  it("loads a new route when the history listener reports a location change", async () => {
    const router = createTestRouter();
    const history = createMemoryHistory(location("/chat"));

    await router.start(history, "", { label: "agent" });
    history.emit(location("/settings", "?tab=tools"));
    await waitFor(() => router.getState().status === "success");

    const state = router.getState();
    expect(state.status).toBe("success");
    expect(state.location).toEqual(location("/settings", "?tab=tools"));
    expect(state.matches[0]?.routeId).toBe("settings");
  });
});
