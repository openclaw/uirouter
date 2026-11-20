import type { RouteLocation, RouterHistory } from "../src/index";

type HistoryOperation = {
  type: "push" | "replace";
  location: RouteLocation;
};
type MemoryHistory = RouterHistory & {
  operations: HistoryOperation[];
  emit: (location: RouteLocation) => void;
};

export function location(pathname: string, search = "", hash = ""): RouteLocation {
  return { pathname, search, hash };
}

export function createMemoryHistory(initial: RouteLocation): MemoryHistory {
  let current = initial;
  const listeners = new Set<(location: RouteLocation) => void>();
  const operations: HistoryOperation[] = [];
  return {
    operations,
    location: () => current,
    push(nextLocation) {
      current = nextLocation;
      operations.push({ type: "push", location: nextLocation });
    },
    replace(nextLocation) {
      current = nextLocation;
      operations.push({ type: "replace", location: nextLocation });
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(nextLocation) {
      current = nextLocation;
      for (const listener of listeners) {
        listener(nextLocation);
      }
    },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
