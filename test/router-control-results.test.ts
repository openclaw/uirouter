import { describe, expect, it } from "vitest";
import { createRouter, definePage, notFound, redirect, type RouteLocation } from "../src/index";

type RouteId = "source" | "target" | "missing";
type TestContext = {
  label: string;
};
type TestModule = {
  view: string;
};
type TestData = {
  label: string;
};

function location(pathname: string, search = "", hash = ""): RouteLocation {
  return { pathname, search, hash };
}

describe("router control results", () => {
  it("follows loader redirects and publishes the destination route", async () => {
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"source", TestContext, TestModule, TestData>({
          id: "source",
          path: "/source",
          component: () => ({ view: "source" }),
          loader: () => redirect(location("/target", "?from=source")),
        }),
        definePage<"target", TestContext, TestModule, TestData>({
          id: "target",
          path: "/target",
          component: () => ({ view: "target" }),
          loader: (context) => ({ label: context.label }),
        }),
      ],
    });

    await router.navigate("source", { label: "redirected" });

    const state = router.getState();
    const [match] = state.matches;
    expect(state.status).toBe("success");
    expect(state.location).toEqual(location("/target", "?from=source"));
    expect(state.resolvedLocation).toEqual(location("/target", "?from=source"));
    expect(match).toMatchObject({
      routeId: "target",
      status: "success",
      data: { label: "redirected" },
      module: { view: "target" },
    });
  });

  it("publishes not-found route state from loaders", async () => {
    const result = notFound({ code: "missing-record" });
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"missing", TestContext, TestModule, TestData>({
          id: "missing",
          path: "/missing",
          component: () => ({ view: "missing" }),
          loader: () => result,
        }),
      ],
    });

    await expect(router.navigate("missing", { label: "agent" })).rejects.toBe(result);

    const state = router.getState();
    const [match] = state.matches;
    expect(state.status).toBe("notFound");
    expect(state.location).toEqual(location("/missing"));
    expect(state.resolvedLocation).toEqual(location("/missing"));
    expect(match).toMatchObject({
      routeId: "missing",
      status: "notFound",
      error: result,
      isFetching: false,
    });
  });

  it("marks unmatched locations as not found without throwing", async () => {
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage({
          id: "source",
          path: "/source",
          component: () => ({ view: "source" }),
        }),
      ],
    });

    await router.navigateLocation(location("/unmatched", "?q=1"), { label: "agent" });

    expect(router.getState()).toMatchObject({
      status: "notFound",
      location: location("/unmatched", "?q=1"),
      resolvedLocation: null,
      matches: [],
      pendingMatches: [],
    });
  });
});
