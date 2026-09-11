"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LIBELLES_ETAT_DOCUMENT,
  issueRevalidation,
  peutEtreEmporte,
  tailleAnnoncee,
  type EtatDocument,
} from "@/lib/mobile/offline/documents-emportes";
import {
  conserverDocumentEmporte,
  lireDocumentsEmportes,
  enBlob,
  ouvrirBase,
  retirerDocumentEmporte,
  type DocumentEmporte,
  type IdentiteBase,
} from "@/lib/mobile/offline/base-locale";

type DocumentServeur = { id: string; nom: string; mime_type: string; taille_octets: number };

const quand = (ms: number) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

/**
 * Sélection des documents à emporter pour consultation hors ligne.
 *
 * Rien n'est téléchargé sans un geste explicite, et la taille est annoncée AVANT : sur un
 * forfait de chantier, c'est l'utilisateur qui décide de ce qu'il consomme. Chaque document
 * emporté affiche la date de sa dernière synchronisation — un plan vu hors ligne peut avoir
 * été remplacé depuis, et le salarié doit pouvoir le savoir.
 *
 * Lecture seule : un document emporté s'ouvre pour être consulté, jamais pour être modifié.
 */
export function DocumentsEmportes({
  identite, chantierId, documents,
}: { identite: IdentiteBase; chantierId: string; documents: DocumentServeur[] }) {
  const [locaux, setLocaux] = useState<DocumentEmporte[]>([]);
  const [etats, setEtats] = useState<Record<string, EtatDocument>>({});
  const [avis, setAvis] = useState<string | null>(null);

  const relire = useCallback(async () => {
    const base = await ouvrirBase(identite);
    if (!base) return;
    try { setLocaux(await lireDocumentsEmportes(base, chantierId)); } finally { base.close(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identité stable pour une session
  }, [identite.entrepriseId, identite.utilisateurId, chantierId]);

  /**
   * Revérifie chaque document emporté au retour du réseau. Un document supprimé ou dont
   * l'accès a été retiré voit sa copie EFFACÉE, et l'utilisateur en est informé.
   */
  const revalider = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const base = await ouvrirBase(identite);
    if (!base) return;
    try {
      const presents = await lireDocumentsEmportes(base, chantierId);
      const revoques: string[] = [];
      for (const doc of presents) {
        let statut = 0;
        try {
          const reponse = await fetch(`/api/documents/${doc.id}`, { method: "GET", redirect: "manual" });
          // Une redirection vers l'URL signée signifie « toujours accessible ».
          statut = reponse.type === "opaqueredirect" ? 302 : reponse.status;
        } catch { statut = 0; }
        if (issueRevalidation(statut) === "revoquer") {
          await retirerDocumentEmporte(base, doc.id);
          revoques.push(doc.nom);
        }
      }
      if (revoques.length) {
        setAvis(`Plus accessible, copie effacée de l’appareil : ${revoques.join(", ")}.`);
      }
      setLocaux(await lireDocumentsEmportes(base, chantierId));
    } finally {
      base.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identité stable pour une session
  }, [identite.entrepriseId, identite.utilisateurId, chantierId]);

  useEffect(() => {
    void relire().then(revalider);
    const auRetour = () => { void revalider(); };
    window.addEventListener("online", auRetour);
    return () => window.removeEventListener("online", auRetour);
  }, [relire, revalider]);

  async function emporter(doc: DocumentServeur) {
    const controle = peutEtreEmporte(doc.mime_type, Number(doc.taille_octets));
    if (!controle.valide) { setAvis(controle.motif); return; }
    setEtats((e) => ({ ...e, [doc.id]: "telechargement" }));
    try {
      // La route redirige vers une URL signée valable 60 s : le fichier n'est jamais servi
      // sans passer par le contrôle d'accès de la base.
      const reponse = await fetch(`/api/documents/${doc.id}`);
      if (!reponse.ok) throw new Error(String(reponse.status));
      const contenu = await reponse.arrayBuffer();
      const base = await ouvrirBase(identite);
      if (!base) throw new Error("stockage");
      try {
        await conserverDocumentEmporte(base, {
          id: doc.id, chantierId, nom: doc.nom, mime: doc.mime_type,
          taille: contenu.byteLength, contenu, emporteA: Date.now(),
        });
      } finally { base.close(); }
      setEtats((e) => ({ ...e, [doc.id]: "disponible" }));
      await relire();
    } catch {
      setEtats((e) => ({ ...e, [doc.id]: "erreur" }));
    }
  }

  async function retirer(id: string) {
    const base = await ouvrirBase(identite);
    if (!base) return;
    try { await retirerDocumentEmporte(base, id); } finally { base.close(); }
    // L'état « disponible » posé par le téléchargement primait sur la copie locale : après
    // retrait, la ligne affichait encore « Disponible hors ligne » alors que rien ne restait
    // sur l'appareil. On l'efface pour que l'écran dise la vérité.
    setEtats((e) => { const reste = { ...e }; delete reste[id]; return reste; });
    await relire();
  }

  function ouvrir(doc: DocumentEmporte) {
    // Consultation seule : une URL d'objet locale, ouverte dans un nouvel onglet.
    const url = URL.createObjectURL(enBlob(doc.contenu, doc.mime));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const parId = new Map(locaux.map((d) => [d.id, d]));

  return (
    <section className="rounded-lg border p-4" data-test="documents-emportes" data-consultation aria-label="Documents disponibles hors ligne">
      <h2 className="font-semibold">Emporter pour consulter hors ligne</h2>
      <p className="mt-1 text-xs text-neutral-500">Choisissez les documents à garder sur l’appareil. Rien n’est téléchargé sans votre accord.</p>
      {avis && <p role="status" className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" data-test="documents-emportes-avis">{avis}</p>}
      <ul className="mt-3 divide-y">
        {documents.map((doc) => {
          const local = parId.get(doc.id);
          const etat: EtatDocument = etats[doc.id] ?? (local ? "disponible" : "absent");
          return (
            <li key={doc.id} className="flex flex-wrap items-center gap-2 py-3 text-sm" data-test={`doc-${doc.id}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{doc.nom}</span>
                <span className="block text-xs text-neutral-500">
                  {tailleAnnoncee(Number(doc.taille_octets))} · {LIBELLES_ETAT_DOCUMENT[etat]}
                  {local && ` · synchronisé le ${quand(local.emporteA)}`}
                </span>
              </span>
              {local ? (
                <>
                  <button type="button" onClick={() => ouvrir(local)} className="min-h-[44px] rounded-md border px-3 text-xs font-medium">Consulter</button>
                  <button type="button" onClick={() => void retirer(doc.id)} className="min-h-[44px] rounded-md px-3 text-xs text-neutral-500 underline">Retirer de l’appareil</button>
                </>
              ) : (
                <button type="button" disabled={etat === "telechargement"} onClick={() => void emporter(doc)}
                  className="min-h-[44px] rounded-md bg-[#0d1b2a] px-3 text-xs font-semibold text-white disabled:opacity-50">
                  Emporter ({tailleAnnoncee(Number(doc.taille_octets))})
                </button>
              )}
            </li>
          );
        })}
        {!documents.length && <li className="py-3 text-sm text-neutral-500">Aucun document consultable pour ce chantier.</li>}
      </ul>
    </section>
  );
}
