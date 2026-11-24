import { describe, expect, it, vi } from "vitest";
import { createRouter, type RouteLocation } from "../src/index";
import { createMemoryHistory, location } from "./fixtures";

function createTestRouter() {
  return createRouter({
    routes: (["chat", "settings"] as const).map((id) => ({
      id,
      path: `/${id}`,
      component: () => id,
      loader: (context: { label: string }) => ({ label: context.label, route: id }),
    })),
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

  it("preserves cached snapshots when another route is preloaded", async () => {
    const router = createTestRouter();
    await router.preloadRoute("chat", { label: "first" });
    const first = router.getState().cachedMatches;

    await router.preloadRoute("settings", { label: "second" });
    const both = router.getState().cachedMatches;
    expect(first).toHaveLength(1);
    expect(both.map((match) => match.routeId)).toEqual(["chat", "settings"]);
    expect(both[0]).toBe(first[0]);
    expect(router.getState().cachedMatches).toBe(both);

    await router.navigate("chat", { label: "first" });
    expect(router.getState().cachedMatches.map((match) => match.routeId)).toEqual(["settings"]);
    expect(router.getState().matches[0]?.routeId).toBe("chat");
    expect(both).toHaveLength(2);
    router.stop();
  });

  it("keeps selectors quiet when only another match list changes", async () => {
    const router = createTestRouter();
    const context = { label: "reader" };
    await router.navigate("chat", context);
    const visible = router.getState().matches;
    await router.invalidate("settings");
    expect(router.getState().matches).toBe(visible);

    const active = vi.fn();
    const pending = vi.fn();
    const cached = vi.fn();
    router.subscribeSelector((state) => state.matches, active);
    router.subscribeSelector((state) => state.pendingMatches, pending);
    router.subscribeSelector((state) => state.cachedMatches, cached);
    await router.preloadRoute("settings", context);
    expect(active).not.toHaveBeenCalled();
    expect(pending).not.toHaveBeenCalled();
    expect(cached).toHaveBeenCalled();

    cached.mockClear();
    await router.revalidate(context);
    expect(active).toHaveBeenCalled();
    expect(cached).not.toHaveBeenCalled();
    router.stop();
  });

  it("reads the latest match after a state subscriber invalidates it", async () => {
    const router = createTestRouter();
    await router.navigate("chat", { label: "first" });
    const chatId = router.getState().matches[0].id;
    router.subscribe((state) => {
      if (state.cachedMatches.some((match) => match.id === chatId && !match.invalid)) {
        void router.invalidate("chat");
      }
    });
    const invalid: boolean[] = [];
    router.subscribeMatch(chatId, (match) => invalid.push(match?.invalid === true));

    await router.navigate("settings", { label: "second" });
    expect(invalid).toEqual([true, true]);
    router.stop();
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

it("detaches old subscriptions when the router restarts", async () => {
  const router = createTestRouter();
  const history = createMemoryHistory(location("/chat"));
  const context = { label: "reader" };
  await router.start(history, "", context);
  const matchId = router.getState().matches[0].id;
  const state = vi.fn();
  const selected = vi.fn();
  const match = vi.fn();
  const stopState = router.subscribe(state);
  const stopSelected = router.subscribeSelector((s) => s.status, selected);
  const stopMatch = router.subscribeMatch(matchId, match);
  router.stop();
  expect(state.mock.lastCall?.[0].status).toBe("idle");
  state.mockClear();
  selected.mockClear();
  match.mockClear();

  await router.start(createMemoryHistory(location("/chat")), "", context);
  history.emit(location("/settings"));
  expect(router.getState().location).toEqual(location("/chat"));
  expect(state).not.toHaveBeenCalled();
  expect(selected).not.toHaveBeenCalled();
  expect(match).not.toHaveBeenCalled();
  router.subscribe(state);
  router.subscribeSelector((s) => s.status, selected);
  router.subscribeMatch(matchId, match);
  stopState();
  stopSelected();
  stopMatch();
  await router.navigate("settings", context);
  expect(state).toHaveBeenCalled();
  expect(selected).toHaveBeenCalledWith("success");
  expect(match).toHaveBeenCalled();
  router.stop();
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

  it.each(["stop", "restart"] as const)(
    "honors %s during synchronous history replay",
    async (action) => {
      const router = createTestRouter();
      const history = createMemoryHistory(location("/chat"));
      const listeners = new Set<(value: RouteLocation) => void>();
      history.listen = (listener) => {
        listeners.add(listener);
        listener(history.location());
        return () => listeners.delete(listener);
      };
      let restart: Promise<void> | undefined;
      router.subscribeSelector(
        (state) => state.status,
        (status) => {
          if (status === "loading") {
            router.stop();
            if (action === "restart") {
              restart = router.start(history, "", { label: "replacement" });
            }
          }
        },
      );

      await router.start(history, "", { label: "original" });
      await restart;
      if (action === "restart") {
        expect(listeners.size).toBe(1);
        expect(router.getState().matches[0]?.data?.label).toBe("replacement");
        router.stop();
      }
      expect(router.getState().status).toBe("idle");
      expect(listeners.size).toBe(0);
    },
  );

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
