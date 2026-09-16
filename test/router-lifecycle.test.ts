import { describe, expect, it } from "vitest";
import { createRouter, definePage } from "../src/index";

function ignoreError(_error: Error): void {}

function ignoreEnter(): void {}

type RouteId = "chat" | "settings";
type TestContext = {
  label: string;
};
type TestModule = {
  view: string;
};
type TestData = {
  route: RouteId;
  label: string;
};

describe("router lifecycle", () => {
  it.each(["navigate", "stop", "current"] as const)(
    "only publishes an asynchronous hook error while its navigation is current (%s)",
    async (action) => {
      const failure = new Error("hook failed");
      let rejectHook: (error: Error) => void = ignoreError;
      let entered: () => void = ignoreEnter;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const hook = new Promise<void>((_resolve, reject) => {
        rejectHook = reject;
      });
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
    const router = createRouter<RouteId, TestContext, TestModule, TestData>({
      routes: [
        definePage<"chat", TestContext, TestModule, TestData>({
          id: "chat",
          path: "/chat",
          component: () => ({ view: "chat" }),
          loader: (context) => ({ route: "chat", label: context.label }),
          onEnter: (_context, data, options) => {
            events.push(`enter:${data?.route}:${options.location.pathname}`);
          },
          onLeave: (_context, data, options) => {
            events.push(`leave:${data?.route}:${options.location.pathname}`);
          },
        }),
        definePage<"settings", TestContext, TestModule, TestData>({
          id: "settings",
          path: "/settings",
          component: () => ({ view: "settings" }),
          loader: (context) => ({ route: "settings", label: context.label }),
          onEnter: (_context, data, options) => {
            events.push(`enter:${data?.route}:${options.location.pathname}`);
          },
        }),
      ],
    });

    await router.navigate("chat", { label: "agent" });
    await router.navigate("settings", { label: "agent" });
    await router.revalidate({ label: "agent" });

    expect(events).toEqual(["enter:chat:/chat", "leave:chat:/chat", "enter:settings:/settings"]);
  });
});
