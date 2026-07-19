import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hors ligne — Liria Gestion Pro" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0d1b2a] px-6 text-center text-white">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#c9a24a" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 1l22 22" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Vous êtes hors ligne</h1>
        <p className="max-w-sm text-sm text-white/70">
          Liria Gestion Pro a besoin d&apos;une connexion Internet pour afficher vos données.
          Vérifiez votre réseau, puis réessayez.
        </p>
      </div>
      <a href="/dashboard"
        className="rounded-lg bg-[#c9a24a] px-5 py-2.5 text-sm font-semibold text-[#0d1b2a]">
        Réessayer
      </a>
    </main>
  );
}
