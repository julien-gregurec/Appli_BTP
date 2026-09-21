/** Preserve explicit HTTP refusals; transport failures never imply a business role. */
export function restErrorStatus(
  error: { code?: string } | null,
  status?: number,
): number {
  if (status && [401, 403, 404, 409, 429].includes(status)) return status;
  const code = error?.code ?? "";
  // Studio raises 40001 for optimistic revision conflicts; PostgREST may emit HTTP 500.
  if (code === "40001") return 409;
  if (status !== undefined && (status === 0 || status >= 500)) return 503;
  if (/^(PGRST00[0-3]|08|53|57)/.test(code)) return 503;
  if (code === "42501") return 403;
  if (["40001", "23505", "23503"].includes(code)) return 409;
  if (/^22/.test(code) || code === "P0001" || status === 400) return 400;
  return 500;
}
export function isTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (["AbortError", "TimeoutError"].includes(error.name)) return true;
  const cause = error.cause;
  return (
    (error instanceof TypeError && error.message === "fetch failed") ||
    (typeof cause === "object" &&
      cause !== null &&
      "code" in cause &&
      /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_)/.test(
        String(cause.code),
      ))
  );
}
