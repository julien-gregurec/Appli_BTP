"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw-tools.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
  }, []);
  return null;
}
