"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { euros, LIGNE_TYPES, UNITES } from "@/lib/devis";
import { enregistrerDevisV2Action } from "@/app/actions/devis-v2";
import { ApercuDevisV2 } from "@/components/devis/ApercuDevisV2";
import { GrilleDevis } from "@/components/devis/GrilleDevis";
import { basculerColonne, CLE_STOCKAGE_COLONNES, colonnesReglables, colonnesVisibles, lireReglagesColonnes, reglagesParDefaut, type ReglagesColonnes } from "@/lib/devis/colonnes-grille";
import { annuler, creerHistorique, peutAnnuler, peutRetablir, pousser, remplacerPresent, retablir } from "@/lib/devis/historique-edition";
import { insererLigne, insererOuvrage } from "@/lib/devis/editeur-etat";
import { margeLigne } from "@/lib/devis/marge-ligne";
import { lignesMontants } from "@/lib/devis/presentation";
import { libelleTypeLigne, typeDe, TYPES_LIGNE_GRILLE, type TypeLigneGrille } from "@/lib/devis/types-ligne";
import { InsertionOuvrageDialog } from "@/components/devis/InsertionOuvrageDialog";
import { PrixGlobalDialog } from "@/components/devis/PrixGlobalDialog";
import { SelectionArticlesDialog } from "@/components/devis/SelectionArticlesDialog";
import { FiligraneSelecteur } from "@/components/documents/FiligraneSelecteur";
import type { IdentiteEmetteur, SourceDocument, StyleDocument } from "@/lib/devis/document-modele";
import {
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
import type { InstanceOuvrage } from "@/lib/devis/ouvrages";
import { totauxDevis, type LigneLibre } from "@/lib/devis/presentation";
import { indicateursPrix, TAUX_TVA_ADMIS } from "@/lib/devis/prix";

export type ClientEditeur = { id: string; label: string; adresse: string | null; codePostal: string | null; ville: string | null; siret: string | null };
export type ChantierEditeur = { id: string; label: string; clientId: string | null };
export type DroitsEditeur = { voirCouts: boolean; gererCouts: boolean; modifierPrix: boolean; modifierUnite: boolean; modifierRemise: boolean };

type Dialogue = null | { type: "articles" } | { type: "ouvrage"; instance: InstanceOuvrage | null; apresCle?: string | null } | { type: "prix"; instance: InstanceOuvrage } | { type: "colonnes" } | { type: "ligne_mobile"; cle: string };
type Instantane = { entete: EnteteDevisV2; etat: EtatElements };
type Sauvegarde = { statut: "ok"; heure: string } | { statut: "en_cours" } | { statut: "erreur"; message: string; conflit: boolean } | { statut: "hors_ligne" } | { statut: "jamais" };

const DELAI_AUTOSAUVEGARDE_MS = 2000;

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
  revisionInitiale = null,
  commerciaux = [],
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
  /** Révision lue en base (verrou optimiste de l'autosauvegarde) ; `null` pour un nouveau devis. */
  revisionInitiale?: number | null;
  commerciaux?: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  // Historique annuler / rétablir : l'état courant est `historique.present`.
  const [historique, setHistorique] = useState(() => creerHistorique<Instantane>({ entete: enteteInitiale, etat: etatInitial }));
  const { entete, etat } = historique.present;
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sale, setSale] = useState(false);
  const [onglet, setOnglet] = useState<"saisie" | "apercu">("saisie");
  // Grand écran : l'aperçu A4 occupe la moitié de la largeur ; le masquer rend toute la largeur à la
  // grille (14 colonnes possibles), comme dans un logiciel de devis de bureau. Réglage de session.
  const [apercuVisible, setApercuVisible] = useState(true);
  const [surligne, setSurligne] = useState<string | null>(null);
  const [aujourdhui] = useState(() => new Date().toISOString().slice(0, 10));
  const [devisIdCourant, setDevisIdCourant] = useState(devisId);
  const [revision, setRevision] = useState<number | null>(revisionInitiale);
  const [sauvegarde, setSauvegarde] = useState<Sauvegarde>({ statut: "jamais" });
  const [reglagesColonnes, setReglagesColonnes] = useState<ReglagesColonnes>(reglagesParDefaut);
  const enteteAvantFocus = useRef<EnteteDevisV2 | null>(null);
  const genererCle = useCallback(() => crypto.randomUUID(), []);

  // Réglage des colonnes : commodité locale, lue avec indulgence (voir colonnes-grille.ts).
  useEffect(() => {
    // Après hydratation seulement : le serveur ne connaît pas le réglage local.
    const t = window.setTimeout(() => {
      try { const brut = window.localStorage.getItem(CLE_STOCKAGE_COLONNES); if (brut) setReglagesColonnes(lireReglagesColonnes(brut)); } catch { /* stockage indisponible : réglage par défaut */ }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const changerColonnes = (r: ReglagesColonnes) => {
    setReglagesColonnes(r);
    try { window.localStorage.setItem(CLE_STOCKAGE_COLONNES, JSON.stringify(r)); } catch { /* idem */ }
  };
  const colonnes = useMemo(() => colonnesVisibles(reglagesColonnes, droits), [reglagesColonnes, droits]);

  const setEtat = (suivant: EtatElements) => { setHistorique((h) => pousser(h, { entete: h.present.entete, etat: suivant })); setSale(true); };
  // L'en-tête se modifie sans entrée d'historique à chaque frappe ; une entrée est poussée à la sortie du champ.
  const majEntete = (patch: Partial<EnteteDevisV2>) => { setHistorique((h) => remplacerPresent(h, { ...h.present, entete: { ...h.present.entete, ...patch } })); setSale(true); };
  const focusEntete = () => { enteteAvantFocus.current = entete; };
  const blurEntete = () => {
    const avant = enteteAvantFocus.current;
    enteteAvantFocus.current = null;
    if (avant && avant !== entete) setHistorique((h) => pousser(remplacerPresent(h, { ...h.present, entete: avant }), { ...h.present }));
  };
  const annulerEdition = useCallback(() => { setHistorique((h) => { if (!peutAnnuler(h)) return h; setSale(true); return annuler(h); }); }, []);
  const retablirEdition = useCallback(() => { setHistorique((h) => { if (!peutRetablir(h)) return h; setSale(true); return retablir(h); }); }, []);

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

  /**
   * Enregistre (autosauvegarde silencieuse ou action explicite). Verrou optimiste : la révision lue est
   * envoyée ; un conflit arrête l'autosauvegarde jusqu'au rechargement, sans jamais écraser l'autre saisie.
   * Un nouveau devis reçoit son identifiant au premier enregistrement ; l'adresse suit sans navigation.
   */
  const enregistrer = useCallback((o: { explicite: boolean }) => {
    const invalide = validerBrouillon({ clientId: entete.client_id, remiseGlobalePct: entete.remise_globale, elements: etat.elements });
    if (invalide) { if (o.explicite) setErreur(invalide); return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setSauvegarde({ statut: "hors_ligne" }); return; }
    setErreur(null);
    setSauvegarde({ statut: "en_cours" });
    demarrer(async () => {
      const r = await enregistrerDevisV2Action(devisIdCourant, entete, etat.elements, etat.origines, revision);
      if ("error" in r) {
        setSauvegarde({ statut: "erreur", message: r.error, conflit: r.conflit === true });
        if (o.explicite || r.conflit) setErreur(r.error);
        return;
      }
      setRevision(r.revision);
      setSale(false);
      setSauvegarde({ statut: "ok", heure: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) });
      if (!devisIdCourant) {
        setDevisIdCourant(r.id);
        // L'adresse garde la route « nouveau » : changer de chemin (`/devis/<id>/modifier`) ferait
        // re-rendre la page « modifier » à la prochaine action serveur (l'arbre du routeur ne correspond
        // plus à l'URL) et perdrait l'état local — dialogue ouvert, saisie en cours (constaté en
        // recette preview). L'identifiant voyage dans le fragment, relu au rechargement ci-dessous.
        try { window.history.replaceState(null, "", `/devis/nouveau#devis=${r.id}`); } catch { /* sans importance */ }
      }
      if (o.explicite) router.push(`/devis/${r.id}`);
    });
  }, [devisIdCourant, entete, etat, revision, router]);

  // Autosauvegarde : après une pause de saisie, tant qu'aucun conflit n'est en cours.
  useEffect(() => {
    if (!sale || enCours || (sauvegarde.statut === "erreur" && sauvegarde.conflit)) return;
    const t = window.setTimeout(() => enregistrer({ explicite: false }), DELAI_AUTOSAUVEGARDE_MS);
    return () => window.clearTimeout(t);
  }, [sale, enCours, sauvegarde, enregistrer]);

  // Rechargement de « nouveau » après une première autosauvegarde : le brouillon existe déjà, on l'ouvre.
  useEffect(() => {
    if (devisId) return;
    const m = /^#devis=([0-9a-f-]{36})$/.exec(window.location.hash);
    if (m) router.replace(`/devis/${m[1]}/modifier`);
  }, [devisId, router]);

  // La palette de recherche globale cède Ctrl+K à l'éditeur (elle répond alors à Ctrl+Maj+K).
  useEffect(() => {
    document.body.dataset.editeurDevis = "1";
    return () => { delete document.body.dataset.editeurDevis; };
  }, []);

  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k" && !e.shiftKey) { e.preventDefault(); setDialogue({ type: "articles" }); }
      if (k === "s") { e.preventDefault(); enregistrer({ explicite: true }); }
      if (k === "z" && !e.shiftKey) { e.preventDefault(); annulerEdition(); }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); retablirEdition(); }
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [enregistrer, annulerEdition, retablirEdition]);

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
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches && cible.type === "ligne") setDialogue({ type: "ligne_mobile", cle: id });
    setTimeout(() => setSurligne((s) => (s === id ? null : s)), 800);
  };

  const chantiersClient = chantiers.filter((c) => !entete.client_id || c.clientId === entete.client_id);
  const tries = [...etat.elements].sort((a, b) => a.ordre - b.ordre);
  const rentabilite = useMemo(() => {
    if (!droits.voirCouts) return null;
    let cout = 0; let inconnu = false;
    for (const e of tries) {
      if (e.type === "ligne") {
        const t = typeDe(e.ligne);
        if (t !== "article" && t !== "libre") continue;
        const m = margeLigne(e.ligne, etat.origines[e.ligne.cle]);
        if (m.coutHt === null) inconnu = true; else cout += m.coutHt;
      } else {
        for (const l of e.instance.lignes) { if (l.origine === "ajustement") continue; if (l.prixAchatHt === null) inconnu = true; else cout += l.prixAchatHt * l.quantite; }
      }
    }
    cout = Math.round(cout * 100) / 100;
    const marge = Math.round((totaux.totalHt - cout) * 100) / 100;
    return { cout, inconnu, marge, tauxMarquePct: totaux.totalHt ? Math.round((marge / totaux.totalHt) * 1000) / 10 : null };
  }, [tries, etat.origines, droits.voirCouts, totaux.totalHt]);
  void lignesMontants;
  const ligneMobile = dialogue?.type === "ligne_mobile" ? tries.find((e) => e.type === "ligne" && e.ligne.cle === dialogue.cle) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{devisIdCourant ? "Devis brouillon" : "Nouveau devis"}</h1>
        <span className="text-xs text-neutral-500" aria-live="polite" data-sauvegarde={sauvegarde.statut}>
          {sauvegarde.statut === "en_cours" ? "Enregistrement…"
            : sauvegarde.statut === "hors_ligne" ? "Hors ligne — modifications conservées ici, enregistrement au retour du réseau"
            : sauvegarde.statut === "erreur" ? (sauvegarde.conflit ? "Conflit : rechargez le devis" : "Enregistrement impossible")
            : sale ? "Modifications non enregistrées" : sauvegarde.statut === "ok" ? `Enregistré à ${sauvegarde.heure}` : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={annulerEdition} disabled={!peutAnnuler(historique)} className={bouton} title="Annuler (Ctrl+Z)" aria-label="Annuler">↶</button>
          <button type="button" onClick={retablirEdition} disabled={!peutRetablir(historique)} className={bouton} title="Rétablir (Ctrl+Y)" aria-label="Rétablir">↷</button>
          <button type="button" onClick={() => enregistrer({ explicite: true })} disabled={enCours} className={principal} title="Ctrl+S">Enregistrer et fermer</button>
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

      <div className={`grid gap-4 ${apercuVisible ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)]"}`}>
        <div className={`${onglet === "saisie" ? "block" : "hidden"} space-y-4 lg:block`}>
          <fieldset className="grid gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-neutral-800" onFocus={focusEntete} onBlur={blurEntete}>
            <legend className="px-1 text-sm font-medium">En-tête du devis</legend>
            <label className="flex flex-col gap-1 text-sm">
              Référence d’affaire
              <input value={entete.reference_interne ?? ""} maxLength={120} onChange={(e) => majEntete({ reference_interne: e.target.value || null })} className={champ} placeholder="Interne, non imprimée" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Référence client
              <input value={entete.reference_client ?? ""} maxLength={120} onChange={(e) => majEntete({ reference_client: e.target.value || null })} className={champ} placeholder="Bon de commande, dossier…" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Commercial
              <select value={entete.commercial_employe_id ?? ""} onChange={(e) => majEntete({ commercial_employe_id: e.target.value || null })} className={champ}>
                <option value="">—</option>
                {commerciaux.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
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
              Date du devis
              <input type="date" value={entete.date_emission ?? aujourdhui} onChange={(e) => majEntete({ date_emission: e.target.value || null })} className={champ} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Valable jusqu’au
              <input type="date" value={entete.date_validite ?? ""} onChange={(e) => majEntete({ date_validite: e.target.value || null })} className={champ} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Mode de règlement
              <input value={entete.mode_reglement ?? ""} maxLength={60} list="modes-reglement" onChange={(e) => majEntete({ mode_reglement: e.target.value || null })} className={champ} />
              <datalist id="modes-reglement"><option value="Virement" /><option value="Chèque" /><option value="Carte bancaire" /><option value="Espèces" /><option value="Prélèvement" /></datalist>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Conditions de paiement
              <input value={entete.conditions_paiement ?? ""} maxLength={500} onChange={(e) => majEntete({ conditions_paiement: e.target.value || null })} className={champ} placeholder="ex. 30 % à la commande, solde à réception" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Remise globale (%)
              <input type="number" min={0} max={100} step="any" value={entete.remise_globale} disabled={!droits.modifierRemise} title={droits.modifierRemise ? undefined : "Votre poste ne permet pas d’accorder des remises."} onChange={(e) => majEntete({ remise_globale: Number(e.target.value) })} className={champ} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
              Conditions (visibles par le client)
              <textarea rows={2} value={entete.conditions ?? ""} onChange={(e) => majEntete({ conditions: e.target.value || null })} className={`${champ} py-1`} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
              Notes pour le client
              <textarea rows={2} value={entete.notes_client ?? ""} onChange={(e) => majEntete({ notes_client: e.target.value || null })} className={`${champ} py-1`} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
              Notes internes (jamais imprimées)
              <textarea rows={2} value={entete.notes_internes ?? ""} onChange={(e) => majEntete({ notes_internes: e.target.value || null })} className={`${champ} py-1`} />
            </label>
          </fieldset>

          <FiligraneSelecteur valeur={entete.filigrane} onChange={(f) => majEntete({ filigrane: f })} heritable logoDisponible={logoDisponible} legende="Filigrane de ce devis" />

          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-white/90 py-2 backdrop-blur dark:bg-neutral-950/90" role="toolbar" aria-label="Lignes">
            <button type="button" onClick={() => setDialogue({ type: "articles" })} className={principal} title="Ctrl+K">Articles <span className="opacity-60">Ctrl+K</span></button>
            <button type="button" onClick={() => setDialogue({ type: "ouvrage", instance: null, apresCle: null })} className={bouton} title="Ouvrage composé de la bibliothèque">Ouvrage</button>
            <button type="button" onClick={() => setEtat(insererLigne(etat, genererCle(), "libre", null))} className={bouton} title="Entrée en bas de grille">Ligne libre</button>
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">Insérer une ligne de structure</span>
              <select value="" onChange={(e) => { const t = e.target.value as TypeLigneGrille; if (t) setEtat(insererLigne(etat, genererCle(), t, null)); }} className={champ} aria-label="Insérer">
                <option value="">Insérer…</option>
                {TYPES_LIGNE_GRILLE.filter((t) => !t.chiffree).map((t) => <option key={t.cle} value={t.cle} title={t.aide}>{t.libelle}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setDialogue({ type: "colonnes" })} className={`${bouton} ml-auto`} title="Choisir les colonnes affichées">Colonnes…</button>
            <button type="button" onClick={() => setApercuVisible((v) => !v)} aria-pressed={apercuVisible} className={`${bouton} hidden lg:inline-flex lg:items-center`} title={apercuVisible ? "Masquer l’aperçu A4 : la grille prend toute la largeur" : "Afficher l’aperçu A4 à côté de la grille"}>
              {apercuVisible ? "Masquer l’aperçu" : "Afficher l’aperçu"}
            </button>
          </div>

          <div className="hidden lg:block">
            <GrilleDevis
              etat={etat}
              colonnes={colonnes}
              droits={droits}
              seuilTauxMarquePct={seuilTauxMarquePct}
              ligneCiblee={surligne}
              actions={{
                setEtat,
                genererCle,
                ouvrirOuvrage: (instance, apresCle) => setDialogue({ type: "ouvrage", instance, apresCle }),
                prixGlobal: (instance) => setDialogue({ type: "prix", instance }),
              }}
            />
          </div>

          {/* Téléphone et tablette : liste des lignes, saisie d'une ligne en plein écran. */}
          <ol className="space-y-1 lg:hidden" aria-label="Lignes du devis">
            {tries.length === 0 && <li className="rounded-md border border-dashed p-4 text-sm text-neutral-500">Ajoutez des articles, un ouvrage ou une ligne libre.</li>}
            {tries.map((e) => (
              <li key={cleElement(e)} id={`el-${cleElement(e)}`} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm ${surligne === cleElement(e) ? "border-blue-500" : "border-neutral-200 dark:border-neutral-800"}`}>
                {e.type === "ligne" ? (
                  <button type="button" className="flex min-h-11 flex-1 items-center justify-between gap-2 text-left" onClick={() => setDialogue({ type: "ligne_mobile", cle: e.ligne.cle })}>
                    <span className="min-w-0 truncate">{typeDe(e.ligne) === "libre" || typeDe(e.ligne) === "article" ? e.ligne.designation || "(sans désignation)" : `${libelleTypeLigne(typeDe(e.ligne))}${e.ligne.designation ? ` — ${e.ligne.designation}` : ""}`}</span>
                    <span className="shrink-0 tabular-nums text-neutral-500">{typeDe(e.ligne) === "article" || typeDe(e.ligne) === "libre" || typeDe(e.ligne) === "remise" ? euros(e.ligne.quantite * e.ligne.prixUnitaireHt * (1 - e.ligne.remiseLignePct / 100)) : ""}</span>
                  </button>
                ) : (
                  <button type="button" className="flex min-h-11 flex-1 items-center justify-between gap-2 text-left" onClick={() => setDialogue({ type: "ouvrage", instance: e.instance })}>
                    <span className="min-w-0 truncate">{e.instance.libelleClient}</span>
                    <span className="shrink-0 tabular-nums text-neutral-500">{euros(indicateursPrix(e.instance).prixVenteRetenuHt)}</span>
                  </button>
                )}
                <button type="button" onClick={() => setEtat(deplacerElement(etat, cleElement(e), -1))} className="min-h-11 min-w-11 text-neutral-500" aria-label="Monter">↑</button>
                <button type="button" onClick={() => setEtat(deplacerElement(etat, cleElement(e), 1))} className="min-h-11 min-w-11 text-neutral-500" aria-label="Descendre">↓</button>
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
            {rentabilite && (
              <div className="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-800" aria-label="Rentabilité (interne)">
                <Ligne libelle={`Coût d’achat et main-d’œuvre${rentabilite.inconnu ? " (incomplet)" : ""}`} valeur={euros(rentabilite.cout)} />
                <Ligne libelle="Marge HT" valeur={euros(rentabilite.marge)} />
                <Ligne libelle="Taux de marque" valeur={rentabilite.tauxMarquePct === null ? "—" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(rentabilite.tauxMarquePct)} %`} />
              </div>
            )}
          </section>
        </div>

        <div className={`${onglet === "apercu" ? "block" : "hidden"} lg:sticky lg:top-2 ${apercuVisible ? "lg:block" : "lg:hidden"} lg:h-[calc(100dvh-7rem)]`}>
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
            setEtat(dialogue.instance ? remplacerOuvrage(etat, instance) : dialogue.apresCle ? insererOuvrage(etat, instance, dialogue.apresCle) : ajouterOuvrage(etat, instance));
            setDialogue(null);
          }}
        />
      )}
      {dialogue?.type === "colonnes" && (
        <ColonnesDialog reglages={reglagesColonnes} droits={droits} onChange={changerColonnes} onFermer={() => setDialogue(null)} />
      )}
      {dialogue?.type === "ligne_mobile" && ligneMobile?.type === "ligne" && (
        <LigneMobileDialog
          ligne={ligneMobile.ligne}
          origine={etat.origines[ligneMobile.ligne.cle]}
          droits={droits}
          onChange={(patch) => setEtat(modifierLigneLibre(etat, ligneMobile.ligne.cle, patch))}
          onRetirer={() => { setEtat(retirerElement(etat, ligneMobile.ligne.cle)); setDialogue(null); }}
          onFermer={() => setDialogue(null)}
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

function ColonnesDialog({ reglages, droits, onChange, onFermer }: { reglages: ReglagesColonnes; droits: DroitsEditeur; onChange: (r: ReglagesColonnes) => void; onFermer: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onFermer} aria-labelledby="colonnes-titre" className="w-[min(92vw,26rem)] rounded-md border border-neutral-200 p-0 backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="space-y-3 p-4">
        <h2 id="colonnes-titre" className="text-base font-semibold">Colonnes de la grille</h2>
        <p className="text-xs text-neutral-500">Réglage propre à ce navigateur. Les colonnes de coût n’existent que pour les personnes autorisées à voir les coûts.</p>
        <ul className="grid grid-cols-2 gap-1">
          {colonnesReglables(droits).map((c) => (
            <li key={c.cle}>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={reglages.visibles.includes(c.cle)} onChange={() => onChange(basculerColonne(reglages, c.cle))} />
                {c.libelle}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex justify-between">
          <button type="button" className={bouton} onClick={() => onChange(reglagesParDefaut())}>Réglage par défaut</button>
          <button type="button" className={principal} onClick={() => ref.current?.close()}>Fermer</button>
        </div>
      </div>
    </dialog>
  );
}

/** Saisie d'une ligne en plein écran (téléphone, tablette) : les mêmes champs que la grille, empilés. */
function LigneMobileDialog({ ligne, origine, droits, onChange, onRetirer, onFermer }: {
  ligne: LigneLibre; origine: EtatElements["origines"][string] | undefined; droits: DroitsEditeur;
  onChange: (patch: Partial<Omit<LigneLibre, "cle">>) => void; onRetirer: () => void; onFermer: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const type = typeDe(ligne);
  return (
    <dialog ref={ref} onClose={onFermer} aria-label="Ligne du devis" className="h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none p-0 sm:h-auto sm:max-h-[90dvh] sm:w-[min(92vw,34rem)] sm:rounded-md backdrop:bg-black/40 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <label className="flex items-center gap-2 text-sm">
            Type
            <select value={type} onChange={(e) => onChange({ typeLigne: e.target.value as TypeLigneGrille })} className={champ}>
              {TYPES_LIGNE_GRILLE.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => ref.current?.close()} className="ml-auto min-h-11 min-w-11 rounded-md text-xl" aria-label="Fermer">×</button>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {type === "article" || type === "libre" ? (
            <CarteLigne ligne={ligne} origine={origine} droits={droits} onChange={onChange} />
          ) : type === "remise" ? (
            <div className="space-y-2">
              <input aria-label="Désignation" value={ligne.designation} onChange={(e) => onChange({ designation: e.target.value })} className={`${champ} w-full`} />
              <label className="flex flex-col text-xs">Pourcentage de la section (vide : montant fixe)
                <input inputMode="decimal" value={ligne.remiseSectionPct ?? ""} onChange={(e) => onChange({ remiseSectionPct: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} className={champ} /></label>
              <label className="flex flex-col text-xs">Montant HT (négatif)
                <input inputMode="decimal" value={ligne.prixUnitaireHt} disabled={ligne.remiseSectionPct !== null && ligne.remiseSectionPct !== undefined} onChange={(e) => onChange({ prixUnitaireHt: -Math.abs(Number(e.target.value.replace(",", ".")) || 0) })} className={champ} /></label>
            </div>
          ) : type === "vide" || type === "separateur" || type === "saut_page" ? (
            <p className="text-sm text-neutral-500">{libelleTypeLigne(type)} : aucune saisie.</p>
          ) : (
            <div className="space-y-2">
              <input aria-label="Texte" value={ligne.designation} onChange={(e) => onChange({ designation: e.target.value })} className={`${champ} w-full`} />
              {type !== "sous_total" && <textarea aria-label="Description" rows={3} value={ligne.description ?? ""} onChange={(e) => onChange({ description: e.target.value || null })} className={`${champ} w-full py-1`} />}
            </div>
          )}
          <label className="mt-3 flex flex-col text-xs">Commentaire interne (jamais imprimé)
            <textarea rows={2} value={ligne.commentaireInterne ?? ""} onChange={(e) => onChange({ commentaireInterne: e.target.value || null })} className={`${champ} w-full py-1`} /></label>
        </div>
        <footer className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <button type="button" onClick={onRetirer} className={`${bouton} text-red-700`}>Retirer</button>
          <button type="button" onClick={() => ref.current?.close()} className={`${principal} ml-auto`}>Terminé</button>
        </footer>
      </div>
    </dialog>
  );
}
