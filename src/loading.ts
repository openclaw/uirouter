import type { MatchStore } from "./matches";
import type {
  PageDefinition,
  RouteHookOptions,
  RouteMatch,
  RouteNotFound,
  RouteRedirect,
  RouteStaleReloadMode,
} from "./types";

export type RouteLoadResult<TModule, TData> = {
  data: TData | undefined;
  module: TModule;
};

type RouteDataResult<TData> = {
  data: TData | undefined;
  updatedAt: number;
};

type RouteLoadingOptions = {
  staleTime: number;
  staleReloadMode: RouteStaleReloadMode;
  preloadStaleTime: number;
  preloadGcTime: number;
  gcTime: number;
};

function isRouteControl(value: unknown): value is RouteNotFound | RouteRedirect {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value.type === "notFound" || value.type === "redirect")
  );
}

// Host timers coerce delays outside signed 32-bit to 1ms.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function createRouteLoading<TRouteId extends string, TLoadContext, TModule, TData>(
  options: RouteLoadingOptions,
  matchStore: MatchStore<TRouteId, TModule, TData>,
) {
  type Route = PageDefinition<TRouteId, TLoadContext, TModule, TData>;
  type Match = RouteMatch<TRouteId, TModule, TData>;
  const moduleCache = new Map<TRouteId, Promise<TModule>>();
  const inFlight = new Map<
    string,
    { signal: AbortSignal; promise: Promise<RouteLoadResult<TModule, TData>> }
  >();
  const gcTimers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  const freshTimeFor = (match: Match, route: Route, cause: RouteHookOptions["cause"]) =>
    match.preload || cause === "preload"
      ? (route.preloadStaleTime ?? options.preloadStaleTime)
      : (route.staleTime ?? options.staleTime);

  const isFresh = (match: Match, route: Route, cause: RouteHookOptions["cause"]) =>
    match.status === "success" &&
    !match.invalid &&
    (!route.loader || Date.now() - match.updatedAt < freshTimeFor(match, route, cause));

  const scheduleGc = (match: Match, route: Route) => {
    const gcTime = match.preload
      ? (route.preloadGcTime ?? options.preloadGcTime)
      : (route.gcTime ?? options.gcTime);
    if (gcTime === Infinity) {
      const previousTimer = gcTimers.get(match.id);
      if (previousTimer) {
        globalThis.clearTimeout(previousTimer);
        gcTimers.delete(match.id);
      }
      return;
    }
    const remaining = gcTime - (Date.now() - match.updatedAt);
    if (!matchStore.getCachedMatch(match.id) || remaining <= 0) {
      if (remaining <= 0) {
        matchStore.removeCached(match.id);
        gcTimers.delete(match.id);
      }
      return;
    }
    const previousTimer = gcTimers.get(match.id);
    if (previousTimer) {
      globalThis.clearTimeout(previousTimer);
    }
    const delay = remaining > MAX_TIMEOUT_MS ? MAX_TIMEOUT_MS : remaining;
    const timer = globalThis.setTimeout(() => {
      const current = matchStore.getCachedMatch(match.id);
      if (!current) {
        gcTimers.delete(match.id);
        return;
      }
      if (Date.now() - current.updatedAt < gcTime) {
        scheduleGc(current, route);
        return;
      }
      matchStore.removeCached(match.id);
      gcTimers.delete(match.id);
    }, delay);
    gcTimers.set(match.id, timer);
    (timer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
  };

  const loadModule = async (route: Route, match: Match): Promise<TModule> => {
    if (match.module !== undefined) {
      return Promise.resolve(match.module);
    }
    const cached = moduleCache.get(route.id);
    if (cached) {
      return cached;
    }
    const loaded = Promise.resolve(route.component());
    moduleCache.set(route.id, loaded);
    void loaded.catch(() => moduleCache.delete(route.id));
    return loaded;
  };

  const loadData = async (
    match: Match,
    route: Route,
    context: TLoadContext,
    hookOptions: RouteHookOptions,
    force: boolean,
  ): Promise<RouteDataResult<TData>> => {
    const current = matchStore.getMatch(match.id) ?? match;
    if (!force && isFresh(current, route, hookOptions.cause)) {
      matchStore.updateMatch(current.id, (next) => ({
        ...next,
        preload: hookOptions.cause === "preload",
      }));
      scheduleGc(current, route);
      return Promise.resolve({ data: current.data, updatedAt: current.updatedAt });
    }
    const loaded = route.loader?.(context, {
      ...hookOptions,
      deps: current.deps,
    });
    return Promise.resolve(loaded).then((data) => {
      if (isRouteControl(data)) {
        throw data;
      }
      return { data, updatedAt: Date.now() };
    });
  };

  const loadRoute = async (
    match: Match,
    route: Route,
    context: TLoadContext,
    hookOptions: RouteHookOptions,
    force: boolean,
    onComponentLoaded?: (module: TModule) => void,
  ): Promise<RouteLoadResult<TModule, TData>> => {
    const existing = inFlight.get(match.id);
    if (existing && !existing.signal.aborted && !force) {
      return existing.promise;
    }
    const current = matchStore.getMatch(match.id) ?? match;
    const fetchCount = current.fetchCount + 1;
    matchStore.updateMatch(match.id, (next) => ({
      ...next,
      isFetching: "loader",
      fetchCount,
    }));
    const isCurrentFetch = (matchId: string) =>
      matchStore.getMatch(matchId)?.fetchCount === fetchCount && !hookOptions.signal.aborted;
    const dataPromise = loadData(current, route, context, hookOptions, force);
    const modulePromise = loadModule(route, current);
    const visibleModulePromise = modulePromise.then((module) => {
      if (isCurrentFetch(current.id)) {
        matchStore.updateMatch(current.id, (next) => ({ ...next, module }));
        onComponentLoaded?.(module);
      }
      return module;
    });
    const promise = Promise.all([dataPromise, visibleModulePromise]).then(
      ([dataResult, module]) => {
        if (!isCurrentFetch(current.id)) {
          return { data: dataResult.data, module };
        }
        matchStore.updateMatch(current.id, (next) => ({
          ...next,
          data: dataResult.data,
          module,
          status: "success",
          isFetching: false,
          error: undefined,
          invalid: false,
          preload: hookOptions.cause === "preload",
          updatedAt: dataResult.updatedAt,
        }));
        const resolved = matchStore.getMatch(current.id);
        if (resolved) {
          scheduleGc(resolved, route);
        }
        return { data: dataResult.data, module };
      },
    );
    inFlight.set(match.id, { signal: hookOptions.signal, promise });
    try {
      return await promise;
    } catch (error) {
      if (isCurrentFetch(match.id)) {
        matchStore.updateMatch(match.id, (next) => ({
          ...next,
          status: "error",
          isFetching: false,
          error,
          updatedAt: Date.now(),
        }));
      }
      throw error;
    } finally {
      if (inFlight.get(match.id)?.promise === promise) {
        inFlight.delete(match.id);
      }
    }
  };

  return {
    loadRoute,
    scheduleGc,
    isFresh,
    shouldReloadInBackground: (route: Route) =>
      (route.staleReloadMode ?? options.staleReloadMode) === "background",
    clear() {
      const state = matchStore.getState();
      for (const match of [...state.matches, ...state.pendingMatches, ...state.cachedMatches]) {
        if (match.isFetching || match.status === "pending") {
          match.abortController.abort();
        }
      }
      for (const timer of gcTimers.values()) {
        globalThis.clearTimeout(timer);
      }
      gcTimers.clear();
      inFlight.clear();
      moduleCache.clear();
    },
  };
}
