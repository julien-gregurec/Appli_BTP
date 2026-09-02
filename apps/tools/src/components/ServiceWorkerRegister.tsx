"use client";

import { useEffect } from "react";
import { isNativeRuntime } from "@/lib/platform";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!isNativeRuntime() && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw-tools.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
  }, []);
  return null;
}
