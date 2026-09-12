/**
 * Registre des actions contextuelles (GP V1, lot E) — module PUR.
 *
 * Pour chaque objet (devis, client, facture…), la liste complète de ce que l'utilisateur PEUT faire,
 * avec, pour chaque action indisponible, le motif à afficher en infobulle : « Disponible uniquement
 * lorsque le devis est accepté », « Votre poste ne permet pas de… ». Une action indisponible reste
 * visible et grisée — c'est ainsi qu'on apprend le logiciel. Les registres ne savent rien de React :
 * ils rendent des descripteurs ; la page y attache liens et actions serveur.
 */
import { MOTIF_DROIT_FIN, possedeDroitFin, type DroitFin } from "@/lib/droits-devis";

export type GroupeAction = "creer" | "modifier" | "document" | "transformer" | "navigation" | "danger";

export type ActionContextuelle = {
  cle: string;
  libelle: string;
  groupe: GroupeAction;
  /** Raccourci affiché dans l'infobulle. */
  raccourci?: string;
  disponible: boolean;
  /** Pourquoi l'action est indisponible — obligatoire quand `disponible` est faux. */
  motif?: string;
  /** Lien de navigation ; sinon la page fournit une action serveur pour cette clé. */
  href?: string;
  /** Ouvre dans un nouvel onglet (PDF, impression). */
  externe?: boolean;
  /** Demande une confirmation avant exécution. */
  confirmation?: string;
  danger?: true;
};

export type Droits = readonly string[] | null;

const a = (permissions: Droits, cle: string) => permissions === null || permissions.includes(cle);
const motifDroit = (cle: string) => `Votre poste ne permet pas cette action (droit « ${cle} »).`;

function action(base: Omit<ActionContextuelle, "disponible" | "motif">, conditions: Array<[boolean, string]>): ActionContextuelle {
  const refus = conditions.find(([ok]) => !ok);
  return refus ? { ...base, disponible: false, motif: refus[1] } : { ...base, disponible: true };
}

const droit = (permissions: Droits, cle: string): [boolean, string] => [a(permissions, cle), motifDroit(cle)];
const droitFin = (permissions: Droits, cle: DroitFin): [boolean, string] => [possedeDroitFin(permissions, cle), MOTIF_DROIT_FIN[cle]];

// ── Devis ──────────────────────────────────────────────────────────────────────

export type DevisPourActions = { id: string; statut: string; chantierId: string | null; clientId: string | null; moteurV2: boolean; aDesLignes: boolean };

export function actionsDevis(d: DevisPourActions, permissions: Droits): ActionContextuelle[] {
  const brouillon: [boolean, string] = [d.statut === "brouillon", "Disponible uniquement sur un devis brouillon."];
  const accepte: [boolean, string] = [d.statut === "accepte", "Disponible uniquement lorsque le devis est accepté."];
  const gerer = droit(permissions, "gerer_devis");
  const editeur = `/devis/${d.id}/modifier`;
  return [
    action({ cle: "creer", libelle: "Nouveau devis", groupe: "creer", href: "/devis/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: editeur }, [gerer, brouillon]),
    action({ cle: "dupliquer", libelle: "Dupliquer", groupe: "modifier" }, [gerer]),
    action({ cle: "ajouter_ligne", libelle: "Ajouter une ligne", groupe: "modifier", href: `${editeur}#lignes`, raccourci: "Entrée dans la grille" }, [gerer, brouillon]),
    action({ cle: "ajouter_article", libelle: "Ajouter un article", groupe: "modifier", href: `${editeur}#lignes`, raccourci: "Ctrl+K" }, [gerer, brouillon]),
    action({ cle: "ajouter_ouvrage", libelle: "Ajouter un ouvrage", groupe: "modifier", href: `${editeur}#lignes` }, [gerer, brouillon, [a(permissions, "acces_ouvrages") || a(permissions, "acces_devis"), motifDroit("acces_ouvrages")]]),
    action({ cle: "inserer_titre", libelle: "Insérer un titre", groupe: "modifier", href: `${editeur}#lignes` }, [gerer, brouillon]),
    action({ cle: "inserer_sous_total", libelle: "Insérer un sous-total", groupe: "modifier", href: `${editeur}#lignes` }, [gerer, brouillon]),
    action({ cle: "ajouter_remise", libelle: "Ajouter une remise", groupe: "modifier", href: `${editeur}#lignes` }, [gerer, brouillon, droitFin(permissions, "modifier_remise")]),
    action({ cle: "ajouter_commentaire", libelle: "Ajouter un commentaire", groupe: "modifier", href: `${editeur}#lignes` }, [gerer, brouillon]),
    action({ cle: "importer", libelle: "Importer des lignes", groupe: "modifier" }, [[false, "L’import de lignes (tarifs, devis externes) arrive en V2."]]),
    action({ cle: "apercu", libelle: "Aperçu", groupe: "document", href: `/imprimer/devis/${d.id}`, externe: true }, [[d.aDesLignes, "Le devis n’a encore aucune ligne."]]),
    action({ cle: "pdf", libelle: "PDF", groupe: "document", href: `/api/documents/devis/${d.id}/pdf`, externe: true }, [[d.aDesLignes, "Le devis n’a encore aucune ligne."]]),
    action({ cle: "imprimer", libelle: "Imprimer", groupe: "document", href: `/imprimer/devis/${d.id}`, externe: true }, [[d.aDesLignes, "Le devis n’a encore aucune ligne."]]),
    action({ cle: "envoyer", libelle: "Envoyer par e-mail", groupe: "document", href: `/devis/${d.id}#envoi` }, [gerer, droitFin(permissions, "envoyer_devis"), [d.clientId !== null, "Rattachez d’abord un client."], [!["annule", "expire"].includes(d.statut), "Un devis annulé ou expiré ne s’envoie plus."]]),
    action({ cle: "transformer_commande", libelle: "Transformer en commande", groupe: "transformer" }, [[false, "La transformation en commande fournisseur n’est pas disponible en V1."]]),
    action({ cle: "transformer_facture", libelle: "Transformer en facture", groupe: "transformer", confirmation: "Créer une facture complète depuis ce devis ?" }, [droit(permissions, "gerer_factures"), droitFin(permissions, "transformer_devis"), accepte]),
    action({ cle: "creer_acompte", libelle: "Créer un acompte", groupe: "transformer", href: `/facturation-avancee?devis=${d.id}` }, [droit(permissions, "gerer_facturation_avancee"), droitFin(permissions, "transformer_devis"), accepte]),
    action({ cle: "creer_situation", libelle: "Créer une situation", groupe: "transformer", href: `/facturation-avancee?devis=${d.id}` }, [droit(permissions, "gerer_facturation_avancee"), droitFin(permissions, "transformer_devis"), accepte]),
    action({ cle: "creer_chantier", libelle: "Créer le chantier", groupe: "transformer", href: `/devis/${d.id}/creer-chantier` }, [droit(permissions, "gerer_chantiers"), droitFin(permissions, "transformer_devis"), accepte, [d.chantierId === null, "Ce devis est déjà rattaché à un chantier."]]),
    action({ cle: "archiver", libelle: "Annuler le devis", groupe: "danger", confirmation: "Annuler ce devis ? Il ne pourra plus être envoyé ni accepté." }, [gerer, [["brouillon", "envoye", "refuse", "expire"].includes(d.statut), "Un devis accepté ou déjà annulé ne s’annule pas."]]),
    action({ cle: "historique", libelle: "Historique", groupe: "navigation", href: `/devis/${d.id}#historique` }, [[d.moteurV2, "L’historique détaillé arrive avec le moteur v2."]]),
    action({ cle: "supprimer", libelle: "Supprimer", groupe: "danger", danger: true, confirmation: "Supprimer définitivement ce devis ? Cette action est irréversible." }, [gerer, droitFin(permissions, "supprimer_devis"), [["brouillon", "refuse", "annule"].includes(d.statut), "Seul un devis brouillon, refusé ou annulé se supprime."]]),
  ];
}

// ── Client ─────────────────────────────────────────────────────────────────────

export type ClientPourActions = { id: string; telephone: string | null; email: string | null; adresse: string | null; statut: string };

export function actionsClient(c: ClientPourActions, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_clients");
  const adresse = c.adresse ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.adresse)}` : undefined;
  return [
    action({ cle: "creer", libelle: "Nouveau client", groupe: "creer", href: "/clients/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: `/clients/${c.id}/modifier` }, [gerer]),
    action({ cle: "nouveau_devis", libelle: "Nouveau devis", groupe: "creer", href: `/devis/nouveau?client=${c.id}` }, [droit(permissions, "gerer_devis"), [c.statut !== "archive", "Client archivé : réactivez-le d’abord."]]),
    action({ cle: "nouvelle_facture", libelle: "Nouvelle facture", groupe: "creer", href: `/factures/nouveau?client=${c.id}` }, [droit(permissions, "gerer_factures"), [c.statut !== "archive", "Client archivé : réactivez-le d’abord."]]),
    action({ cle: "nouveau_chantier", libelle: "Nouveau chantier", groupe: "creer", href: `/chantiers/nouveau?client=${c.id}` }, [droit(permissions, "gerer_chantiers")]),
    action({ cle: "appeler", libelle: "Appeler", groupe: "navigation", href: c.telephone ? `tel:${c.telephone.replace(/\s/g, "")}` : undefined, externe: true }, [[!!c.telephone, "Aucun téléphone sur la fiche."]]),
    action({ cle: "email", libelle: "Écrire un e-mail", groupe: "navigation", href: c.email ? `mailto:${c.email}` : undefined, externe: true }, [[!!c.email, "Aucune adresse e-mail sur la fiche."]]),
    action({ cle: "localiser", libelle: "Localiser", groupe: "navigation", href: adresse, externe: true }, [[!!c.adresse, "Aucune adresse sur la fiche."]]),
    action({ cle: "documents", libelle: "Documents", groupe: "navigation", href: `/clients/${c.id}#documents` }, [droit(permissions, "acces_clients")]),
    action({ cle: "planning", libelle: "Planning", groupe: "navigation", href: `/planning?client=${c.id}` }, [droit(permissions, "acces_planning")]),
    action({ cle: "historique", libelle: "Historique", groupe: "navigation", href: `/clients/${c.id}#historique` }, [droit(permissions, "acces_clients")]),
    action({ cle: "imprimer", libelle: "Imprimer la fiche", groupe: "document" }, [[false, "L’impression de la fiche client arrive en V2."]]),
    action({ cle: "supprimer", libelle: "Supprimer", groupe: "danger", danger: true }, [[false, "Un client ne se supprime pas : archivez-le (ses devis et factures le référencent)."]]),
  ];
}

// ── Facture ────────────────────────────────────────────────────────────────────

export type FacturePourActions = { id: string; statut: string; resteAPayer: number; devisOrigineId: string | null; moteurV2: boolean };

export function actionsFacture(f: FacturePourActions, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_factures");
  const emise: [boolean, string] = [f.statut !== "brouillon", "Disponible uniquement sur une facture émise."];
  return [
    action({ cle: "creer", libelle: "Nouvelle facture", groupe: "creer", href: "/factures/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: `/factures/${f.id}/modifier` }, [gerer, [f.statut === "brouillon", "Une facture émise ne se modifie plus : créez un avoir."]]),
    action({ cle: "apercu", libelle: "Aperçu", groupe: "document", href: `/imprimer/factures/${f.id}`, externe: true }, []),
    action({ cle: "pdf", libelle: "PDF", groupe: "document", href: `/api/documents/factures/${f.id}/pdf`, externe: true }, []),
    action({ cle: "envoyer", libelle: "Envoyer par e-mail", groupe: "document", href: `/factures/${f.id}#envoi` }, [gerer, emise, [!["annulee", "avoir_emis"].includes(f.statut), "Cette facture est annulée."]]),
    action({ cle: "paiement", libelle: "Enregistrer un paiement", groupe: "modifier", href: `/factures/${f.id}#paiements` }, [gerer, emise, [f.resteAPayer > 0, "Cette facture est soldée."]]),
    action({ cle: "relancer", libelle: "Relancer", groupe: "document", href: `/factures/${f.id}#relances` }, [gerer, emise, [f.resteAPayer > 0, "Rien à relancer : facture soldée."]]),
    action({ cle: "avoir", libelle: "Créer un avoir", groupe: "transformer", href: f.devisOrigineId ? `/facturation-avancee?devis=${f.devisOrigineId}&type=avoir&facture=${f.id}` : undefined }, [droit(permissions, "gerer_facturation_avancee"), emise, [f.devisOrigineId !== null, "L’avoir se crée depuis le devis d’origine ; cette facture n’en a pas."]]),
    action({ cle: "devis_origine", libelle: "Devis d’origine", groupe: "navigation", href: f.devisOrigineId ? `/devis/${f.devisOrigineId}` : undefined }, [[f.devisOrigineId !== null, "Cette facture n’est pas issue d’un devis."]]),
    action({ cle: "historique", libelle: "Historique", groupe: "navigation", href: `/factures/${f.id}#historique` }, [[f.moteurV2, "L’historique détaillé arrive avec le moteur v2."]]),
    action({ cle: "supprimer", libelle: "Supprimer", groupe: "danger", danger: true }, [[false, "Une facture ne se supprime pas : un brouillon s’annule, une facture émise se corrige par avoir."]]),
  ];
}

// ── Chantier ───────────────────────────────────────────────────────────────────

export type ChantierPourActions = { id: string; statut: string; clientId: string | null; adresse: string | null };

export function actionsChantier(c: ChantierPourActions, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_chantiers");
  const ouvert: [boolean, string] = [!["termine", "annule", "archive"].includes(c.statut), "Ce chantier est clos."];
  return [
    action({ cle: "creer", libelle: "Nouveau chantier", groupe: "creer", href: "/chantiers/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: `/chantiers/${c.id}/modifier` }, [gerer]),
    action({ cle: "nouveau_devis", libelle: "Nouveau devis", groupe: "creer", href: `/devis/nouveau?chantier=${c.id}` }, [droit(permissions, "gerer_devis"), ouvert]),
    action({ cle: "planifier", libelle: "Planifier", groupe: "creer", href: `/planning?chantier=${c.id}` }, [droit(permissions, "gerer_planning"), ouvert]),
    action({ cle: "affecter", libelle: "Affecter l’équipe", groupe: "modifier", href: `/chantiers/${c.id}#equipe` }, [gerer, ouvert]),
    action({ cle: "documents", libelle: "Documents (GED)", groupe: "navigation", href: `/chantiers/${c.id}/documents` }, [droit(permissions, "acces_chantiers")]),
    action({ cle: "reserves", libelle: "Réserves", groupe: "navigation", href: `/chantiers/${c.id}#reserves` }, [droit(permissions, "acces_chantiers")]),
    action({ cle: "doe", libelle: "DOE", groupe: "navigation", href: `/chantiers/${c.id}/doe` }, [droit(permissions, "acces_chantiers")]),
    action({ cle: "localiser", libelle: "Localiser", groupe: "navigation", href: c.adresse ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.adresse)}` : undefined, externe: true }, [[!!c.adresse, "Aucune adresse sur le chantier."]]),
    action({ cle: "client", libelle: "Fiche client", groupe: "navigation", href: c.clientId ? `/clients/${c.clientId}` : undefined }, [[!!c.clientId, "Aucun client rattaché."]]),
    action({ cle: "historique", libelle: "Historique", groupe: "navigation", href: `/chantiers/${c.id}#historique` }, [droit(permissions, "acces_chantiers")]),
    action({ cle: "imprimer", libelle: "Imprimer la fiche", groupe: "document" }, [[false, "L’impression de la fiche chantier arrive en V2."]]),
  ];
}

// ── Fournisseur, articles, ouvrage, commande, stock, salarié, planning, situation ──

export function actionsFournisseur(f: { id: string; telephone: string | null; email: string | null; actif: boolean }, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_achats");
  return [
    action({ cle: "creer", libelle: "Nouveau fournisseur", groupe: "creer", href: "/fournisseurs/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: `/fournisseurs/${f.id}/modifier` }, [gerer]),
    action({ cle: "commande", libelle: "Nouvelle commande", groupe: "creer", href: `/commandes/nouveau?fournisseur=${f.id}` }, [gerer, [f.actif, "Fournisseur inactif."]]),
    action({ cle: "depense", libelle: "Saisir une facture fournisseur", groupe: "creer", href: `/depenses/nouveau?fournisseur=${f.id}` }, [gerer]),
    action({ cle: "appeler", libelle: "Appeler", groupe: "navigation", href: f.telephone ? `tel:${f.telephone.replace(/\s/g, "")}` : undefined, externe: true }, [[!!f.telephone, "Aucun téléphone."]]),
    action({ cle: "email", libelle: "Écrire un e-mail", groupe: "navigation", href: f.email ? `mailto:${f.email}` : undefined, externe: true }, [[!!f.email, "Aucune adresse e-mail."]]),
    action({ cle: "tarifs", libelle: "Tarifs", groupe: "navigation", href: `/fournisseurs/${f.id}#tarifs` }, [droit(permissions, "acces_achats")]),
    action({ cle: "historique", libelle: "Historique", groupe: "navigation", href: `/fournisseurs/${f.id}#historique` }, [droit(permissions, "acces_achats")]),
  ];
}

export function actionsArticle(p: { id: string; actif: boolean }, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_devis");
  return [
    action({ cle: "creer", libelle: "Nouvel article", groupe: "creer", href: "/prestations/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: `/prestations/${p.id}/modifier` }, [gerer]),
    action({ cle: "dupliquer", libelle: "Dupliquer", groupe: "modifier" }, [gerer]),
    action({ cle: "inserer_devis", libelle: "Insérer dans un devis", groupe: "transformer", href: "/devis/nouveau" }, [gerer, [p.actif, "Article archivé."]]),
    action({ cle: "familles", libelle: "Familles", groupe: "navigation", href: "/prestations/familles" }, [droit(permissions, "acces_devis")]),
    action({ cle: "doublons", libelle: "Contrôle des doublons", groupe: "navigation", href: "/prestations/doublons" }, [droit(permissions, "acces_devis")]),
    action({ cle: "historique", libelle: "Historique", groupe: "navigation", href: `/prestations/${p.id}/modifier#historique` }, [droit(permissions, "acces_devis")]),
    action({ cle: p.actif ? "archiver" : "reactiver", libelle: p.actif ? "Archiver" : "Réactiver", groupe: "danger", confirmation: p.actif ? "Archiver cet article ?" : "Réactiver cet article ?" }, [gerer]),
    action({ cle: "supprimer", libelle: "Supprimer", groupe: "danger", danger: true }, [[false, "Un article ne se supprime pas (des devis le référencent) : archivez-le."]]),
  ];
}

export function actionsOuvrage(o: { id: string; statut: string }, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_ouvrages");
  return [
    action({ cle: "creer", libelle: "Nouvel ouvrage", groupe: "creer", href: "/ouvrages/bibliotheque/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Nouvelle version", groupe: "modifier", href: `/ouvrages/bibliotheque/${o.id}/modifier` }, [gerer, [o.statut === "actif", "Ouvrage archivé."]]),
    action({ cle: "inserer_devis", libelle: "Insérer dans un devis", groupe: "transformer", href: "/devis/nouveau" }, [droit(permissions, "gerer_devis"), [o.statut === "actif", "Ouvrage archivé."]]),
    action({ cle: "historique", libelle: "Versions et historique", groupe: "navigation", href: `/ouvrages/bibliotheque/${o.id}#versions` }, [droit(permissions, "acces_ouvrages")]),
    action({ cle: o.statut === "actif" ? "archiver" : "reactiver", libelle: o.statut === "actif" ? "Archiver" : "Réactiver", groupe: "danger" }, [gerer]),
  ];
}

export function actionsCommande(c: { id: string; statut: string; fournisseurId: string | null }, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_achats");
  return [
    action({ cle: "creer", libelle: "Nouvelle commande", groupe: "creer", href: "/commandes/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: `/commandes/${c.id}/modifier` }, [gerer, [c.statut === "brouillon", "Une commande envoyée ne se modifie plus."]]),
    action({ cle: "imprimer", libelle: "Imprimer", groupe: "document", href: `/imprimer/commandes/${c.id}`, externe: true }, []),
    action({ cle: "reception", libelle: "Enregistrer une réception", groupe: "transformer", href: `/commandes/${c.id}#reception` }, [gerer, [["envoyee", "confirmee", "recue_partiel"].includes(c.statut), "Disponible une fois la commande envoyée ou confirmée."]]),
    action({ cle: "fournisseur", libelle: "Fiche fournisseur", groupe: "navigation", href: c.fournisseurId ? `/fournisseurs/${c.fournisseurId}` : undefined }, [[!!c.fournisseurId, "Aucun fournisseur."]]),
    action({ cle: "supprimer", libelle: "Supprimer", groupe: "danger", danger: true, confirmation: "Supprimer cette commande ?" }, [gerer, [["brouillon", "annulee"].includes(c.statut), "Seule une commande brouillon ou annulée se supprime."]]),
  ];
}

export function actionsArticleStock(s: { id: string; actif: boolean }, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_stock");
  return [
    action({ cle: "creer", libelle: "Nouvel article", groupe: "creer", href: "/stock/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: `/stock/${s.id}/modifier` }, [gerer]),
    action({ cle: "mouvement", libelle: "Entrée / sortie", groupe: "modifier", href: `/stock/${s.id}#mouvement` }, [[a(permissions, "effectuer_entree_stock") || a(permissions, "effectuer_sortie_stock"), motifDroit("effectuer_entree_stock")], [s.actif, "Article inactif."]]),
    action({ cle: "commander", libelle: "Commander", groupe: "transformer", href: `/commandes/nouveau?article=${s.id}` }, [droit(permissions, "gerer_achats")]),
    action({ cle: "qr", libelle: "Code QR", groupe: "document", href: `/stock/${s.id}#qr` }, [droit(permissions, "acces_stock")]),
    action({ cle: "historique", libelle: "Mouvements", groupe: "navigation", href: `/stock/${s.id}#mouvements` }, [droit(permissions, "acces_stock")]),
  ];
}

export function actionsSalarie(e: { id: string; statut: string; utilisateurId: string | null }, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_employes");
  return [
    action({ cle: "creer", libelle: "Nouveau salarié", groupe: "creer", href: "/employes/nouveau" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier", href: `/employes/${e.id}/modifier` }, [gerer]),
    action({ cle: "planning", libelle: "Planning", groupe: "navigation", href: `/planning?employe=${e.id}` }, [droit(permissions, "acces_planning"), [e.statut === "actif", "Salarié sorti ou suspendu."]]),
    action({ cle: "pointage", libelle: "Pointages", groupe: "navigation", href: `/pointage?employe=${e.id}` }, [droit(permissions, "acces_pointage")]),
    action({ cle: "conges", libelle: "Congés", groupe: "navigation", href: `/conges?employe=${e.id}` }, [droit(permissions, "gerer_conges")]),
    action({ cle: "carte", libelle: "Carte d’identification", groupe: "document", href: `/employes/${e.id}/carte`, externe: true }, [droit(permissions, "acces_employes")]),
    action({ cle: "acces", libelle: "Accès à l’application", groupe: "navigation", href: `/parametres/acces` }, [droit(permissions, "gerer_utilisateurs"), [!!e.utilisateurId, "Ce salarié n’a pas de compte utilisateur."]]),
    action({ cle: "historique", libelle: "Historique", groupe: "navigation", href: `/employes/${e.id}#historique` }, [droit(permissions, "acces_employes")]),
  ];
}

export type EvenementPourActions = { id: string; chantierId: string | null; clientId: string | null; statut: string };

export function actionsPlanning(e: EvenementPourActions | null, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_planning");
  const selection: [boolean, string] = [e !== null, "Sélectionnez un évènement du planning."];
  const modifiable: [boolean, string] = [e !== null && e.statut !== "annule", "Évènement annulé."];
  return [
    action({ cle: "creer", libelle: "Nouvel évènement", groupe: "creer", raccourci: "Glisser sur une zone vide" }, [gerer]),
    action({ cle: "modifier", libelle: "Modifier", groupe: "modifier" }, [gerer, selection, modifiable]),
    action({ cle: "deplacer", libelle: "Déplacer", groupe: "modifier", raccourci: "Glisser-déposer" }, [gerer, selection, modifiable]),
    action({ cle: "dupliquer", libelle: "Dupliquer", groupe: "modifier", raccourci: "Alt + glisser" }, [gerer, selection]),
    action({ cle: "affecter", libelle: "Affecter une équipe", groupe: "modifier" }, [droitFin(permissions, "affecter_ressources"), selection, modifiable]),
    action({ cle: "horaire", libelle: "Changer l’horaire", groupe: "modifier", raccourci: "Étirer le bloc" }, [gerer, selection, modifiable]),
    action({ cle: "chantier", libelle: "Ouvrir le chantier", groupe: "navigation", href: e?.chantierId ? `/chantiers/${e.chantierId}` : undefined }, [selection, [!!e?.chantierId, "Cet évènement n’est pas lié à un chantier."]]),
    action({ cle: "client", libelle: "Ouvrir le client", groupe: "navigation", href: e?.clientId ? `/clients/${e.clientId}` : undefined }, [selection, [!!e?.clientId, "Aucun client lié."]]),
    action({ cle: "documents", libelle: "Documents", groupe: "navigation", href: e?.chantierId ? `/chantiers/${e.chantierId}/documents` : undefined }, [selection, [!!e?.chantierId, "Aucun chantier lié."]]),
    action({ cle: "imprimer", libelle: "Imprimer", groupe: "document", href: "/imprimer/planning", externe: true }, [droit(permissions, "acces_planning")]),
    action({ cle: "historique", libelle: "Historique", groupe: "navigation" }, [selection]),
    action({ cle: "supprimer", libelle: "Supprimer", groupe: "danger", danger: true, confirmation: "Supprimer cet évènement du planning ?" }, [gerer, selection]),
  ];
}

export function actionsSituation(s: { id: string; statut: string; factureId: string | null; devisId: string }, permissions: Droits): ActionContextuelle[] {
  const gerer = droit(permissions, "gerer_facturation_avancee");
  return [
    action({ cle: "facturer", libelle: "Facturer la situation", groupe: "transformer", confirmation: "Créer la facture de cette situation ?" }, [gerer, [s.factureId === null, "Cette situation est déjà facturée."], [s.statut !== "annulee", "Situation annulée."]]),
    action({ cle: "facture", libelle: "Voir la facture", groupe: "navigation", href: s.factureId ? `/factures/${s.factureId}` : undefined }, [[!!s.factureId, "Pas encore facturée."]]),
    action({ cle: "devis", libelle: "Devis d’origine", groupe: "navigation", href: `/devis/${s.devisId}` }, []),
  ];
}

export const LIBELLES_GROUPES: Record<GroupeAction, string> = {
  creer: "Créer",
  modifier: "Modifier",
  document: "Documents",
  transformer: "Transformer",
  navigation: "Voir aussi",
  danger: "Autres",
};
