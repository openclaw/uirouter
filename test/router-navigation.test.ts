import { describe, expect, it } from "vitest";
import { createRouter, definePage, type RouteLoadCause, type RouteLocation } from "../src/index";

type RouteId = "home" | "chat";
type TestContext = {
  label: string;
};
type TestModule = {
  view: string;
};
type TestData = {
  label: string;
  cause: RouteLoadCause;
  pathname: string;
};

function location(pathname: string, search = "", hash = ""): RouteLocation {
  return { pathname, search, hash };
}

describe("router route matching", () => {
  it("normalizes route paths, aliases, base paths, and index.html paths", () => {
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage({
          id: "home",
          path: "/",
          component: () => ({ view: "home" }),
        }),
        definePage({
          id: "chat",
          path: "/chat/",
          aliases: ["/c", "/chat/index.html"],
          component: () => ({ view: "chat" }),
        }),
      ],
    });

    expect(router.pathForRoute("home")).toBe("/");
    expect(router.pathForRoute("chat")).toBe("/chat");
    expect(router.pathForRoute("chat", "/app/")).toBe("/app/chat");
    expect(router.routeIdFromPath("/app/chat/", "/app")).toBe("chat");
    expect(router.routeIdFromPath("/c")).toBe("chat");
    expect(router.routeIdFromPath("/chat/index.html")).toBe("chat");
    expect(router.routeIdFromPath("/missing")).toBeNull();
  });
});

it("round trips a generated pathname through normalized base and route paths", () => {
  const router = createRouter({
    routes: [{ id: "chat", path: "chat///", component: () => "chat" }],
  });
  const path = router.pathForRoute("chat", "app///");
  expect(path).toBe("/app/chat");
  expect(router.routeIdFromPath(path, "/app/")).toBe("chat");
});

it("uses an empty route id for location navigation, preloading and revalidation", async () => {
  let loads = 0;
  const route = { id: "", path: "/home", component: () => "home", loader: () => ++loads };
  const router = createRouter({ routes: [route] });
  const target = location("/home");
  await router.preloadLocation(target, undefined);
  expect(router.getState().cachedMatches).toMatchObject([{ routeId: "", data: 1 }]);
  await router.navigateLocation(target, undefined);
  expect(router.getState().matches).toMatchObject([{ routeId: "", data: 1 }]);
  await router.revalidate(undefined);
  expect(router.getState().matches).toMatchObject([{ routeId: "", data: 2 }]);
  router.stop();
  const duplicate = { ...route, id: "other", path: "/other", aliases: ["/home"] };
  expect(() => createRouter({ routes: [route, duplicate] })).toThrow(/Duplicate route path/);
});

it("keeps route and dependency strings distinct when they contain a null character", async () => {
  const router = createRouter({
    routes: [
      { id: "a\u0000b", path: "/one", component: () => "one", loaderDeps: () => "c" },
      { id: "a", path: "/two", component: () => "two", loaderDeps: () => "b\u0000c" },
    ],
  });
  await router.navigate("a\u0000b", undefined);
  const first = router.getState().matches[0].id;
  await router.navigate("a", undefined);
  const second = router.getState().matches[0];
  expect(second.id).not.toBe(first);
  expect(second).toMatchObject({ routeId: "a", module: "two" });
  expect(router.getMatch(first)?.module).toBe("one");
  router.stop();
});

describe("router navigation", () => {
  it("loads the target route and publishes the resolved match", async () => {
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage({
          id: "chat",
          path: "/chat",
          component: () => ({ view: "chat" }),
          loader: (context, options) => ({
            label: context.label,
            cause: options.cause,
            pathname: options.location.pathname,
          }),
        }),
      ],
    });

    await router.navigate("chat", { label: "agent" }, {}, location("/chat", "?q=1", "#reply"));

    const state = router.getState();
    const [match] = state.matches;
    expect(state.status).toBe("success");
    expect(state.location).toEqual(location("/chat", "?q=1", "#reply"));
    expect(state.resolvedLocation).toEqual(location("/chat", "?q=1", "#reply"));
    expect(state.pendingMatches).toEqual([]);
    expect(match).toMatchObject({
      routeId: "chat",
      status: "success",
      isFetching: false,
      data: { label: "agent", cause: "navigation", pathname: "/chat" },
      module: { view: "chat" },
      invalid: false,
      preload: false,
    });
  });
});
