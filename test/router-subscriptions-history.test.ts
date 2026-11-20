import { describe, expect, it } from "vitest";
import { createRouter, definePage } from "../src/index";
import { createMemoryHistory, location } from "./fixtures";

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
    const count = statuses.length;
    await router.navigate("chat", { label: "again" });
    expect(statuses).toHaveLength(count);

    expect(statuses).toContain("loading");
    expect(statuses).toContain("success");
    expect(selectedStatuses).toEqual(["loading", "success"]);
  });

  it("notifies match subscribers for the selected match only", async () => {
    const router = createTestRouter();
    await router.navigate("chat", { label: "first" });
    const matchId = router.getState().matches[0].id;
    const updates: string[] = [];
    const unsubscribe = router.subscribeMatch(matchId, (match) => {
      updates.push(`${match?.status}:${match?.isFetching}:${match?.data?.label}`);
    });

    await router.preloadRoute("settings", { label: "other" });
    expect(updates).toEqual([]);
    await router.revalidate({ label: "second" });
    expect(unsubscribe()).toBe(true);
    const count = updates.length;
    await router.invalidate("chat");
    expect(updates).toHaveLength(count);

    expect(updates).toContain("success:loader:first");
    expect(updates.at(-1)).toBe("success:false:second");
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

  it("loads history navigations with the latest context, not the start context", async () => {
    const router = createTestRouter();
    const history = createMemoryHistory(location("/chat"));

    await router.start(history, "", { label: "u_1" });
    await router.navigate("chat", { label: "u_2" });
    history.emit(location("/settings", "?tab=tools"));
    await expect.poll(() => router.getState().status).toBe("success");
    expect(router.getState().location).toEqual(location("/settings", "?tab=tools"));

    expect(router.getState().status).toBe("success");
    expect(router.getState().matches[0]?.data).toEqual({ label: "u_2", route: "settings" });
  });

  it("uses the new start context during synchronous history replay", async () => {
    const router = createTestRouter();
    await router.navigate("chat", { label: "old" });
    const history = createMemoryHistory(location("/settings"));
    const listen = history.listen;
    history.listen = (listener) => {
      const unsubscribe = listen(listener);
      listener(history.location());
      return unsubscribe;
    };

    await router.start(history, "", { label: "restarted" });

    expect(router.getState().matches[0]?.data).toEqual({ label: "restarted", route: "settings" });
    router.stop();
  });

  it("stores a new start context even when the initial location is unmatched", async () => {
    const router = createTestRouter();
    await router.navigate("chat", { label: "old" });
    const history = createMemoryHistory(location("/missing"));
    await router.start(history, "", { label: "restarted" });

    history.emit(location("/settings"));
    await expect.poll(() => router.getState().status).toBe("success");

    expect(router.getState().matches[0]?.data).toEqual({ label: "restarted", route: "settings" });
    router.stop();
  });

  it.each(["navigateLocation", "preloadLocation"] as const)(
    "stores context from an unmatched %s call for later history events",
    async (method) => {
      const router = createTestRouter();
      const history = createMemoryHistory(location("/chat"));
      await router.start(history, "", { label: "old" });

      await router[method](location("/missing"), { label: "current" });
      history.emit(location("/settings"));
      await expect.poll(() => router.getState().status).toBe("success");

      expect(router.getState().matches[0]?.data).toEqual({ label: "current", route: "settings" });
      router.stop();
    },
  );
});
