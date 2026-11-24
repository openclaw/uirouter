import { describe, expect, it, vi } from "vitest";
import { createRouter, definePage, notFound, redirect } from "../src/index";
import { createMemoryHistory, location } from "./fixtures";

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
  it("stops before loading a redirect destination when a subscriber cancels", async () => {
    const target = vi.fn(() => "target");
    const router = createRouter({
      routes: [
        { id: "a", path: "/a", component: () => "a", loader: () => redirect(location("/b")) },
        { id: "b", path: "/b", component: target },
      ],
    });
    const idle = router.getState();
    router.subscribeSelector(
      (state) => state.status,
      (status) => {
        if (status === "redirected") {
          router.stop();
        }
      },
    );
    await router.navigate("a", undefined);
    expect(router.getState()).toEqual(idle);
    expect(target).not.toHaveBeenCalled();
  });

  it.each(["/target", "/missing"])("replaces history on redirect to %s", async (path) => {
    const destination = location(path, "?from=source", "#detail");
    const history = createMemoryHistory(location("/"));
    const router = createRouter({
      routes: [
        {
          id: "source",
          path: "/source",
          component: () => "source",
          loader: () => redirect(destination),
        },
        {
          id: "target",
          path: "/target",
          component: () => "target",
          loader: (context: string) => context,
        },
      ],
    });
    await router.start(history, "", "initial");
    await router.navigate("source", "redirected", { history: "push" });

    expect(history.operations).toEqual([
      { type: "push", location: location("/source") },
      { type: "replace", location: destination },
    ]);
    expect(history.location()).toEqual(destination);
    const state = router.getState();
    expect(state.location).toEqual(destination);
    if (path === "/target") {
      expect(state).toMatchObject({
        status: "success",
        resolvedLocation: destination,
        matches: [{ routeId: "target", status: "success", data: "redirected", module: "target" }],
      });
    } else {
      expect(state).toMatchObject({ status: "notFound", resolvedLocation: null, matches: [] });
    }
    router.stop();
  });

  it.each(["navigate", "preloadRoute"] as const)(
    "rejects a multi-route cycle during %s",
    async (method) => {
      let visits = 0;
      const router = createRouter<"alpha" | "beta", TestContext, TestModule, TestData>({
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

  it.each([{ type: "redirect" }, { type: "redirect", location: "/archive" }])(
    "preserves %j as loader data and as a thrown error",
    async (record) => {
      const router = createRouter({
        routes: [
          {
            id: "log",
            path: "/log",
            component: () => "log",
            loader: (fail: boolean) => {
              if (fail) {
                throw record;
              }
              return record;
            },
          },
        ],
      });
      await router.navigate("log", false);
      expect(router.getState().status).toBe("success");
      expect(router.getState().matches[0].data).toBe(record);
      await expect(router.revalidate(true)).rejects.toBe(record);
      expect(router.getState().status).toBe("error");
      router.stop();
    },
  );

  it("recovers a missing record and clears its failed match on an unmatched URL", async () => {
    const missing = notFound({ code: "missing-record" });
    const loader = vi
      .fn<() => string | typeof missing>()
      .mockReturnValueOnce(missing)
      .mockReturnValueOnce("restored")
      .mockImplementationOnce(() => {
        throw missing;
      });
    const router = createRouter({
      routes: [{ id: "record", path: "/record", component: () => "record", loader }],
    });
    const record = location("/record", "?id=1");
    const failed = { routeId: "record", status: "notFound", error: missing, isFetching: false };
    await expect(router.navigateLocation(record, undefined)).rejects.toBe(missing);
    expect(router.getState()).toMatchObject({
      status: "notFound",
      location: record,
      resolvedLocation: record,
      matches: [failed],
    });

    const { id } = router.getState().matches[0];
    await router.revalidate(undefined);
    expect(router.getState()).toMatchObject({
      status: "success",
      matches: [{ id, status: "success", data: "restored", error: undefined }],
    });
    await expect(router.revalidate(undefined)).rejects.toBe(missing);
    expect(router.getState()).toMatchObject({ status: "notFound", matches: [failed] });

    const unmatched = location("/unmatched", "?q=1");
    await router.navigateLocation(unmatched, undefined);
    expect(router.getState()).toMatchObject({
      status: "notFound",
      location: unmatched,
      resolvedLocation: null,
      matches: [],
      pendingMatches: [],
    });
    expect(router.getMatch(id)).toBeUndefined();
    router.stop();
  });
});
