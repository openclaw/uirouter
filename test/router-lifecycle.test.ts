import { describe, expect, it } from "vitest";
import { createRouter } from "../src/index";
import { deferred } from "./fixtures";

describe("router lifecycle", () => {
  it.each(["navigate", "stop", "current"] as const)(
    "only publishes an asynchronous hook error while its navigation is current (%s)",
    async (action) => {
      const failure = new Error("hook failed");
      const { promise: hook, reject: rejectHook } = deferred<void>();
      const { promise: started, resolve: entered } = deferred<void>();
      const router = createRouter({
        routes: [
          {
            id: "chat",
            path: "/chat",
            component: () => "chat",
            onEnter: () => {
              entered();
              return hook;
            },
          },
          { id: "settings", path: "/settings", component: () => "settings" },
        ],
      });

      const navigation = router.navigate("chat", undefined);
      await started;
      if (action === "navigate") {
        await router.navigate("settings", undefined);
      } else if (action === "stop") {
        router.stop();
      }
      const before = router.getState();
      rejectHook(failure);

      if (action === "current") {
        await expect(navigation).rejects.toBe(failure);
        expect(router.getState()).toMatchObject({
          status: "error",
          matches: [{ status: "error", error: failure }],
        });
      } else {
        await navigation;
        expect(router.getState()).toEqual(before);
      }
      router.stop();
    },
  );

  it("runs enter and leave hooks in route-transition order", async () => {
    const events: string[] = [];
    const router = createRouter({
      routes: [
        {
          id: "chat",
          path: "/chat",
          component: () => ({ view: "chat" }),
          loader: () => "chat",
          onEnter: (_context, data, options) => {
            events.push(`enter:${data}:${options.location.pathname}`);
          },
          onLeave: (_context, data, options) => {
            events.push(`leave:${data}:${options.location.pathname}`);
          },
        },
        {
          id: "settings",
          path: "/settings",
          component: () => ({ view: "settings" }),
          loader: () => "settings",
          onEnter: (_context, data, options) => {
            events.push(`enter:${data}:${options.location.pathname}`);
          },
        },
      ],
    });

    await router.navigate("chat", undefined);
    await router.navigate("settings", undefined);
    await router.revalidate(undefined);

    expect(events).toEqual(["enter:chat:/chat", "leave:chat:/chat", "enter:settings:/settings"]);
  });
});
