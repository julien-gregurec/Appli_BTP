/** Opt-in local E2E diagnostics. Never record request headers, tokens or successful user bodies. */
import { appendFileSync } from "node:fs";
const destination = process.env.STUDIO_RUNTIME_TRACE;
if (destination) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.hostname !== "127.0.0.1") return original(input, init);
    const started = performance.now();
    const record = {
      at: new Date().toISOString(),
      pid: process.pid,
      path: url.pathname,
      method: init?.method ?? "GET",
    };
    try {
      const response = await original(input, init);
      record.status = response.status;
      if (!response.ok || url.pathname.endsWith("/studio_my_role")) {
        const text = await response.clone().text();
        try {
          const body = JSON.parse(text);
          record.body =
            typeof body === "string" &&
            ["owner", "admin", "editor", "viewer"].includes(body)
              ? body
              : {
                  code: body?.code,
                  error_code: body?.error_code,
                  message:
                    typeof body?.message === "string"
                      ? body.message
                          .slice(0, 300)
                          .replace(/eyJ[\w.-]+/g, "[redacted]")
                      : undefined,
                };
        } catch {
          record.body = "Non-JSON response";
        }
      }
      return response;
    } catch (error) {
      record.status = 0;
      record.error = error.name;
      record.code = error.cause?.code;
      throw error;
    } finally {
      record.ms = Math.round(performance.now() - started);
      appendFileSync(destination, JSON.stringify(record) + "\n", {
        mode: 0o600,
      });
    }
  };
}
