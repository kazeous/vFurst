export type PlatformManagerRequestErrorContext = Readonly<{
  routePath?: string;
  routeType?: string;
  routerKind?: string;
}>;

export type PlatformManagerRequestContext = Readonly<{
  method?: string;
  path?: string;
}>;

export type PlatformManagerErrorReporter = (
  error: unknown,
  request: PlatformManagerRequestContext,
  context: PlatformManagerRequestErrorContext
) => void | Promise<void>;

let reporter: PlatformManagerErrorReporter = (error, request, context) => {
  console.error("[platform-manager] unhandled request error", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind
  });
};

/** Allows a future Sentry adapter to be registered without coupling this shell to its SDK. */
export function setPlatformManagerErrorReporter(nextReporter: PlatformManagerErrorReporter) {
  reporter = nextReporter;
}

export function reportPlatformManagerRequestError(
  error: unknown,
  request: PlatformManagerRequestContext,
  context: PlatformManagerRequestErrorContext
) {
  return reporter(error, request, context);
}
