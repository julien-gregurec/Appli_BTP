import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="brand" aria-label="ELSATIA Colors — Tableau de bord">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>ELSATIA</strong>
          <span>Colors</span>
        </span>
      )}
    </Link>
  );
}
