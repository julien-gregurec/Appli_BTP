/**
 * Wall-clock budget of one render: never below the configured value (default 600 s) and
 * never below three times the video length plus a minute. A 60 s 1080x1920 timeline was
 * measured at roughly twice its length, so a fixed 600 s made every video over ~5 minutes
 * time out with no way to succeed on retry.
 */
export function renderTimeoutSeconds(
  configured: string | undefined,
  durationMs: number,
): number {
  const base = Math.min(3600, Math.max(30, Number(configured || 600) || 600));
  const scaled = Math.ceil((Math.max(0, durationMs) / 1000) * 3) + 60;
  return Math.min(7200, Math.max(base, scaled));
}
