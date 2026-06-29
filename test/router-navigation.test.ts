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
