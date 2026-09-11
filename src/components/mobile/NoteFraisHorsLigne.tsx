"use client";

import { useState } from "react";
import { nouvelleCle } from "@/lib/mobile/offline/contrat";
import { conserverJustificatif, inscrireMutation, ouvrirBase, type IdentiteBase } from "@/lib/mobile/offline/base-locale";
import { controlerFichier, empreinteSha256, TYPES_DOCUMENT, type TypeDocument } from "@/lib/mobile/offline/justificatifs";

const LIBELLES_TYPE: Record<TypeDocument, string> = {
  facture: "Facture",
  ticket_caisse: "Ticket de caisse",
  recu_paiement: "Reçu de paiement",
  recu_carte_bancaire: "Reçu de carte bancaire",
  facture_electronique_originale: "Facture électronique originale",
  autre_justificatif: "Autre justificatif",
};

const champ = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900";

/**
 * Note de frais AVEC justificatif, préparée sans réseau.
 *
 * Réserve R3. Le formulaire habituel crée le brouillon par un Server Action, puis invite à
 * photographier le ticket — deux étapes EN LIGNE. Hors réseau, la première échoue et la
 * seconde n'est jamais proposée : la note partait, au mieux, sans son fichier.
 *
 * Ici, note et fichier sont conservés ENSEMBLE sur l'appareil, et partiront ensemble. Le
 * fichier est contrôlé AVANT d'être conservé — taille et type réel, exactement comme le
 * serveur le fera — pour qu'un salarié ne découvre pas au retour du réseau, loin du ticket,
 * que sa pièce sera refusée.
 *
 * L'utilisateur doit affirmer que le document est visible en entier : la route de dépôt
 * l'exige, et c'est lui qui a le ticket sous les yeux au moment de la capture — pas au moment
 * de l'envoi, qui peut survenir des heures plus tard.
 */
export function NoteFraisHorsLigne({ identite, employeId }: { identite: IdentiteBase; employeId: string }) {
  const [montant, setMontant] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [typeDocument, setTypeDocument] = useState<TypeDocument>("ticket_caisse");
  const [fichier, setFichier] = useState<File | null>(null);
  const [entier, setEntier] = useState(false);
  const [etat, setEtat] = useState<null | { ok: boolean; message: string }>(null);
  const [enCours, setEnCours] = useState(false);

  async function conserver(evenement: React.FormEvent) {
    evenement.preventDefault();
    setEtat(null);

    const valeur = Number(montant.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0) { setEtat({ ok: false, message: "Indiquez un montant positif." }); return; }
    if (!fichier) { setEtat({ ok: false, message: "Ajoutez la photo ou le fichier du justificatif." }); return; }
    if (!entier) { setEtat({ ok: false, message: "Confirmez que le document est visible en entier." }); return; }

    setEnCours(true);
    try {
      const octets = new Uint8Array(await fichier.arrayBuffer());
      const controle = controlerFichier(octets, fichier.name);
      if (!controle.valide) { setEtat({ ok: false, message: controle.motif }); return; }

      const base = await ouvrirBase(identite);
      if (!base) { setEtat({ ok: false, message: "Le stockage local n’est pas disponible sur cet appareil." }); return; }

      try {
        // La clé de la note sert de clé primaire au serveur : le rejeu ne duplique pas.
        const id = nouvelleCle();
        // Le FICHIER d'abord : si l'appareil s'éteint entre les deux écritures, on préfère un
        // fichier orphelin — purgé à la déconnexion — à une note qui partirait sans pièce.
        await conserverJustificatif(base, {
          id: nouvelleCle(),
          mutationId: id,
          nom: fichier.name,
          mime: controle.mime,
          taille: octets.length,
          empreinte: await empreinteSha256(octets),
          // Octets bruts, pas un `Blob` : WebKit refuse un `Blob` dans IndexedDB en navigation privée.
          contenu: octets.buffer as ArrayBuffer,
          depose: false,
          documentId: null,
        });
        await inscrireMutation(base, {
          id,
          type: "note_frais_brouillon",
          entrepriseId: identite.entrepriseId,
          utilisateurId: identite.utilisateurId,
          capteA: Date.now(),
          etat: "en_attente",
          tentatives: 0,
          version: 1,
          payload: {
            employe_id: employeId,
            montant_ttc: valeur,
            fournisseur: fournisseur || null,
            lieu_hors_chantier: "sans_chantier",
            avec_justificatif: true,
            type_document: typeDocument,
          },
        });
      } finally {
        base.close();
      }

      setEtat({ ok: true, message: "Note et justificatif conservés sur l’appareil. Ils partiront ensemble au retour du réseau." });
      setMontant(""); setFournisseur(""); setFichier(null); setEntier(false);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20" data-test="note-hors-ligne">
      <h2 className="font-semibold">Nouvelle dépense sans réseau</h2>
      <p className="mt-1 text-xs text-neutral-600">La note et sa photo restent sur l’appareil et partiront ensemble dès le retour du réseau.</p>
      <form onSubmit={conserver} className="mt-3 grid gap-3">
        <label className="text-xs text-neutral-600">Montant TTC
          <input name="montant" inputMode="decimal" required value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="42,50" className={champ} />
        </label>
        <label className="text-xs text-neutral-600">Fournisseur
          <input name="fournisseur" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} className={champ} />
        </label>
        <label className="text-xs text-neutral-600">Type de justificatif
          <select name="type_document" value={typeDocument} onChange={(e) => setTypeDocument(e.target.value as TypeDocument)} className={champ}>
            {TYPES_DOCUMENT.map((t) => <option key={t} value={t}>{LIBELLES_TYPE[t]}</option>)}
          </select>
        </label>
        <label className="text-xs text-neutral-600">Photo ou fichier du justificatif
          {/* `capture` ouvre directement l'appareil photo sur un téléphone ; un fichier reste importable. */}
          <input name="justificatif" type="file" accept="image/*,application/pdf" capture="environment"
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className={champ} />
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={entier} onChange={(e) => setEntier(e.target.checked)} className="h-5 w-5" />
          Le document est visible en entier
        </label>
        <button disabled={enCours} className="min-h-[44px] rounded-md bg-[#0d1b2a] px-4 text-sm font-semibold text-white disabled:opacity-50">
          {enCours ? "Conservation…" : "Conserver la note et sa photo"}
        </button>
        {etat && (
          <p role="status" aria-live="polite" data-test="note-hors-ligne-etat"
            className={`rounded-md px-3 py-2 text-sm ${etat.ok ? "bg-green-100 text-green-900" : "bg-red-50 text-red-800"}`}>
            {etat.message}
          </p>
        )}
      </form>
    </section>
  );
}
