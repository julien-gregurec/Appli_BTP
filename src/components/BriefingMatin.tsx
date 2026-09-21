"use client";

export type LigneBriefing = { niveau: "bon" | "attention" | "critique"; texte: string };

const PUCE = { bon: "🟢", attention: "🟡", critique: "🔴" } as const;

export function BriefingMatin({ prenom, lignes, peutUtiliserIA = true }: { prenom: string | null; lignes: LigneBriefing[]; peutUtiliserIA?: boolean }) {
  function ouvrirAssistant() {
    window.dispatchEvent(new CustomEvent("elsatia:ouvrir-assistant"));
  }

  return (
    <section className="rounded-xl border-2 border-elsatia-navy/20 bg-elsatia-navy p-5 text-white">
      <h1 className="text-lg font-semibold">Bonjour{prenom ? ` ${prenom}` : ""} 👋</h1>
      <p className="mt-0.5 text-sm text-white/70">Aujourd&apos;hui :</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {lignes.map((ligne, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden="true">{PUCE[ligne.niveau]}</span>
            <span>{ligne.texte}</span>
          </li>
        ))}
      </ul>
      {peutUtiliserIA && (
        <button
          type="button"
          onClick={ouvrirAssistant}
          className="mt-4 rounded-md bg-elsatia-gold px-4 py-2 text-sm font-semibold text-elsatia-navy hover:brightness-95"
        >
          ✨ Que souhaites-tu faire ?
        </button>
      )}
    </section>
  );
}
