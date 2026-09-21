"use client";

import { Browser } from "@capacitor/browser";
import type { MouseEvent, ReactNode } from "react";
import { isNativeRuntime } from "@/lib/platform";

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  async function openExternally(event: MouseEvent<HTMLAnchorElement>) {
    if (!isNativeRuntime()) return;
    event.preventDefault();
    await Browser.open({ url: href, presentationStyle: "popover" });
  }

  return <a className={className} href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => void openExternally(event)}>{children}</a>;
}
