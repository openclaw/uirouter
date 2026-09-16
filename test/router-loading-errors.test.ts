import { describe, expect, it, vi } from "vitest";
import { createRouter } from "../src/index";

function ignoreError(_error: Error): void {}

describe("router loading errors", () => {
  it("observes loader rejection when the component throws synchronously", async () => {
    const componentError = new Error("component failed");
    const loaderError = new Error("loader failed");
    let rejectLoader: (error: Error) => void = ignoreError;
    const data = new Promise<string>((_resolve, reject) => {
      rejectLoader = reject;
    });
    const router = createRouter({
      routes: [
        {
          id: "page",
          path: "/page",
          component: () => {
            throw componentError;
          },
          loader: () => data,
        },
      ],
    });

    await expect(router.navigate("page", undefined)).rejects.toBe(componentError);
    rejectLoader(loaderError);
    // Give an unobserved rejection a turn to reach the test runner.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(router.getState()).toMatchObject({ status: "error" });
    router.stop();
  });

  it("loads the component even when a synchronous loader fails and permits retry", async () => {
    const failure = new Error("loader failed");
    const component = vi.fn(() => ({ view: "page" }));
    let attempts = 0;
    const router = createRouter({
      routes: [
        {
          id: "page",
          path: "/page",
          component,
          loader: () => {
            if (attempts++ === 0) {
              throw failure;
            }
            return "retried";
          },
        },
      ],
    });

    await expect(router.navigate("page", undefined)).rejects.toBe(failure);
    expect(component).toHaveBeenCalledOnce();
    await router.revalidate(undefined);
    expect(router.getState()).toMatchObject({
      status: "success",
      matches: [{ status: "success", data: "retried", module: { view: "page" } }],
    });
    expect(component).toHaveBeenCalledOnce();
    router.stop();
  });
});
