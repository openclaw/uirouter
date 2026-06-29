import { describe, expect, it } from "vitest";
import { createRouter, definePage } from "../src/index";

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
