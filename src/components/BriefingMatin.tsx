"use client";

export type LigneBriefing = { niveau: "bon" | "attention" | "critique"; texte: string };

const PUCE = { bon: "🟢", attention: "🟡", critique: "🔴" } as const;

export function BriefingMatin({ prenom, lignes }: { prenom: string | null; lignes: LigneBriefing[] }) {
  function ouvrirAssistant() {
    window.dispatchEvent(new CustomEvent("liria:ouvrir-assistant"));
  }

  return (
    <section className="rounded-xl border-2 border-liria-navy/20 bg-liria-navy p-5 text-white">
      <h1 className="text-lg font-semibold">Bonjour{prenom ? ` ${prenom}` : ""} 👋</h1>
      <p className="mt-0.5 text-sm text-white/70">Aujourd'hui :</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {lignes.map((ligne, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden="true">{PUCE[ligne.niveau]}</span>
            <span>{ligne.texte}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={ouvrirAssistant}
        className="mt-4 rounded-md bg-liria-gold px-4 py-2 text-sm font-semibold text-liria-navy hover:brightness-95"
      >
        ✨ Que souhaites-tu faire ?
      </button>
    </section>
  );
}
