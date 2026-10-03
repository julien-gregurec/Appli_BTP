"use client";

import { useState } from "react";
import { LIBELLE_RESEAU, type Reseau } from "@/lib/social/types";

export type MediaApercu = { id: string; type: "image" | "video"; url: string | null; texteAlternatif: string };

// Nombre approximatif de caractères visibles avant « … voir plus » sur chaque plateforme.
const TRONCATURE: Record<Reseau, number> = { facebook: 480, instagram: 125, linkedin: 210 };

function Logo({ logo, taille = 40 }: { logo: string | null; taille?: number }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element -- logo statique local, dimensions fixées
    return <img src={logo} alt="ELSATIA" width={taille} height={taille} className="rounded-full border border-elsatia-argent bg-white object-contain" />;
  }
  // Aucun logo de substitution : l'absence du fichier officiel est signalée telle quelle.
  return (
    <span role="img" aria-label="Logo officiel ELSATIA manquant" title="Déposer public/elsatia/symbole.svg" className="flex items-center justify-center rounded-full border border-dashed border-red-400 bg-red-50 text-center text-[8px] font-semibold leading-tight text-red-700" style={{ width: taille, height: taille }}>
      logo manquant
    </span>
  );
}

function Media({ media, carre }: { media: MediaApercu | undefined; carre?: boolean }) {
  if (!media) return null;
  if (!media.url) return <div className="flex h-48 items-center justify-center bg-neutral-100 text-xs text-neutral-500 dark:bg-neutral-800">Aperçu du média indisponible</div>;
  return media.type === "image" ? (
    // eslint-disable-next-line @next/next/no-img-element -- lien signé temporaire, non optimisable par next/image
    <img src={media.url} alt={media.texteAlternatif || "Visuel de la publication"} className={`w-full bg-neutral-100 object-cover ${carre ? "aspect-[4/5]" : "max-h-96"}`} />
  ) : (
    <video src={media.url} controls muted playsInline className={`w-full bg-black ${carre ? "aspect-[9/16] max-h-[28rem]" : "max-h-96"}`} />
  );
}

export function ApercuReseau({ reseau, texte, lien, medias, nomCompte, logo }: { reseau: Reseau; texte: string; lien: string; medias: MediaApercu[]; nomCompte: string; logo: string | null }) {
  const [deplie, setDeplie] = useState(false);
  const limite = TRONCATURE[reseau];
  const tronque = !deplie && [...texte].length > limite;
  const affiche = tronque ? `${[...texte].slice(0, limite).join("")}…` : texte;
  const lienAffiche = reseau !== "instagram" && lien && medias.length === 0;

  return (
    <article aria-label={`Aperçu ${LIBELLE_RESEAU[reseau]}`} className="overflow-hidden rounded-lg border border-neutral-200 bg-white text-[#1f2328] shadow-sm dark:border-neutral-700">
      <div className="flex items-center gap-2 p-3">
        <Logo logo={logo} taille={reseau === "instagram" ? 32 : 40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{nomCompte}</p>
          <p className="text-xs text-neutral-500">{reseau === "linkedin" ? "Page Entreprise · Maintenant" : reseau === "facebook" ? "Maintenant · Public" : "Publication"}</p>
        </div>
      </div>
      {reseau === "instagram" ? (
        <>
          <Media media={medias[0]} carre />
          {medias.length === 0 && <div className="flex aspect-[4/5] items-center justify-center bg-red-50 p-4 text-center text-sm text-red-700">Instagram exige une image ou une vidéo</div>}
          <p className="whitespace-pre-wrap break-words p-3 text-sm"><strong>{nomCompte}</strong> {affiche}{tronque && <button type="button" className="text-neutral-500" onClick={() => setDeplie(true)}> plus</button>}</p>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words px-3 pb-3 text-sm">{affiche}{tronque && <button type="button" className="font-semibold text-neutral-500" onClick={() => setDeplie(true)}> …voir plus</button>}</p>
          <Media media={medias[0]} />
          {lienAffiche && (
            <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              <p className="truncate">{lien.replace(/^https:\/\//, "")}</p>
              <p className="text-[11px] text-neutral-400">{reseau === "facebook" ? "Aperçu de lien généré par Facebook" : "Article (titre = titre de la publication)"}</p>
            </div>
          )}
        </>
      )}
      <p className="border-t border-neutral-100 px-3 py-1.5 text-[11px] text-neutral-400">Aperçu indicatif : le rendu final dépend de la plateforme et de l’appareil.</p>
    </article>
  );
}
