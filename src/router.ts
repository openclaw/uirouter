import { createRouteLoading, type RouteLoadResult } from "./loading";
import {
  compileRoutes,
  createMatchStore,
  createRouteMatch,
  locationForPath,
  matchIdForLocation,
  normalizeLocation,
  normalizeRouteBasePath,
} from "./matches";
import type {
  RouteHookOptions,
  RouteLocation,
  RouteLoadCause,
  RouteMatch,
  RouteNotFound,
  RouteRedirect,
  Router,
  RouterHistory,
  RouterNavigationOptions,
  RouterOptions,
} from "./types";

type NavigationRun = {
  controller: AbortController;
  matchId: string;
  location: RouteLocation;
  promise?: Promise<void>;
};

const DEFAULT_STALE_TIME = 0;
const DEFAULT_STALE_RELOAD_MODE = "background" as const;
const DEFAULT_PRELOAD_STALE_TIME = 30_000;
const DEFAULT_GC_TIME = 30 * 60_000;
const MAX_REDIRECT_HOPS = 10;

type RedirectFollowState = {
  hops: number;
  seen: Set<string>;
};

function locationKey(location: RouteLocation): string {
  const normalized = normalizeLocation(location);
  return `${normalized.pathname}${normalized.search}${normalized.hash}`;
}

function beginRedirectFollow(
  from: RouteLocation,
  to: RouteLocation,
  previous?: RedirectFollowState,
): RedirectFollowState {
  const hops = (previous?.hops ?? 0) + 1;
  const seen = previous?.seen ?? new Set<string>();
  const fromKey = locationKey(from);
  const toKey = locationKey(to);
  seen.add(fromKey);
  if (hops > MAX_REDIRECT_HOPS) {
    throw new Error(
      `Redirect hop limit of ${MAX_REDIRECT_HOPS} exceeded while following ${fromKey} -> ${toKey}.`,
    );
  }
  if (seen.has(toKey)) {
    throw new Error(`Redirect cycle detected: ${[...seen, toKey].join(" -> ")}.`);
  }
  return { hops, seen };
}

function inFlightAbortController<TRouteId extends string, TModule, TData>(
  match: RouteMatch<TRouteId, TModule, TData> | undefined,
): AbortController | undefined {
  if (!match?.isFetching || match.abortController.signal.aborted) {
    return undefined;
  }
  return match.abortController;
}

function isRouteNotFound(error: unknown): error is RouteNotFound {
  return (
    typeof error === "object" && error !== null && "type" in error && error.type === "notFound"
  );
}

function isRouteRedirect(error: unknown): error is RouteRedirect {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "redirect" &&
    "location" in error &&
    isRouteLocation(error.location)
  );
}

function isRouteLocation(value: unknown): value is RouteLocation {
  return (
    typeof value === "object" &&
    value !== null &&
    "pathname" in value &&
    typeof value.pathname === "string" &&
    "search" in value &&
    typeof value.search === "string" &&
    "hash" in value &&
    typeof value.hash === "string"
  );
}

export function createRouter<
  TRouteId extends string,
  TLoadContext = unknown,
  TModule = unknown,
  TData = unknown,
>(
  options: RouterOptions<TRouteId, TLoadContext, TModule, TData>,
): Router<TRouteId, TLoadContext, TModule, TData> {
  const compiled = compileRoutes(options.routes);
  const matches = createMatchStore<TRouteId, TModule, TData>();
  const loading = createRouteLoading<TRouteId, TLoadContext, TModule, TData>(
    {
      staleTime: options.staleTime ?? DEFAULT_STALE_TIME,
      staleReloadMode: options.defaultStaleReloadMode ?? DEFAULT_STALE_RELOAD_MODE,
      preloadStaleTime: options.preloadStaleTime ?? DEFAULT_PRELOAD_STALE_TIME,
      preloadGcTime: options.preloadGcTime ?? DEFAULT_GC_TIME,
      gcTime: options.gcTime ?? DEFAULT_GC_TIME,
    },
    matches,
  );
  let history: RouterHistory | undefined;
  let basePath = "";
  let stopHistory: (() => void) | undefined;
  let currentRun: NavigationRun | null = null;
  let lastContext: { value: TLoadContext } | undefined;

  const locationForRoute = (routeId: TRouteId) =>
    locationForPath(compiled.pathForRoute(routeId, basePath));

  const cancelCurrentRun = () => {
    currentRun?.controller.abort();
    currentRun = null;
  };

  const runHook = async (
    match: RouteMatch<TRouteId, TModule, TData> | undefined,
    hook: "onEnter" | "onLeave",
    context: TLoadContext,
    hookOptions: RouteHookOptions,
  ): Promise<void> => {
    if (!match || !hookOptions.shouldRun()) {
      return;
    }
    const route = compiled.byId.get(match.routeId);
    await route?.[hook]?.(context, match.data, {
      ...hookOptions,
      location: match.location,
      deps: match.deps,
    });
  };

  const cacheStoredMatch = (candidate: RouteMatch<TRouteId, TModule, TData> | undefined): void => {
    if (!candidate) {
      return;
    }
    // Invalidation can replace the active match while a destination loads.
    // Cache the store's latest state, never the navigation's earlier snapshot.
    const current = matches.getMatch(candidate.id);
    if (current?.status !== "success") {
      return;
    }
    matches.setCached([
      ...matches.getState().cachedMatches.filter((match) => match.id !== current.id),
      current,
    ]);
    const route = compiled.byId.get(current.routeId);
    if (route) {
      loading.scheduleGc(current, route);
    }
  };

  const navigate = async (
    routeId: TRouteId,
    context: TLoadContext,
    navigationOptions: RouterNavigationOptions = {},
    requestedLocation = locationForRoute(routeId),
    redirectFollow?: RedirectFollowState,
  ): Promise<void> => {
    const route = compiled.byId.get(routeId);
    if (!route) {
      throw new Error(`Unknown route id "${routeId}".`);
    }

    lastContext = { value: context };
    const location = normalizeLocation(requestedLocation);
    const previous = matches.getActiveMatch();
    const deps = route.loaderDeps?.(context, location) ?? "";
    const sameRoute = previous?.routeId === routeId;
    const matchId = matchIdForLocation(routeId, deps);
    const sameMatch = previous?.id === matchId;
    const revalidating = navigationOptions.revalidate === true;
    const cached = matches.getCachedMatch(matchId);
    const cachedReady =
      !sameMatch && cached?.status === "success" && cached.module !== undefined && !cached.invalid;
    const cachedFresh =
      !revalidating && cachedReady && loading.isFresh(cached, route, "navigation");
    const backgroundReload =
      sameMatch && revalidating && previous?.status === "success" && previous.module !== undefined
        ? true
        : cachedReady && !cachedFresh && loading.shouldReloadInBackground(route);

    if (history && navigationOptions.history && navigationOptions.history !== "none") {
      history[navigationOptions.history](location);
    }

    const ongoing = currentRun;
    if (ongoing?.matchId === matchId && ongoing.promise && !ongoing.controller.signal.aborted) {
      matches.updateMatch(matchId, (current) => ({ ...current, location }));
      matches.setLocation(location, matches.getState().resolvedLocation);
      ongoing.location = location;
      return ongoing.promise;
    }

    if (sameMatch && previous?.status === "success" && !previous.invalid && !revalidating) {
      cancelCurrentRun();
      matches.batch(() => {
        matches.updateMatch(previous.id, (current) => ({ ...current, location }));
        matches.setPending([]);
        matches.setLocation(location, location);
        matches.setStatus("success");
      });
      return;
    }

    currentRun?.controller.abort();
    const reusable = sameMatch ? previous : cached;
    const controller = inFlightAbortController(reusable) ?? new AbortController();
    const cause: RouteLoadCause = revalidating ? "revalidate" : "navigation";
    const match: RouteMatch<TRouteId, TModule, TData> = reusable
      ? {
          ...reusable,
          location,
          abortController: controller,
          cause,
          error: undefined,
          invalid: sameMatch || reusable.invalid,
          isFetching: sameMatch ? "loader" : false,
          preload: false,
        }
      : createRouteMatch(routeId, location, deps, cause, controller);
    const activatedCachedMatch =
      cachedReady && (cachedFresh || backgroundReload)
        ? {
            ...match,
            isFetching: backgroundReload ? ("loader" as const) : (false as const),
            preload: cachedFresh && !backgroundReload,
          }
        : undefined;
    let targetPublished = Boolean(activatedCachedMatch);
    const run: NavigationRun = { controller, matchId, location };
    currentRun = run;
    const hookOptions: RouteHookOptions = {
      signal: controller.signal,
      shouldRun: () => currentRun === run && !controller.signal.aborted,
      revalidating,
      location,
      deps,
      cause,
    };
    const previousLocation = matches.getState().resolvedLocation;

    if (activatedCachedMatch) {
      matches.batch(() => {
        cacheStoredMatch(previous);
        matches.setActive([activatedCachedMatch]);
        matches.setPending([]);
        matches.setLocation(location, location);
        matches.setStatus("success");
      });
    } else {
      matches.batch(() => {
        if (sameMatch) {
          matches.updateMatch(match.id, () => match);
        } else {
          matches.setPending([match]);
        }
        matches.setLocation(location, previousLocation);
        matches.setStatus(backgroundReload ? "success" : "loading");
      });
    }
    if (!hookOptions.shouldRun()) {
      return;
    }

    const navigation = (async () => {
      let result: RouteLoadResult<TModule, TData>;
      try {
        result = await loading.loadRoute(
          match,
          route,
          context,
          hookOptions,
          revalidating || Boolean(cached?.invalid),
          (module) => {
            if (!hookOptions.shouldRun() || matches.getActiveMatch()?.id === match.id) {
              return;
            }
            const loadedMatch = matches.getMatch(match.id);
            if (!loadedMatch) {
              return;
            }
            targetPublished = true;
            matches.batch(() => {
              cacheStoredMatch(previous);
              matches.setActive([{ ...loadedMatch, module }]);
              matches.setPending([]);
              matches.setLocation(location, location);
            });
          },
        );
      } catch (error) {
        if (!hookOptions.shouldRun()) {
          return;
        }
        let failure = error;
        if (isRouteRedirect(error)) {
          let follow: RedirectFollowState | undefined;
          try {
            follow = beginRedirectFollow(location, error.location, redirectFollow);
          } catch (redirectError) {
            failure = redirectError;
          }
          if (follow) {
            matches.batch(() => {
              matches.updateMatch(match.id, (current) => ({
                ...current,
                status: "redirected",
                isFetching: false,
                error,
                updatedAt: Date.now(),
              }));
              matches.setStatus("redirected");
            });
            if (!hookOptions.shouldRun()) {
              return;
            }
            currentRun = null;
            await handleLocation(error.location, context, false, "replace", follow);
            return;
          }
        }
        const status = isRouteNotFound(failure) ? "notFound" : "error";
        const failedMatch = matches.getMatch(match.id);
        if (failedMatch) {
          const currentActive = targetPublished ? previous : matches.getActiveMatch();
          matches.batch(() => {
            if (!targetPublished && !sameMatch) {
              cacheStoredMatch(currentActive);
            }
            matches.updateMatch(match.id, (current) => ({
              ...current,
              status,
              isFetching: false,
              error: failure,
              updatedAt: Date.now(),
            }));
            if (!targetPublished) {
              matches.setActive([matches.getMatch(match.id) ?? failedMatch]);
            }
            matches.setPending([]);
            matches.setLocation(location, location);
            matches.setStatus(status);
          });
        } else {
          matches.setStatus(status);
        }
        if (hookOptions.shouldRun()) {
          currentRun = null;
        }
        throw failure;
      }
      if (!hookOptions.shouldRun()) {
        return;
      }

      const resolvedMatch = {
        ...(matches.getMatch(match.id) ?? {
          ...match,
          data: result.data,
          module: result.module,
          status: "success" as const,
          isFetching: false as const,
          error: undefined,
          invalid: false,
          updatedAt: Date.now(),
        }),
        preload: false,
      };
      const currentActive = targetPublished ? previous : matches.getActiveMatch();
      matches.batch(() => {
        if (!targetPublished && !sameMatch) {
          cacheStoredMatch(currentActive);
        }
        matches.setActive([resolvedMatch]);
        matches.setPending([]);
        matches.setLocation(run.location, run.location);
        matches.setStatus("success");
      });

      const lifecycleErrors: unknown[] = [];
      if (!sameRoute) {
        try {
          await runHook(currentActive, "onLeave", context, {
            ...hookOptions,
            revalidating: false,
          });
        } catch (error) {
          lifecycleErrors.push(error);
        }
        try {
          await runHook(resolvedMatch, "onEnter", context, hookOptions);
        } catch (error) {
          lifecycleErrors.push(error);
        }
      }
      if (!hookOptions.shouldRun()) {
        return;
      }
      if (lifecycleErrors.length > 0) {
        const error = lifecycleErrors[0];
        matches.updateMatch(resolvedMatch.id, (current) => ({
          ...current,
          status: "error",
          error,
        }));
        matches.setStatus("error");
        if (hookOptions.shouldRun()) {
          currentRun = null;
        }
        throw error;
      }
      if (hookOptions.shouldRun()) {
        currentRun = null;
      }
    })();
    run.promise = navigation;
    if (backgroundReload && !revalidating) {
      void navigation.catch(() => undefined);
      return;
    }
    await navigation;
  };

  const handleLocation = async (
    location: RouteLocation,
    context: TLoadContext,
    revalidate = false,
    historyMode: RouterNavigationOptions["history"] = "none",
    redirectFollow?: RedirectFollowState,
  ): Promise<void> => {
    lastContext = { value: context };
    const normalized = normalizeLocation(location);
    const matched = compiled.routeIdFromPath(normalized.pathname, basePath);
    if (matched === null) {
      cancelCurrentRun();
      matches.batch(() => {
        matches.setActive([]);
        matches.setPending([]);
        matches.setLocation(normalized, null);
        matches.setStatus("notFound");
      });
      return;
    }
    const refreshActive = revalidate && matches.getActiveMatch()?.routeId === matched;
    await navigate(
      matched,
      context,
      { history: historyMode, revalidate: refreshActive },
      normalized,
      redirectFollow,
    );
  };

  const preloadAtLocation = (
    routeId: TRouteId,
    context: TLoadContext,
    location: RouteLocation,
    redirectFollow?: RedirectFollowState,
  ): Promise<void> => {
    const route = compiled.byId.get(routeId);
    if (!route) {
      return Promise.reject(new Error(`Unknown route id "${routeId}".`));
    }
    lastContext = { value: context };
    const deps = route.loaderDeps?.(context, location) ?? "";
    const matchId = matchIdForLocation(routeId, deps);
    const existing = matches.getMatch(matchId);
    const cached = matches.getCachedMatch(matchId);
    const active = matches.getActiveMatch();
    if (active?.id === matchId && active.status === "success" && !active.invalid) {
      return Promise.resolve();
    }
    const match =
      existing ??
      createRouteMatch<TRouteId, TModule, TData>(
        routeId,
        location,
        deps,
        "preload",
        new AbortController(),
        true,
      );
    if (!existing) {
      matches.setCached([...matches.getState().cachedMatches, match]);
    }
    const controller = match.abortController;
    const cause = existing && !cached ? match.cause : "preload";
    const hookOptions: RouteHookOptions = {
      signal: controller.signal,
      shouldRun: () => !controller.signal.aborted,
      revalidating: false,
      location,
      deps,
      cause,
    };
    return loading
      .loadRoute(match, route, context, hookOptions, false)
      .then(() => undefined)
      .catch((error: unknown) => {
        if (!hookOptions.shouldRun()) {
          return undefined;
        }
        matches.removeCached(match.id);
        if (isRouteRedirect(error)) {
          const follow = beginRedirectFollow(location, error.location, redirectFollow);
          return preloadLocation(error.location, context, follow);
        }
        return undefined;
      });
  };

  const preloadRoute = (routeId: TRouteId, context: TLoadContext): Promise<void> =>
    preloadAtLocation(routeId, context, locationForRoute(routeId));

  const preloadLocation = (
    location: RouteLocation,
    context: TLoadContext,
    redirectFollow?: RedirectFollowState,
  ): Promise<void> => {
    lastContext = { value: context };
    const normalized = normalizeLocation(location);
    const routeId = compiled.routeIdFromPath(normalized.pathname, basePath);
    return routeId === null
      ? Promise.resolve()
      : preloadAtLocation(routeId, context, normalized, redirectFollow);
  };

  const hasPendingNavigationToDifferentMatch = (matchId: string): boolean => {
    const run = currentRun;
    return run !== null && !run.controller.signal.aborted && run.matchId !== matchId;
  };

  return {
    routes: [...compiled.byId.values()],
    getRoute: (routeId: TRouteId) => compiled.byId.get(routeId) ?? null,
    getMatch: matches.getMatch,
    preloadRoute,
    preloadLocation,
    invalidate(routeId) {
      matches.invalidate(routeId);
      const active = matches.getActiveMatch();
      if (
        !active ||
        (routeId !== undefined && active.routeId !== routeId) ||
        !lastContext ||
        (routeId === undefined && hasPendingNavigationToDifferentMatch(active.id))
      ) {
        return Promise.resolve();
      }
      return navigate(
        active.routeId,
        lastContext.value,
        { history: "none", revalidate: true },
        active.location,
      );
    },
    getState: matches.getState,
    subscribe: matches.subscribe,
    subscribeSelector: matches.subscribeSelector,
    subscribeMatch: matches.subscribeMatch,
    pathForRoute: compiled.pathForRoute,
    routeIdFromPath: compiled.routeIdFromPath,
    start(nextHistory: RouterHistory, nextBasePath: string, context: TLoadContext): Promise<void> {
      history = nextHistory;
      basePath = normalizeRouteBasePath(nextBasePath);
      stopHistory?.();
      lastContext = { value: context };
      stopHistory = history.listen((location) => {
        if (lastContext) {
          void handleLocation(location, lastContext.value).catch(() => undefined);
        }
      });
      return handleLocation(history.location(), context, true);
    },
    navigate,
    navigateLocation(location: RouteLocation, context: TLoadContext): Promise<void> {
      return handleLocation(location, context);
    },
    revalidate(context: TLoadContext, routeId?: TRouteId): Promise<void> {
      const active = matches.getActiveMatch();
      const targetRouteId = routeId ?? active?.routeId;
      if (
        targetRouteId === undefined ||
        (routeId === undefined &&
          active !== undefined &&
          hasPendingNavigationToDifferentMatch(active.id))
      ) {
        return Promise.resolve();
      }
      const target =
        active?.routeId === targetRouteId ? active.location : locationForRoute(targetRouteId);
      return navigate(targetRouteId, context, { history: "none", revalidate: true }, target);
    },
    stop() {
      stopHistory?.();
      stopHistory = undefined;
      cancelCurrentRun();
      history = undefined;
      lastContext = undefined;
      loading.clear();
      matches.clear();
    },
  };
}
