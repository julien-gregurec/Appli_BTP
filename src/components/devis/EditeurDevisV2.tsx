"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { euros, LIGNE_TYPES } from "@/lib/devis";
import { UNITES_METIER } from "@/lib/unites";
import { enregistrerDevisV2Action } from "@/app/actions/devis-v2";
import { ApercuDevisV2 } from "@/components/devis/ApercuDevisV2";
import { GrilleDevis, type SelectionGrille } from "@/components/devis/GrilleDevis";
import { CLE_STOCKAGE_PRESSE_PAPIER, collerElements, copierElements, libelleCollage, libelleCopie, lirePressePapier, messageRefus, ressembleAPressePapier, serialiserPressePapier, type PositionCollage } from "@/lib/devis/presse-papier";
import { basculerColonne, CLE_STOCKAGE_COLONNES, colonnesReglables, colonnesVisibles, lireReglagesColonnes, reglagesParDefaut, type ReglagesColonnes } from "@/lib/devis/colonnes-grille";
import { annuler, creerHistorique, peutAnnuler, peutRetablir, pousser, remplacerPresent, retablir } from "@/lib/devis/historique-edition";
import { insererLigne, insererOuvrage, interpreterRemisePct } from "@/lib/devis/editeur-etat";
import { margeLigne } from "@/lib/devis/marge-ligne";
import { lignesMontants } from "@/lib/devis/presentation";
import { libelleTypeLigne, typeDe, TYPES_LIGNE_GRILLE, type TypeLigneGrille } from "@/lib/devis/types-ligne";
import { InsertionOuvrageDialog } from "@/components/devis/InsertionOuvrageDialog";
import { PrixGlobalDialog } from "@/components/devis/PrixGlobalDialog";
import { SelectionArticlesDialog } from "@/components/devis/SelectionArticlesDialog";
import { ChantierRapideDialog, ClientRapideDialog } from "@/components/devis/TiersRapideDialogs";
import { BarreFormatage } from "@/components/devis/BarreFormatage";
import { demanderNavigation, GardeModifications } from "@/components/GardeModifications";
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

type Dialogue = null | { type: "articles" } | { type: "ouvrage"; instance: InstanceOuvrage | null; apresCle?: string | null } | { type: "prix"; instance: InstanceOuvrage } | { type: "colonnes" } | { type: "ligne_mobile"; cle: string } | { type: "client" } | { type: "chantier" };
type Instantane = { entete: EnteteDevisV2; etat: EtatElements };
type Sauvegarde = { statut: "ok"; heure: string } | { statut: "en_cours" } | { statut: "erreur"; message: string; conflit: boolean } | { statut: "hors_ligne" } | { statut: "jamais" };
/** Une modification efface une erreur d'enregistrement simple (pas un conflit) : l'autosauvegarde réessaie alors. */
const effacerErreurSimple = (s: Sauvegarde): Sauvegarde => (s.statut === "erreur" && !s.conflit ? { statut: "jamais" } : s);

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
  entrepriseId,
}: {
  devisId: string | null;
  /** Entreprise du devis : marque le presse-papier de lignes, dont le collage est refusé ailleurs. */
  entrepriseId: string;
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
  // Grand écran : la grille (14 colonnes possibles) prend toute la largeur par défaut, comme dans un
  // logiciel de devis de bureau ; l'aperçu A4 s'ouvre à la demande, à côté de la grille (décision de
  // Julien, recette preview 2026-09-13). Réglage de session.
  const [apercuVisible, setApercuVisible] = useState(false);
  const [surligne, setSurligne] = useState<string | null>(null);
  const [aujourdhui] = useState(() => new Date().toISOString().slice(0, 10));
  const [devisIdCourant, setDevisIdCourant] = useState(devisId);
  const [revision, setRevision] = useState<number | null>(revisionInitiale);
  const [sauvegarde, setSauvegarde] = useState<Sauvegarde>({ statut: "jamais" });
  const [reglagesColonnes, setReglagesColonnes] = useState<ReglagesColonnes>(reglagesParDefaut);
  // Presse-papier de lignes : sélection (tenue ici pour les boutons et la liste mobile), retour utilisateur.
  const [selection, setSelection] = useState<SelectionGrille>({ cles: [], ancre: null });
  const [ligneActive, setLigneActive] = useState<string | null>(null);
  const [positionCollage, setPositionCollage] = useState<"apres" | "avant" | "fin">("apres");
  const [retourPressePapier, setRetourPressePapier] = useState<{ genre: "copie" | "collage" | "erreur" | "info"; texte: string } | null>(null);
  // Tiers créés depuis le devis (client, chantier) : listes locales enrichies sans rechargement, brouillon conservé.
  const [clientsListe, setClientsListe] = useState(clients);
  const [chantiersListe, setChantiersListe] = useState(chantiers);
  const clientCourant = clientsListe.find((c) => c.id === entete.client_id) ?? null;
  const enteteAvantFocus = useRef<EnteteDevisV2 | null>(null);
  const genererCle = useCallback(() => crypto.randomUUID(), []);
  /** Message d'erreur de saisie (remise hors bornes, montant illisible…), dans la zone de retour de l'éditeur. */
  const signaler = useCallback((texte: string) => setRetourPressePapier({ genre: "erreur", texte }), []);

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

  // Un état complet ou, de préférence, une fonction de l'état le plus récent : la validation différée d'une
  // cellule (120 ms après le blur) ne doit jamais écraser un collage, une duplication ou une insertion
  // survenus entre-temps (constaté en recette preview : lignes collées « perdues » à l'enregistrement).
  const setEtat = useCallback((suivant: EtatElements | ((etat: EtatElements) => EtatElements)) => {
    setHistorique((h) => pousser(h, { entete: h.present.entete, etat: typeof suivant === "function" ? suivant(h.present.etat) : suivant }));
    setSale(true);
    setSauvegarde(effacerErreurSimple);
  }, []);
  // L'en-tête se modifie sans entrée d'historique à chaque frappe ; une entrée est poussée à la sortie du champ.
  const majEntete = (patch: Partial<EnteteDevisV2>) => { setHistorique((h) => remplacerPresent(h, { ...h.present, entete: { ...h.present.entete, ...patch } })); setSale(true); setSauvegarde(effacerErreurSimple); };
  const focusEntete = () => { enteteAvantFocus.current = entete; };
  const blurEntete = () => {
    const avant = enteteAvantFocus.current;
    enteteAvantFocus.current = null;
    if (avant && avant !== entete) setHistorique((h) => pousser(remplacerPresent(h, { ...h.present, entete: avant }), { ...h.present }));
  };
  const annulerEdition = useCallback(() => { setHistorique((h) => { if (!peutAnnuler(h)) return h; setSale(true); setSauvegarde(effacerErreurSimple); return annuler(h); }); }, []);
  const retablirEdition = useCallback(() => { setHistorique((h) => { if (!peutRetablir(h)) return h; setSale(true); setSauvegarde(effacerErreurSimple); return retablir(h); }); }, []);

  /** Copie des lignes : presse-papier structuré, repli local (autres onglets) ; rend le texte pour le presse-papier système. */
  const copierLignes = useCallback((cles: readonly string[]): string | null => {
    if (!cles.length) return null;
    const payload = copierElements(etat, cles, { entrepriseId, voirCouts: droits.voirCouts });
    if (!payload.elements.length) return null;
    const texte = serialiserPressePapier(payload);
    try { localStorage.setItem(CLE_STOCKAGE_PRESSE_PAPIER, texte); } catch { /* stockage indisponible */ }
    setRetourPressePapier({ genre: "copie", texte: libelleCopie(payload.elements.length) });
    return texte;
  }, [etat, entrepriseId, droits.voirCouts]);
  /** Colle un presse-papier (validé strictement) à la position demandée ; refuse une autre entreprise. */
  const collerLignes = useCallback((texte: string, apresCle: string | null, ou: "apres" | "avant" | "fin" = "apres"): { ok: boolean; texte?: boolean } => {
    const lu = lirePressePapier(texte, { entrepriseId, voirCouts: droits.voirCouts });
    if (!lu.ok) {
      if (lu.motif === "format") { if (!texte) setRetourPressePapier({ genre: "erreur", texte: "Aucune ligne de devis dans le presse-papier. Copiez d’abord des lignes (Ctrl+C sur une sélection)." }); return { ok: false, texte: true }; }
      setRetourPressePapier({ genre: "erreur", texte: messageRefus(lu.motif) });
      return { ok: false };
    }
    const position: PositionCollage = ou === "fin" || !apresCle ? { type: "fin" } : ou === "avant" ? { type: "avant", cle: apresCle } : { type: "apres", cle: apresCle };
    // Les clés sont tirées une fois (retour et sélection immédiats) puis rejouées dans l'ordre si l'état
    // a bougé entre le rendu et l'application (même résultat, calculé sur l'état le plus récent).
    const clesTirees: string[] = [];
    const colle = collerElements(etat, lu.payload.elements, position, () => { const c = genererCle(); clesTirees.push(c); return c; });
    setEtat((courant) => { if (courant === etat) return colle.etat; let i = 0; return collerElements(courant, lu.payload.elements, position, () => clesTirees[i++] ?? genererCle()).etat; });
    setSelection({ cles: colle.clesAjoutees, ancre: colle.clesAjoutees[0] ?? null });
    setRetourPressePapier({ genre: "collage", texte: libelleCollage(colle.clesAjoutees.length) });
    return { ok: true };
  }, [etat, entrepriseId, droits.voirCouts, genererCle, setEtat]);
  /** Boutons Copier / Coller (barre d'outils, mobile) : la sélection, sinon la ligne active. */
  const copierDepuisBouton = () => {
    const cles = selection.cles.length ? selection.cles : ligneActive ? [ligneActive] : [];
    const texte = copierLignes(cles);
    if (texte && typeof navigator !== "undefined" && navigator.clipboard?.writeText) navigator.clipboard.writeText(texte).catch(() => undefined);
    if (!texte) setRetourPressePapier({ genre: "erreur", texte: "Sélectionnez d’abord une ou plusieurs lignes (clic sur la poignée ⋮⋮, Maj pour une plage)." });
  };
  const collerDepuisBouton = async () => {
    const apres = selection.cles.length ? derniereDe(selection.cles) : ligneActive;
    let texte = "";
    try { if (typeof navigator !== "undefined" && navigator.clipboard?.readText) texte = await navigator.clipboard.readText(); } catch { texte = ""; }
    if (!ressembleAPressePapier(texte)) { try { texte = localStorage.getItem(CLE_STOCKAGE_PRESSE_PAPIER) ?? ""; } catch { texte = ""; } }
    collerLignes(texte, apres, positionCollage);
  };
  const derniereDe = (cles: readonly string[]) => { const ordre = [...etat.elements].sort((a, b) => a.ordre - b.ordre).map(cleElement); return [...cles].sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b)).at(-1) ?? null; };

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
    if (invalide) {
      // Un brouillon invalide ne part jamais en base ; le motif est affiché dans l'état d'enregistrement (et
      // en alerte sur une demande explicite) au lieu d'un silence pris pour une sauvegarde acquise.
      if (o.explicite) setErreur(invalide);
      setSauvegarde((s) => (s.statut === "erreur" && !s.conflit && s.message === invalide ? s : { statut: "erreur", message: invalide, conflit: false }));
      return;
    }
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
      // Premier enregistrement d'un nouveau devis : l'identifiant est retenu en mémoire, SANS toucher à
      // l'adresse. Toute modification de l'URL (`replaceState` vers `/devis/<id>/modifier` ou même un
      // fragment) fait resynchroniser le routeur : re-rendu de la page, dialogue fermé, et un collage
      // effectué pendant l'autosauvegarde perdu (constaté en recette preview). Un rechargement de
      // « nouveau » rouvre un éditeur vide ; le brouillon déjà enregistré reste dans la liste des devis.
      if (!devisIdCourant) setDevisIdCourant(r.id);
      if (o.explicite) {
        // Depuis « nouveau », la fiche est ouverte par une navigation complète (le brouillon vient d'être
        // créé, aucun état local à conserver) ; depuis « modifier », navigation douce.
        if (!devisId) window.location.assign(`/devis/${r.id}`);
        else router.push(`/devis/${r.id}`);
      }
    });
  }, [devisId, devisIdCourant, entete, etat, revision, router]);

  /** Enregistrement synchrone pour la garde de navigation : vrai si le brouillon est bien en base. */
  const enregistrerPourQuitter = useCallback(async (): Promise<boolean> => {
    const invalide = validerBrouillon({ clientId: entete.client_id, remiseGlobalePct: entete.remise_globale, elements: etat.elements });
    if (invalide) { setErreur(invalide); return false; }
    const r = await enregistrerDevisV2Action(devisIdCourant, entete, etat.elements, etat.origines, revision);
    if ("error" in r) { setErreur(r.error); setSauvegarde({ statut: "erreur", message: r.error, conflit: r.conflit === true }); return false; }
    setRevision(r.revision); setSale(false); setSauvegarde({ statut: "ok", heure: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) });
    if (!devisIdCourant) setDevisIdCourant(r.id);
    return true;
  }, [devisIdCourant, entete, etat, revision]);

  // Autosauvegarde : après une pause de saisie. Après une erreur (conflit, refus du serveur, brouillon
  // invalide), aucune nouvelle tentative automatique tant que rien n'a changé : une erreur durable ne doit
  // pas marteler le serveur (constaté en recette : nouvel essai toutes les 12 s après un dépassement de
  // délai). La prochaine modification efface l'erreur simple et relance le cycle ; un conflit exige un
  // rechargement.
  useEffect(() => {
    if (!sale || enCours || sauvegarde.statut === "erreur") return;
    const t = window.setTimeout(() => enregistrer({ explicite: false }), DELAI_AUTOSAUVEGARDE_MS);
    return () => window.clearTimeout(t);
  }, [sale, enCours, sauvegarde, enregistrer]);

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

  const chantiersClient = chantiersListe.filter((c) => !entete.client_id || c.clientId === entete.client_id);
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
      <GardeModifications actif={sale} onEnregistrer={enregistrerPourQuitter} />
      <datalist id="unites-devis">{UNITES_METIER.map((u) => <option key={u.cle} value={u.cle}>{u.libelle}</option>)}</datalist>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { const cible = devisIdCourant ? `/devis/${devisIdCourant}` : "/devis"; if (demanderNavigation(cible)) router.push(cible); }} className="text-sm text-neutral-500 hover:underline" data-testid="retour-devis">← {devisIdCourant ? "Retour au devis" : "Retour aux devis"}</button>
          <h1 className="text-xl font-semibold">{devisIdCourant ? "Devis brouillon" : "Nouveau devis"}</h1>
        <span className="text-xs text-neutral-500" aria-live="polite" data-sauvegarde={sauvegarde.statut}>
          {sauvegarde.statut === "en_cours" ? "Enregistrement…"
            : sauvegarde.statut === "hors_ligne" ? "Hors ligne — modifications conservées ici, enregistrement au retour du réseau"
            : sauvegarde.statut === "erreur" ? (sauvegarde.conflit ? "Conflit : rechargez le devis" : `Non enregistré — ${sauvegarde.message}`)
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
              <span className="flex gap-1">
                <select aria-label="Client" value={entete.client_id} onChange={(e) => majEntete({ client_id: e.target.value, chantier_id: null })} className={`${champ} min-w-0 flex-1`}>
                  <option value="">— Choisir un client —</option>
                  {clientsListe.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <button type="button" onClick={() => setDialogue({ type: "client" })} className={`${bouton} shrink-0`} title="Créer un client sans quitter le devis">+ Client</button>
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Chantier (optionnel)
              <span className="flex gap-1">
                <select aria-label="Chantier" value={entete.chantier_id ?? ""} onChange={(e) => majEntete({ chantier_id: e.target.value || null })} disabled={!entete.client_id} className={`${champ} min-w-0 flex-1`}>
                  <option value="">— Sans chantier —</option>
                  {chantiersClient.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <button type="button" onClick={() => setDialogue({ type: "chantier" })} disabled={!entete.client_id} className={`${bouton} shrink-0`} title={entete.client_id ? "Créer un chantier pour ce client sans quitter le devis" : "Choisissez d’abord un client"}>+ Chantier</button>
              </span>
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
              <input type="number" min={0} max={100} step="any" value={entete.remise_globale} disabled={!droits.modifierRemise} title={droits.modifierRemise ? undefined : "Votre poste ne permet pas d’accorder des remises."} onChange={(e) => { const r = interpreterRemisePct(e.target.value); if (r.ok) majEntete({ remise_globale: r.valeur }); else signaler(r.motif); }} className={champ} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
              Conditions (visibles par le client)
              <textarea data-texte-riche="1" rows={2} value={entete.conditions ?? ""} onChange={(e) => majEntete({ conditions: e.target.value || null })} className={`${champ} py-1`} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
              Notes pour le client
              <textarea data-texte-riche="1" rows={2} value={entete.notes_client ?? ""} onChange={(e) => majEntete({ notes_client: e.target.value || null })} className={`${champ} py-1`} />
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
            <button type="button" onClick={() => { const cle = genererCle(); setEtat((courant) => insererLigne(courant, cle, "libre", null)); }} className={bouton} title="Entrée en bas de grille">Ligne libre</button>
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">Insérer une ligne de structure</span>
              <select value="" onChange={(e) => { const t = e.target.value as TypeLigneGrille; if (t) { const cle = genererCle(); setEtat((courant) => insererLigne(courant, cle, t, null)); } }} className={champ} aria-label="Insérer">
                <option value="">Insérer…</option>
                {TYPES_LIGNE_GRILLE.filter((t) => !t.chiffree).map((t) => <option key={t.cle} value={t.cle} title={t.aide}>{t.libelle}</option>)}
              </select>
            </label>
            <span className="mx-1 hidden h-6 w-px bg-neutral-200 sm:inline-block dark:bg-neutral-800" aria-hidden="true" />
            <button type="button" onClick={copierDepuisBouton} className={bouton} title="Copier les lignes sélectionnées (Ctrl+C)" aria-keyshortcuts="Control+C">Copier{selection.cles.length ? ` (${selection.cles.length})` : ""}</button>
            <button type="button" onClick={() => void collerDepuisBouton()} className={bouton} title="Coller les lignes copiées (Ctrl+V)" aria-keyshortcuts="Control+V">Coller</button>
            <select value={positionCollage} onChange={(e) => setPositionCollage(e.target.value as "apres" | "avant" | "fin")} className={champ} aria-label="Position de collage">
              <option value="apres">après la sélection</option>
              <option value="avant">avant la sélection</option>
              <option value="fin">à la fin du devis</option>
            </select>
            <button type="button" onClick={() => setDialogue({ type: "colonnes" })} className={`${bouton} ml-auto`} title="Choisir les colonnes affichées">Colonnes…</button>
            <button type="button" onClick={() => setApercuVisible((v) => !v)} aria-pressed={apercuVisible} className={`${bouton} hidden lg:inline-flex lg:items-center`} title={apercuVisible ? "Masquer l’aperçu A4 : la grille reprend toute la largeur" : "Afficher l’aperçu A4 réel à côté de la grille"}>
              {apercuVisible ? "Masquer l’aperçu" : "Aperçu A4"}
            </button>
          </div>

          <BarreFormatage onSignal={signaler} />
          {retourPressePapier && (
            <p role={retourPressePapier.genre === "erreur" ? "alert" : "status"} data-testid="retour-presse-papier" data-genre={retourPressePapier.genre}
               className={`flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-sm ${retourPressePapier.genre === "erreur" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200" : retourPressePapier.genre === "info" ? "bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100" : "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200"}`}>
              <span>{retourPressePapier.texte}</span>
              {retourPressePapier.genre === "collage" && <button type="button" onClick={() => { annulerEdition(); setSelection({ cles: [], ancre: null }); setRetourPressePapier(null); }} className="underline">Annuler le collage</button>}
              <button type="button" onClick={() => setRetourPressePapier(null)} className="ml-auto text-xs opacity-70" aria-label="Fermer ce message">×</button>
            </p>
          )}

          <div className="hidden lg:block">
            <GrilleDevis
              etat={etat}
              colonnes={colonnes}
              droits={droits}
              seuilTauxMarquePct={seuilTauxMarquePct}
              ligneCiblee={surligne}
              selection={selection}
              onSelection={setSelection}
              onActive={setLigneActive}
              actions={{
                setEtat,
                genererCle,
                signaler,
                ouvrirOuvrage: (instance, apresCle) => setDialogue({ type: "ouvrage", instance, apresCle }),
                prixGlobal: (instance) => setDialogue({ type: "prix", instance }),
                copier: copierLignes,
                coller: (texte, apresCle) => collerLignes(texte, apresCle, "apres"),
              }}
            />
          </div>

          {/* Téléphone et tablette : liste des lignes, saisie d'une ligne en plein écran. */}
          <ol className="space-y-1 lg:hidden" aria-label="Lignes du devis">
            {tries.length === 0 && <li className="rounded-md border border-dashed p-4 text-sm text-neutral-500">Ajoutez des articles, un ouvrage ou une ligne libre.</li>}
            {tries.map((e) => (
              <li key={cleElement(e)} id={`el-${cleElement(e)}`} data-selectionnee={selection.cles.includes(cleElement(e)) ? "1" : undefined} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm ${selection.cles.includes(cleElement(e)) ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30" : surligne === cleElement(e) ? "border-blue-500" : "border-neutral-200 dark:border-neutral-800"}`}>
                <input type="checkbox" aria-label={`Sélectionner la ligne ${e.ordre}`} checked={selection.cles.includes(cleElement(e))} onChange={(ev) => setSelection((s) => ({ cles: ev.target.checked ? [...s.cles, cleElement(e)] : s.cles.filter((c) => c !== cleElement(e)), ancre: cleElement(e) }))} className="h-5 w-5 shrink-0" />
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
                <button type="button" onClick={() => setEtat((courant) => deplacerElement(courant, cleElement(e), -1))} className="min-h-11 min-w-11 text-neutral-500" aria-label="Monter">↑</button>
                <button type="button" onClick={() => setEtat((courant) => deplacerElement(courant, cleElement(e), 1))} className="min-h-11 min-w-11 text-neutral-500" aria-label="Descendre">↓</button>
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
            setEtat((courant) => (dialogue.instance ? remplacerOuvrage(courant, instance) : dialogue.apresCle ? insererOuvrage(courant, instance, dialogue.apresCle) : ajouterOuvrage(courant, instance)));
            setDialogue(null);
          }}
        />
      )}
      {dialogue?.type === "client" && (
        <ClientRapideDialog
          onFermer={() => setDialogue(null)}
          onCree={(c) => { setClientsListe((l) => [c, ...l]); majEntete({ client_id: c.id, chantier_id: null }); setDialogue(null); setRetourPressePapier({ genre: "info", texte: `Client « ${c.label} » créé et affecté au devis.` }); }}
        />
      )}
      {dialogue?.type === "chantier" && clientCourant && (
        <ChantierRapideDialog
          client={clientCourant}
          onFermer={() => setDialogue(null)}
          onCree={(ch) => { setChantiersListe((l) => [ch, ...l]); majEntete({ chantier_id: ch.id }); setDialogue(null); setRetourPressePapier({ genre: "info", texte: `Chantier « ${ch.label} » créé et rattaché au devis.` }); }}
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
          onChange={(patch) => setEtat((courant) => modifierLigneLibre(courant, ligneMobile.ligne.cle, patch))}
          onRetirer={() => { setEtat((courant) => retirerElement(courant, ligneMobile.ligne.cle)); setDialogue(null); }}
          onSignal={signaler}
          onFermer={() => setDialogue(null)}
        />
      )}
      {dialogue?.type === "prix" && (
        <PrixGlobalDialog
          instance={dialogue.instance}
          peutVoirCouts={droits.voirCouts}
          seuilTauxMarquePct={seuilTauxMarquePct}
          onFermer={() => setDialogue(null)}
          onValider={(instance) => { setEtat((courant) => remplacerOuvrage(courant, instance)); setDialogue(null); }}
        />
      )}

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
  onSignal,
}: {
  ligne: LigneLibre;
  origine: EtatElements["origines"][string] | undefined;
  droits: DroitsEditeur;
  onChange: (patch: Partial<Omit<LigneLibre, "cle">>) => void;
  onSignal: (texte: string) => void;
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
      <textarea data-texte-riche="1" aria-label="Description pour le client" rows={2} placeholder="Description pour le client" value={ligne.description ?? ""} onChange={(e) => onChange({ description: e.target.value || null })} className={`${champ} w-full py-1`} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="flex flex-col text-xs">Quantité<input type="number" step="any" value={ligne.quantite} onChange={(e) => onChange({ quantite: Number(e.target.value) })} className={champ} /></label>
        <label className="flex flex-col text-xs">Unité<input list="unites-devis" disabled={!droits.modifierUnite} value={ligne.unite} onChange={(e) => onChange({ unite: e.target.value })} className={champ} /></label>
        <label className="flex flex-col text-xs">PU HT<input type="number" step="any" disabled={!droits.modifierPrix} value={ligne.prixUnitaireHt} onChange={(e) => onChange({ prixUnitaireHt: Number(e.target.value) })} className={champ} /></label>
        <label className="flex flex-col text-xs">Remise %<input type="number" min={0} max={100} step="any" value={ligne.remiseLignePct} onChange={(e) => { const r = interpreterRemisePct(e.target.value); if (r.ok) onChange({ remiseLignePct: r.valeur }); else onSignal(r.motif); }} className={champ} /></label>
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
function LigneMobileDialog({ ligne, origine, droits, onChange, onRetirer, onFermer, onSignal }: {
  ligne: LigneLibre; origine: EtatElements["origines"][string] | undefined; droits: DroitsEditeur;
  onChange: (patch: Partial<Omit<LigneLibre, "cle">>) => void; onRetirer: () => void; onFermer: () => void; onSignal: (texte: string) => void;
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
            <CarteLigne ligne={ligne} origine={origine} droits={droits} onChange={onChange} onSignal={onSignal} />
          ) : type === "remise" ? (
            <div className="space-y-2">
              <input aria-label="Désignation" value={ligne.designation} onChange={(e) => onChange({ designation: e.target.value })} className={`${champ} w-full`} />
              <label className="flex flex-col text-xs">Pourcentage de la section (vide : montant fixe)
                <input inputMode="decimal" value={ligne.remiseSectionPct ?? ""} onChange={(e) => { if (e.target.value === "") { onChange({ remiseSectionPct: null }); return; } const r = interpreterRemisePct(e.target.value); if (r.ok) onChange({ remiseSectionPct: r.valeur }); else onSignal(r.motif); }} className={champ} /></label>
              <label className="flex flex-col text-xs">Montant HT (négatif)
                <input inputMode="decimal" value={ligne.prixUnitaireHt} disabled={ligne.remiseSectionPct !== null && ligne.remiseSectionPct !== undefined} onChange={(e) => onChange({ prixUnitaireHt: -Math.abs(Number(e.target.value.replace(",", ".")) || 0) })} className={champ} /></label>
            </div>
          ) : type === "vide" || type === "separateur" || type === "saut_page" ? (
            <p className="text-sm text-neutral-500">{libelleTypeLigne(type)} : aucune saisie.</p>
          ) : (
            <div className="space-y-2">
              <input data-texte-riche="1" aria-label="Texte" value={ligne.designation} onChange={(e) => onChange({ designation: e.target.value })} className={`${champ} w-full`} />
              {type !== "sous_total" && <textarea data-texte-riche="1" aria-label="Description" rows={3} value={ligne.description ?? ""} onChange={(e) => onChange({ description: e.target.value || null })} className={`${champ} w-full py-1`} />}
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
