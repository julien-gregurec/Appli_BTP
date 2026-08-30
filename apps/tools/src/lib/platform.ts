import { Capacitor } from "@capacitor/core";
import { SITE } from "./site";

export const RUNTIME_PLATFORMS = ["web", "ios", "android"] as const;
export type RuntimePlatform = (typeof RUNTIME_PLATFORMS)[number];

export function normalizeRuntimePlatform(platform: string, isNative: boolean): RuntimePlatform {
  if (!isNative) return "web";
  return platform === "ios" || platform === "android" ? platform : "web";
}

export function getRuntimePlatform(): RuntimePlatform {
  return normalizeRuntimePlatform(Capacitor.getPlatform(), Capacitor.isNativePlatform());
}

export function isNativeRuntime() {
  return getRuntimePlatform() !== "web";
}

export function resolveToolsDeepLink(rawUrl: string, canonicalOrigin = SITE.defaultUrl): string | null {
  try {
    const url = new URL(rawUrl);
    const origin = new URL(canonicalOrigin);
    if (url.protocol !== "https:" || url.hostname !== origin.hostname) return null;
    if (url.pathname === "/" || /^\/outils\/[a-z0-9-]+\/?$/.test(url.pathname)) return `${url.pathname}${url.search}${url.hash}`;
    return null;
  } catch {
    return null;
  }
}
