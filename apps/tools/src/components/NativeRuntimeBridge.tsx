"use client";

import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getRuntimePlatform, resolveToolsDeepLink } from "@/lib/platform";
import { getElsatiaClient } from "@/lib/auth/client";

export function NativeRuntimeBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (getRuntimePlatform() !== "web") window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    const platform = getRuntimePlatform();
    document.documentElement.dataset.runtime = platform;
    if (platform === "web") return;

    let disposed = false;
    let handles: PluginListenerHandle[] = [];
    void Promise.all([
      App.addListener("appUrlOpen", ({ url }) => {
        const route = resolveToolsDeepLink(url);
        if (!route) return;
        const code = new URL(url).searchParams.get("code");
        if (code) void getElsatiaClient().auth.exchangeCodeForSession(code).finally(() => router.push("/compte?recovery=1"));
        else router.push(route);
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
