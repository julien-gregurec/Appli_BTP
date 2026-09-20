/** PII-free server error record: route template, method and digest only; never URL, query, headers or message. */
export function describeRequestError(
  error: unknown,
  request: { method: string },
  context: { routePath: string; routeType: string; routerKind: string },
) {
  return {
    level: "error",
    service: "studio-web",
    event: "request_error",
    error_name: error instanceof Error ? error.name : typeof error,
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String(error.digest).slice(0, 64)
        : undefined,
    method: request.method,
    route: context.routePath,
    route_type: context.routeType,
    router: context.routerKind,
    at: new Date().toISOString(),
  };
}
