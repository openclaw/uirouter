import { describe, expect, it } from "vitest";
import { createRouter, definePage, notFound, redirect } from "../src/index";
import { location } from "./fixtures";

type RouteId = "source" | "target" | "missing" | "alpha" | "beta";
type TestContext = {
  label: string;
};
type TestModule = {
  view: string;
};
type TestData = {
  label: string;
};

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

  it.each(["navigate", "preloadRoute"] as const)(
    "rejects a multi-route cycle during %s",
    async (method) => {
      let visits = 0;
      const router = createRouter<RouteId, TestContext, TestModule, TestData>({
        routes: [
          definePage<"alpha", TestContext, TestModule, TestData>({
            id: "alpha",
            path: "/alpha",
            component: () => ({ view: "alpha" }),
            loader: (context) =>
              ++visits > 1 ? { label: context.label } : redirect(location("/beta")),
          }),
          definePage<"beta", TestContext, TestModule, TestData>({
            id: "beta",
            path: "/beta",
            component: () => ({ view: "beta" }),
            loader: () => redirect(location("/alpha")),
          }),
        ],
      });

      await expect(router[method]("alpha", { label: "loop" })).rejects.toThrow(
        /Redirect cycle detected: \/alpha -> \/beta -> \/alpha/,
      );
      expect(router.getState().status).toBe(method === "navigate" ? "error" : "idle");
      expect(router.getState().cachedMatches).toEqual([]);
      expect(visits).toBe(1);
      router.stop();
    },
  );

  it.each([
    ["navigate", 10],
    ["navigate", 11],
    ["preloadRoute", 10],
    ["preloadRoute", 11],
  ] as const)("enforces the hop boundary for %s with %i redirects", async (method, hopCount) => {
    const ids = Array.from({ length: hopCount + 1 }, (_, index) => `hop${index}`);
    const router = createRouter<string, TestContext, TestModule, TestData>({
      routes: ids.map((id, index) =>
        definePage<string, TestContext, TestModule, TestData>({
          id,
          path: `/${id}`,
          component: () => ({ view: id }),
          loader:
            index < hopCount
              ? () => redirect(location(`/${ids[index + 1]}`))
              : (context) => ({ label: context.label }),
        }),
      ),
    });

    const result = router[method]("hop0", { label: "boundary" });
    if (hopCount === 10) {
      await result;
      const state = router.getState();
      const matches = method === "navigate" ? state.matches : state.cachedMatches;
      expect(matches).toMatchObject([
        {
          routeId: "hop10",
          location: location("/hop10"),
          status: "success",
          module: { view: "hop10" },
          data: { label: "boundary" },
          preload: method === "preloadRoute",
        },
      ]);
      if (method === "navigate") {
        expect(state.location).toEqual(location("/hop10"));
      }
    } else {
      await expect(result).rejects.toThrow(
        /Redirect hop limit of 10 exceeded while following \/hop10 -> \/hop11/,
      );
      expect(router.getState().status).toBe(method === "navigate" ? "error" : "idle");
      if (method === "preloadRoute") {
        expect(router.getState().cachedMatches).toEqual([]);
      }
    }
    router.stop();
  });

  it.each(["navigateLocation", "preloadLocation"] as const)(
    "rejects a normalized self redirect through %s and resets the next call's budget",
    async (method) => {
      let visits = 0;
      const router = createRouter({
        routes: [
          definePage({
            id: "source",
            path: "/source",
            component: () => "source",
            loader: () => {
              if (++visits === 1) {
                throw redirect(location("/source/"));
              }
              return "recovered";
            },
          }),
        ],
      });

      await expect(router[method](location("/source"), {})).rejects.toThrow(
        /Redirect cycle detected/,
      );
      expect(visits).toBe(1);
      await router[method](location("/source"), {});
      expect(visits).toBe(2);
      router.stop();
    },
  );

  it.each(["navigateLocation", "preloadLocation"] as const)(
    "allows distinct search and hash values through %s",
    async (method) => {
      const router = createRouter({
        routes: [
          definePage({
            id: "source",
            path: "/source",
            loaderDeps: (_context, target) => target.search + target.hash,
            component: () => "source",
            loader: (_context, options) =>
              options.location.search === ""
                ? redirect(location("/source", "?step=1"))
                : options.location.hash === ""
                  ? redirect(location("/source", "?step=1", "#done"))
                  : "done",
          }),
        ],
      });

      await router[method](location("/source"), {});
      const state = router.getState();
      const matches = method === "navigateLocation" ? state.matches : state.cachedMatches;
      expect(matches).toMatchObject([
        { location: location("/source", "?step=1", "#done"), status: "success", data: "done" },
      ]);
      router.stop();
    },
  );

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
