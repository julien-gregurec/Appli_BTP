"use client";

import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getRuntimePlatform, resolveToolsDeepLink } from "@/lib/platform";

export function NativeRuntimeBridge() {
  const router = useRouter();

  useEffect(() => {
    const platform = getRuntimePlatform();
    document.documentElement.dataset.runtime = platform;
    if (platform === "web") return;

    let disposed = false;
    let handles: PluginListenerHandle[] = [];
    void Promise.all([
      App.addListener("appUrlOpen", ({ url }) => {
        const route = resolveToolsDeepLink(url);
        if (route) router.push(route);
      }),
      App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack && window.location.pathname !== "/") window.history.back();
        else if (window.location.pathname !== "/") router.replace("/");
        else void App.exitApp();
      }),
    ]).then((listeners) => {
      if (disposed) listeners.forEach((listener) => void listener.remove());
      else handles = listeners;
    });

    return () => {
      disposed = true;
      handles.forEach((listener) => void listener.remove());
    };
  }, [router]);

  return null;
}
