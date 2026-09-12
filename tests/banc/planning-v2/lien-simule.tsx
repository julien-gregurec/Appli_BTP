/** Banc : doublure de `next/link` — une ancre ordinaire. */
import type { AnchorHTMLAttributes, ReactNode } from "react";
export default function Link({ href, children, ...reste }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href} {...reste}>{children}</a>;
}
