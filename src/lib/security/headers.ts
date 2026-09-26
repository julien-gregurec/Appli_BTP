export type HeaderSecurite = { key: string; value: string };

function origineHttps(valeur?: string) {
  if (!valeur) return null;
  try {
    const url = new URL(valeur);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function origineSupabaseLocale(valeur: string | undefined, isDevelopment: boolean) {
  if (!isDevelopment || !valeur) return null;
  try {
    const url = new URL(valeur);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

export function construireContentSecurityPolicy({
  nonce,
  isDevelopment,
  supabaseUrl,
  sentryDsn,
}: {
  nonce: string;
  isDevelopment: boolean;
  supabaseUrl?: string;
  sentryDsn?: string;
}) {
  const supabase = origineHttps(supabaseUrl) ?? origineSupabaseLocale(supabaseUrl, isDevelopment);
  const supabaseWs = supabase?.replace(/^https:/, "wss:").replace(/^http:/, "ws:") ?? null;
  const sentry = origineHttps(sentryDsn);
  const connectSrc = ["'self'", supabase, supabaseWs, sentry].filter(Boolean).join(" ");
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", isDevelopment ? "'unsafe-eval'" : null]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Exception temporaire documentée : de nombreux composants React utilisent
    // encore des attributs style. Les scripts inline, eux, restent interdits.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function headersSecurite(isProduction: boolean): HeaderSecurite[] {
  return [
    ...(isProduction
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
      : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(self), geolocation=(self), microphone=(), payment=(self), usb=()",
    },
  ];
}
