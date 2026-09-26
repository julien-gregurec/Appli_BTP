"use client";

import { useState } from "react";
import { formaterOctets } from "@/lib/images";

export type PhotoAffichee = {
  id: string;
  usage: string;
  legende: string | null;
  url: string | null;
  taille_octets: number | null;
  nom_fichier: string | null;
  deposee_par_hote: boolean;
  created_at: string;
};

const SECTIONS: { usage: string; titre: string; aide: string }[] = [
  { usage: "constat", titre: "Avant — constat", aide: "L’état relevé au moment de l’émission de la réserve." },
  { usage: "travaux", titre: "Après — travaux", aide: "L’ouvrage au moment de la demande de levée." },
  { usage: "levee", titre: "Levée", aide: "Pièces jointes à la validation." },
  { usage: "preuve_refus", titre: "Preuve de refus", aide: "Pièces produites à l’appui d’un refus de responsabilité." },
];

export function GaleriePhotos({ photos }: { photos: PhotoAffichee[] }) {
  const [plein, setPlein] = useState<PhotoAffichee | null>(null);
  if (photos.length === 0) {
    return <p className="vide">Aucune photo rattachée à cette réserve.</p>;
  }

  return (
    <>
      {SECTIONS.map((section) => {
        const lot = photos.filter((p) => p.usage === section.usage);
        if (lot.length === 0) return null;
        return (
          <section key={section.usage} className="galerie-section">
            <h3>{section.titre} <span className="mention">({lot.length})</span></h3>
            <p className="mention">{section.aide}</p>
            <div className="galerie">
              {lot.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className="vignette"
                  onClick={() => setPlein(photo)}
                  aria-label={`Agrandir la photo ${photo.legende ?? section.titre}`}
                >
                  {photo.url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={photo.url} alt={photo.legende ?? section.titre} loading="lazy" />
                  ) : (
                    <span className="vignette-absente">Aperçu indisponible</span>
                  )}
                  <span className="vignette-pied">
                    {photo.deposee_par_hote ? "Maître d’ouvrage" : "Entreprise"}
                    {" · "}
                    {new Date(photo.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {plein && (
        <div className="plein-ecran" role="dialog" aria-modal="true" onClick={() => setPlein(null)}>
          <button type="button" className="bouton secondaire plein-fermer" onClick={() => setPlein(null)}>
            Fermer
          </button>
          {plein.url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={plein.url} alt={plein.legende ?? "Photo de la réserve"} />
          )}
          <p className="plein-legende">
            {plein.legende ?? "Sans légende"} · {formaterOctets(plein.taille_octets)} ·
            {" "}{new Date(plein.created_at).toLocaleString("fr-FR")}
          </p>
        </div>
      )}
    </>
  );
}
