"use client";

import { ErreurColors } from "@/components/ErreurColors";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErreurColors reset={reset} />;
}
