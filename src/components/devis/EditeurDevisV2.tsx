"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { euros, LIGNE_TYPES, UNITES } from "@/lib/devis";
import { enregistrerDevisV2Action } from "@/app/actions/devis-v2";
import { ApercuDevisV2 } from "@/components/devis/ApercuDevisV2";
import { InsertionOuvrageDialog } from "@/components/devis/InsertionOuvrageDialog";
import { PrixGlobalDialog } from "@/components/devis/PrixGlobalDialog";
import { SelectionArticlesDialog } from "@/components/devis/SelectionArticlesDialog";
import { FiligraneSelecteur } from "@/components/documents/FiligraneSelecteur";
import type { IdentiteEmetteur, SourceDocument, StyleDocument } from "@/lib/devis/document-modele";
import {
  ajouterLigneLibre,
  ajouterOuvrage,
  cleElement,
  deplacerElement,
  modifierLigneLibre,
  remplacerOuvrage,
  retirerElement,
  validerBrouillon,
  type EtatElements,
} from "@/lib/devis/editeur-etat";
import type { EnteteDevisV2 } from "@/lib/devis/enregistrement-v2";
import { resoudreFiligrane, type ReglagesFiligraneEntreprise } from "@/lib/devis/filigrane";
import { MODES_PRESENTATION, type InstanceOuvrage, type ModePresentation } from "@/lib/devis/ouvrages";
import { totauxDevis, type ElementDevis, type LigneLibre } from "@/lib/devis/presentation";
import { avertissementsPrix, indicateursPrix, TAUX_TVA_ADMIS } from "@/lib/devis/prix";

export type ClientEditeur = { id: string; label: string; adresse: string | null; codePostal: string | null; ville: string | null; siret: string | null };
export type ChantierEditeur = { id: string; label: string; clientId: string | null };
export type DroitsEditeur = { voirCouts: boolean; gererCouts: boolean; modifierPrix: boolean; modifierUnite: boolean };

type Dialogue = null | { type: "articles" } | { type: "ouvrage"; instance: InstanceOuvrage | null } | { type: "prix"; instance: InstanceOuvrage };

const champ = "min-h-11 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const bouton = "min-h-11 rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900";
const principal = "min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900";

/**
 * Éditeur visuel des devis (moteur v2) : saisie à gauche, rendu RÉEL du document à droite.
 *
 * L'aperçu est construit à partir de l'état en cours avec exactement les mêmes fonctions que
 * l'impression, le PDF, le portail et l'e-mail. Un clic sur une ligne de l'aperçu ouvre sa saisie.
 * Raccourcis : Ctrl/⌘+K ajoute des articles, Ctrl/⌘+S enregistre.
 */
export function EditeurDevisV2({
  devisId,
  clients,
  chantiers,
  enteteInitiale,
  etatInitial,
  emetteur,
  style,
  filigranesEntreprise,
  logoDisponible,
  droits,
  seuilTauxMarquePct,
  nomProduit,
}: {
  devisId: string | null;
  clients: ClientEditeur[];
  chantiers: ChantierEditeur[];
  enteteInitiale: EnteteDevisV2;
  etatInitial: EtatElements;
  emetteur: IdentiteEmetteur;
  style: Partial<StyleDocument>;
  filigranesEntreprise: ReglagesFiligraneEntreprise | null;
  logoDisponible: boolean;
  droits: DroitsEditeur;
  seuilTauxMarquePct: number | null;
  nomProduit: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [entete, setEntete] = useState<EnteteDevisV2>(enteteInitiale);
  const [etat, setEtatBrut] = useState<EtatElements>(etatInitial);
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sale, setSale] = useState(false);
  const [onglet, setOnglet] = useState<"saisie" | "apercu">("saisie");
  const [surligne, setSurligne] = useState<string | null>(null);
  const [aujourdhui] = useState(() => new Date().toISOString().slice(0, 10));
  const genererCle = useCallback(() => crypto.randomUUID(), []);

  const setEtat = (suivant: EtatElements) => { setEtatBrut(suivant); setSale(true); };
  const majEntete = (patch: Partial<EnteteDevisV2>) => { setEntete((e) => ({ ...e, ...patch })); setSale(true); };

  const client = clients.find((c) => c.id === entete.client_id);
  const source: SourceDocument = useMemo(() => ({
    typeDocument: "devis",
    titre: "Devis",
    statut: "brouillon",
    numero: null,
    dateEmission: entete.date_emission ?? aujourdhui,
    dateSecondaire: entete.date_validite ? { libelle: "Valable jusqu’au", valeur: entete.date_validite } : null,
    emetteur,
    style,
    destinataire: {
      nomAffiche: client?.label ?? "Client à choisir",
      adresse: client?.adresse ?? null,
      codePostal: client?.codePostal ?? null,
      ville: client?.ville ?? null,
      siret: client?.siret ?? null,
    },
    elements: etat.elements,
    remiseGlobalePct: entete.remise_globale,
    totauxEnregistres: null,
    conditions: entete.conditions,
    notesClient: entete.notes_client,
    filigrane: resoudreFiligrane({ typeDocument: "devis", statut: "brouillon", document: entete.filigrane ?? undefined, entreprise: filigranesEntreprise }),
    duplicata: null,
    nomProduit,
  }), [entete, etat.elements, client, emetteur, style, filigranesEntreprise, nomProduit, aujourdhui]);

  const totaux = useMemo(() => totauxDevis(etat.elements, entete.remise_globale), [etat.elements, entete.remise_globale]);

  const enregistrer = useCallback(() => {
    const invalide = validerBrouillon({ clientId: entete.client_id, remiseGlobalePct: entete.remise_globale, elements: etat.elements });
    if (invalide) { setErreur(invalide); return; }
    setErreur(null);
    demarrer(async () => {
      const r = await enregistrerDevisV2Action(devisId, entete, etat.elements, etat.origines);
      if ("error" in r) { setErreur(r.error); return; }
      setSale(false);
      router.push(`/devis/${r.id}`);
    });
  }, [devisId, entete, etat, router]);

  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "k") { e.preventDefault(); setDialogue({ type: "articles" }); }
      if (e.key.toLowerCase() === "s") { e.preventDefault(); enregistrer(); }
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [enregistrer]);

  useEffect(() => {
    if (!sale) return;
    const avertir = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [sale]);

  /** Clic dans l'aperçu : ouvre la saisie de la ligne (ou de l'ouvrage qui la contient). */
  const choisirLigne = (cle: string) => {
    const nettoyee = cle.replace(/-annexes$/, "");
    const cible = etat.elements.find((e) =>
      cleElement(e) === nettoyee || (e.type === "ouvrage" && e.instance.lignes.some((l) => l.cle === nettoyee)));
    if (!cible) return;
    const id = cleElement(cible);
    setOnglet("saisie");
    setSurligne(id);
    setTimeout(() => {
      const carte = document.getElementById(`el-${id}`);
      carte?.scrollIntoView({ behavior: "smooth", block: "center" });
      carte?.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
    }, 50);
    setTimeout(() => setSurligne((s) => (s === id ? null : s)), 2500);
  };

  const chantiersClient = chantiers.filter((c) => !entete.client_id || c.clientId === entete.client_id);
  const tries = [...etat.elements].sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{devisId ? "Modifier le devis brouillon" : "Nouveau devis"}</h1>
        <span className="text-xs text-neutral-500" aria-live="polite">{enCours ? "Enregistrement…" : sale ? "Modifications non enregistrées" : ""}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={enregistrer} disabled={enCours} className={principal}>Enregistrer le brouillon</button>
        </div>
      </div>
      {erreur && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

      <div className="flex gap-2 lg:hidden" role="tablist" aria-label="Affichage">
        {(["saisie", "apercu"] as const).map((o) => (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={onglet === o}
            onClick={() => setOnglet(o)}
            // L'onglet choisi garde son fond sombre même survolé : sur mobile, le survol reste « collé »
            // après un toucher, et un fond clair sous un texte blanc le rendait illisible.
            className={onglet === o
              ? "min-h-11 flex-1 rounded-md border border-neutral-900 bg-neutral-900 px-3 text-sm font-medium text-white dark:border-white dark:bg-white dark:text-neutral-900"
              : `${bouton} flex-1`}
          >
            {o === "saisie" ? "Saisie" : "Aperçu du document"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={`${onglet === "saisie" ? "block" : "hidden"} space-y-4 lg:block`}>
          <fieldset className="grid gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-2 dark:border-neutral-800">
            <legend className="px-1 text-sm font-medium">Client et conditions</legend>
            <label className="flex flex-col gap-1 text-sm">
              Client
              <select value={entete.client_id} onChange={(e) => majEntete({ client_id: e.target.value, chantier_id: null })} className={champ}>
                <option value="">— Choisir un client —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Chantier (optionnel)
              <select value={entete.chantier_id ?? ""} onChange={(e) => majEntete({ chantier_id: e.target.value || null })} disabled={!entete.client_id} className={champ}>
                <option value="">— Sans chantier —</option>
                {chantiersClient.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Valable jusqu’au
              <input type="date" value={entete.date_validite ?? ""} onChange={(e) => majEntete({ date_validite: e.target.value || null })} className={champ} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Remise globale (%)
              <input type="number" min={0} max={100} step="any" value={entete.remise_globale} onChange={(e) => majEntete({ remise_globale: Number(e.target.value) })} className={champ} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Conditions (visibles par le client)
              <textarea rows={2} value={entete.conditions ?? ""} onChange={(e) => majEntete({ conditions: e.target.value || null })} className={`${champ} py-1`} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Notes pour le client
              <textarea rows={2} value={entete.notes_client ?? ""} onChange={(e) => majEntete({ notes_client: e.target.value || null })} className={`${champ} py-1`} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              Notes internes (jamais imprimées)
              <textarea rows={2} value={entete.notes_internes ?? ""} onChange={(e) => majEntete({ notes_internes: e.target.value || null })} className={`${champ} py-1`} />
            </label>
          </fieldset>

          <FiligraneSelecteur valeur={entete.filigrane} onChange={(f) => majEntete({ filigrane: f })} heritable logoDisponible={logoDisponible} legende="Filigrane de ce devis" />

          <div className="sticky top-0 z-10 flex flex-wrap gap-2 bg-white/90 py-2 backdrop-blur dark:bg-neutral-950/90">
            <button type="button" onClick={() => setDialogue({ type: "articles" })} className={principal}>Ajouter des articles <span className="opacity-60">Ctrl+K</span></button>
            <button type="button" onClick={() => setDialogue({ type: "ouvrage", instance: null })} className={bouton}>Insérer un ouvrage</button>
            <button type="button" onClick={() => setEtat(ajouterLigneLibre(etat, genererCle()))} className={bouton}>Ligne libre</button>
          </div>

          <ol className="space-y-3" aria-label="Lignes et ouvrages du devis">
            {tries.length === 0 && <li className="rounded-md border border-dashed p-4 text-sm text-neutral-500">Ajoutez des articles, un ouvrage ou une ligne libre.</li>}
            {tries.map((e, index) => (
              <li key={cleElement(e)} id={`el-${cleElement(e)}`} className={`rounded-md border p-3 ${surligne === cleElement(e) ? "border-blue-500 ring-2 ring-blue-300" : "border-neutral-200 dark:border-neutral-800"}`}>
                {e.type === "ligne" ? (
                  <CarteLigne
                    ligne={e.ligne}
                    origine={etat.origines[e.ligne.cle]}
                    droits={droits}
                    onChange={(patch) => setEtat(modifierLigneLibre(etat, e.ligne.cle, patch))}
                  />
                ) : (
                  <CarteOuvrage
                    instance={e.instance}
                    droits={droits}
                    seuilTauxMarquePct={seuilTauxMarquePct}
                    onChange={(instance) => setEtat(remplacerOuvrage(etat, instance))}
                    onModifier={() => setDialogue({ type: "ouvrage", instance: e.instance })}
                    onPrix={() => setDialogue({ type: "prix", instance: e.instance })}
                  />
                )}
                <div className="mt-2 flex gap-1">
                  <button type="button" disabled={index === 0} onClick={() => setEtat(deplacerElement(etat, cleElement(e), -1))} className={bouton} aria-label="Monter">↑</button>
                  <button type="button" disabled={index === tries.length - 1} onClick={() => setEtat(deplacerElement(etat, cleElement(e), 1))} className={bouton} aria-label="Descendre">↓</button>
                  <button type="button" onClick={() => setEtat(retirerElement(etat, cleElement(e)))} className={`${bouton} ml-auto text-red-700`}>Retirer</button>
                </div>
              </li>
            ))}
          </ol>

          <section aria-label="Totaux" className="space-y-1 rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
            {totaux.remiseGlobaleHt !== 0 && (
              <>
                <Ligne libelle="Sous-total HT" valeur={euros(totaux.sousTotalHt)} />
                <Ligne libelle={`Remise globale (${entete.remise_globale} %)`} valeur={`−${euros(totaux.remiseGlobaleHt)}`} />
              </>
            )}
            <Ligne libelle="Total HT" valeur={euros(totaux.totalHt)} />
            {totaux.ventilation.map((v) => <Ligne key={v.tauxTva} libelle={`TVA ${v.tauxTva} % sur ${euros(v.baseHt)}`} valeur={euros(v.montantTva)} />)}
            <Ligne libelle="Total TTC" valeur={euros(totaux.totalTtc)} fort />
          </section>
        </div>

        <div className={`${onglet === "apercu" ? "block" : "hidden"} lg:sticky lg:top-2 lg:block lg:h-[calc(100dvh-7rem)]`}>
          <div className="h-[75dvh] overflow-hidden rounded-md border border-neutral-200 lg:h-full dark:border-neutral-800">
            <ApercuDevisV2 source={source} onChoisirLigne={choisirLigne} />
          </div>
        </div>
      </div>

      {dialogue?.type === "articles" && (
        <SelectionArticlesDialog
          etat={etat}
          genererCle={genererCle}
          peutModifierPrix={droits.modifierPrix}
          peutModifierUnite={droits.modifierUnite}
          peutVoirCouts={droits.voirCouts}
          onFermer={() => setDialogue(null)}
          onApplique={(suivant, cles) => {
            setEtat(suivant);
            setDialogue(null);
            if (cles[0]) setTimeout(() => choisirLigne(cles[0]), 0);
          }}
        />
      )}
      {dialogue?.type === "ouvrage" && (
        <InsertionOuvrageDialog
          instanceInitiale={dialogue.instance}
          genererCle={genererCle}
          peutVoirCouts={droits.voirCouts}
          peutModifierPrix={droits.modifierPrix}
          seuilTauxMarquePct={seuilTauxMarquePct}
          onFermer={() => setDialogue(null)}
          onValider={(instance) => {
            setEtat(dialogue.instance ? remplacerOuvrage(etat, instance) : ajouterOuvrage(etat, instance));
            setDialogue(null);
          }}
        />
      )}
      {dialogue?.type === "prix" && (
        <PrixGlobalDialog
          instance={dialogue.instance}
          peutVoirCouts={droits.voirCouts}
          seuilTauxMarquePct={seuilTauxMarquePct}
          onFermer={() => setDialogue(null)}
          onValider={(instance) => { setEtat(remplacerOuvrage(etat, instance)); setDialogue(null); }}
        />
      )}
      <datalist id="unites-devis">{UNITES.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  );
}

function Ligne({ libelle, valeur, fort = false }: { libelle: string; valeur: string; fort?: boolean }) {
  return <div className={`flex justify-between gap-4 ${fort ? "font-semibold" : ""}`}><span className={fort ? "" : "text-neutral-500"}>{libelle}</span><span className="tabular-nums">{valeur}</span></div>;
}

function CarteLigne({
  ligne,
  origine,
  droits,
  onChange,
}: {
  ligne: LigneLibre;
  origine: EtatElements["origines"][string] | undefined;
  droits: DroitsEditeur;
  onChange: (patch: Partial<Omit<LigneLibre, "cle">>) => void;
}) {
  const ht = ligne.quantite * ligne.prixUnitaireHt * (1 - ligne.remiseLignePct / 100);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input aria-label="Désignation" placeholder="Désignation" value={ligne.designation} onChange={(e) => onChange({ designation: e.target.value })} className={`${champ} min-w-0 flex-1`} />
        <select aria-label="Type de ligne" value={ligne.type} onChange={(e) => onChange({ type: e.target.value as LigneLibre["type"] })} className={champ}>
          {LIGNE_TYPES.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
        </select>
      </div>
      {(origine?.referenceInterne || origine?.referenceFabricant) && (
        <p className="text-xs text-neutral-500">
          {origine.referenceInterne && <>Réf. interne <span className="font-mono">{origine.referenceInterne}</span></>}
          {origine.referenceFabricant && <> · réf. fabricant <span className="font-mono">{origine.referenceFabricant}</span></>}
          {droits.voirCouts && origine.prixAchatHt !== null && origine.prixAchatHt !== undefined && <> · achat {euros(origine.prixAchatHt)}</>}
        </p>
      )}
      <textarea aria-label="Description pour le client" rows={2} placeholder="Description pour le client" value={ligne.description ?? ""} onChange={(e) => onChange({ description: e.target.value || null })} className={`${champ} w-full py-1`} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="flex flex-col text-xs">Quantité<input type="number" step="any" value={ligne.quantite} onChange={(e) => onChange({ quantite: Number(e.target.value) })} className={champ} /></label>
        <label className="flex flex-col text-xs">Unité<input list="unites-devis" disabled={!droits.modifierUnite} value={ligne.unite} onChange={(e) => onChange({ unite: e.target.value })} className={champ} /></label>
        <label className="flex flex-col text-xs">PU HT<input type="number" step="any" disabled={!droits.modifierPrix} value={ligne.prixUnitaireHt} onChange={(e) => onChange({ prixUnitaireHt: Number(e.target.value) })} className={champ} /></label>
        <label className="flex flex-col text-xs">Remise %<input type="number" min={0} max={100} step="any" value={ligne.remiseLignePct} onChange={(e) => onChange({ remiseLignePct: Number(e.target.value) })} className={champ} /></label>
        <label className="flex flex-col text-xs">TVA
          <select value={ligne.tauxTva} onChange={(e) => onChange({ tauxTva: Number(e.target.value) })} className={champ}>
            {[...new Set([...TAUX_TVA_ADMIS, ligne.tauxTva])].map((t) => <option key={t} value={t}>{t} %</option>)}
          </select>
        </label>
      </div>
      <p className="text-right text-sm tabular-nums">{euros(Math.round(ht * 100) / 100)} HT</p>
    </div>
  );
}

function CarteOuvrage({
  instance,
  droits,
  seuilTauxMarquePct,
  onChange,
  onModifier,
  onPrix,
}: {
  instance: InstanceOuvrage;
  droits: DroitsEditeur;
  seuilTauxMarquePct: number | null;
  onChange: (instance: InstanceOuvrage) => void;
  onModifier: () => void;
  onPrix: () => void;
}) {
  const ind = indicateursPrix(instance);
  const alertes = avertissementsPrix(instance, { seuilTauxMarquePct })
    .filter((a) => droits.voirCouts || !["prix_inferieur_cout", "marge_sous_seuil", "cout_inconnu"].includes(a.code));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-neutral-100 px-1.5 font-mono text-xs dark:bg-neutral-800">{instance.referenceInterne ?? "ouvrage"} · v{instance.version}</span>
        <input aria-label="Libellé pour le client" value={instance.libelleClient} onChange={(e) => onChange({ ...instance, libelleClient: e.target.value })} className={`${champ} min-w-0 flex-1 font-medium`} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{instance.quantitePrincipale} {instance.unitePrincipale}</span>
        <label className="flex items-center gap-1">
          <span className="sr-only">Présentation client</span>
          <select value={instance.mode} onChange={(e) => onChange({ ...instance, mode: e.target.value as ModePresentation })} className={champ}>
            {MODES_PRESENTATION.map((m) => <option key={m.cle} value={m.cle}>{m.libelle}</option>)}
          </select>
        </label>
        <span className="ml-auto font-medium tabular-nums">{euros(ind.prixVenteRetenuHt)} HT</span>
      </div>
      {droits.voirCouts && (
        <p className="text-xs text-neutral-500">
          Coût {ind.coutAchatHt === null ? "incomplet" : euros(ind.coutAchatHt)} · marge {ind.margeHt === null ? "—" : euros(ind.margeHt)} · marque {ind.tauxMarquePct ?? "—"} %
        </p>
      )}
      {alertes.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {alertes.map((a, i) => <li key={i} className={a.gravite === "attention" ? "text-amber-800" : "text-neutral-500"}>{a.message}</li>)}
        </ul>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm">{instance.lignes.length} composants</summary>
        <ul className="space-y-1 text-xs">
          {instance.lignes.map((l) => (
            <li key={l.cle} className="flex justify-between gap-2">
              <span>{l.designation}{!l.visibleClient ? " (interne)" : ""}</span>
              <span className="tabular-nums">{l.quantite} {l.unite} × {euros(l.prixVenteHt)}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onModifier} className={bouton}>Modifier l’ouvrage</button>
        <button type="button" onClick={onPrix} className={bouton}>Prix global…</button>
      </div>
    </div>
  );
}
