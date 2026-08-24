"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  creerAffectationDepuisPropositionAction,
  creerDemandeCongeDepuisPropositionAction,
  envoyerMessageInterneDepuisPropositionAction,
  envoyerMessageSupportDepuisPropositionAction,
  creerDevisDepuisPropositionAction,
} from "@/app/actions/assistant";
import type { MessageChat, PropositionAffectation, PropositionConge, PropositionMessageInterne, PropositionMessageSupport, PropositionDevis } from "@/lib/ai/assistant";
import { lienMaps } from "@/lib/maps";
import { euros } from "@/lib/devis";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";

type MessageAffiche = MessageChat & {
  proposition?: PropositionAffectation;
  propositionConge?: PropositionConge;
  propositionMessageInterne?: PropositionMessageInterne;
  propositionMessageSupport?: PropositionMessageSupport;
  propositionDevis?: PropositionDevis;
  propositionStatut?: "en_attente" | "creee" | "refusee";
  devisIdCree?: string;
  fichierNom?: string;
  // Contenu textuel à renvoyer au modèle pour CE message dans l'historique de la prochaine
  // requête, différent de ce qui est affiché dans la bulle (`contenu`). Sans ça, le modèle
  // n'a plus aucune trace de la proposition qu'il vient de faire dès le tour suivant — il ne
  // peut donc pas appliquer une correction ("passe la cloison à 130 m²") sur la proposition
  // précédente, et en régénère une différente. Découvert en recette réelle IA-DEVIS-V1.
  contenuPourModele?: string;
};

function resumeDevisPourModele(p: PropositionDevis): string {
  const lignes = p.lignes
    .map((l) => {
      const prix = l.prixUnitaireHt !== null ? `${l.prixUnitaireHt} €HT/${l.unite} (source: ${l.sourcePrix})` : "prix non renseigné (source: absent)";
      const remise = l.remiseLigne > 0 ? `, remise ${l.remiseLigne}%` : "";
      return `- ${l.designation} | type ${l.type} | ${l.quantite} ${l.unite} | ${prix} | TVA ${l.tauxTva}%${remise}`;
    })
    .join("\n");
  const hypotheses = p.hypotheses.length ? `\nHypothèses : ${p.hypotheses.join(" ; ")}` : "";
  return (
    `[Proposition de devis déjà faite à l'utilisateur, PAS ENCORE confirmée. Si l'utilisateur demande une modification, ` +
    `rappelle proposer_devis avec CES MÊMES lignes en appliquant uniquement le changement demandé — ne régénère pas le reste depuis zéro.]\n` +
    `client_id: ${p.clientId} (${p.clientNom})\nObjet: ${p.objet}\nLignes:\n${lignes}${hypotheses}`
  );
}
const LIBELLES_TYPE_ACTIVITE: Record<string, string> = { chantier: "Chantier", bureau: "Bureau", depot: "Dépôt", visite_medicale: "Visite médicale", formation: "Formation", conge: "Congé / absence", autre: "Autre" };
const LIBELLES_TYPE_CONGE: Record<string, string> = { conges_payes: "Congés payés", rtt: "RTT", sans_solde: "Sans solde", maladie: "Maladie", evenement_familial: "Événement familial", recuperation: "Récupération", autre: "Autre" };
const LIBELLES_DEMI_JOURNEE: Record<string, string> = { journee: "journée entière", matin: "matin", apres_midi: "après-midi" };
type FichierJoint = { base64: string; mimeType: string; nom: string };
const MIME_PIECES_JOINTES_ACCEPTEES = "image/jpeg,image/png,image/webp,application/pdf";
const TAILLE_MAX_PIECE_JOINTE = 6 * 1024 * 1024;
type EvenementSSE =
  | { type: "texte"; delta: string }
  | { type: "proposition"; proposition: PropositionAffectation }
  | { type: "proposition_conge"; proposition: PropositionConge }
  | { type: "proposition_message_interne"; proposition: PropositionMessageInterne }
  | { type: "proposition_message_support"; proposition: PropositionMessageSupport }
  | { type: "proposition_devis"; proposition: PropositionDevis }
  | { type: "fin" }
  | { type: "erreur"; message: string };

type ReconnaissanceVocale = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type FenetreAvecReco = Window & {
  SpeechRecognition?: new () => ReconnaissanceVocale;
  webkitSpeechRecognition?: new () => ReconnaissanceVocale;
};

function ctorReconnaissance(): (new () => ReconnaissanceVocale) | undefined {
  if (typeof window === "undefined") return undefined;
  const fenetre = window as FenetreAvecReco;
  return fenetre.SpeechRecognition ?? fenetre.webkitSpeechRecognition;
}

export function AssistantIA() {
  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState<MessageAffiche[]>([]);
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ecoute, setEcoute] = useState(false);
  const [micSupporte] = useState(() => !!ctorReconnaissance());
  const [voixActive, setVoixActive] = useState(true);
  const [fichierJoint, setFichierJoint] = useState<FichierJoint | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const reconnaissanceRef = useRef<ReconnaissanceVocale | null>(null);
  const dernierTexteVocalRef = useRef("");
  const envoyerRef = useRef<(texte: string) => void>(() => {});
  const fichierInputRef = useRef<HTMLInputElement>(null);

  function choisirFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setErreur(null);
    if (fichier.size > TAILLE_MAX_PIECE_JOINTE) {
      setErreur("Pièce jointe trop volumineuse (6 Mo maximum).");
      return;
    }
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const dataUrl = String(lecteur.result);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      setFichierJoint({ base64, mimeType: fichier.type, nom: fichier.name });
    };
    lecteur.onerror = () => setErreur("Impossible de lire ce fichier.");
    lecteur.readAsDataURL(fichier);
  }

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ouvert]);

  useEffect(() => {
    const ouvrir = () => setOuvert(true);
    window.addEventListener("elsatia:ouvrir-assistant", ouvrir);
    return () => window.removeEventListener("elsatia:ouvrir-assistant", ouvrir);
  }, []);

  function envoyer(texte?: string) {
    const question = (texte ?? saisie).trim();
    const fichier = fichierJoint;
    if (!question && !fichier) return;
    // Coupe le micro si on envoie manuellement pendant une dictée : sinon la reconnaissance
    // continue en arrière-plan et renvoie le même texte une seconde fois à son arrêt naturel.
    if (ecoute) {
      dernierTexteVocalRef.current = "";
      reconnaissanceRef.current?.stop();
      setEcoute(false);
    }
    setErreur(null);
    const nouveauMessage: MessageAffiche = { role: "user", contenu: question, fichier: fichier ?? undefined, fichierNom: fichier?.nom };
    const historiqueEnvoye = [...messages, nouveauMessage];
    setMessages([...historiqueEnvoye, { role: "assistant", contenu: "" }]);
    setSaisie("");
    setFichierJoint(null);

    startTransition(async () => {
      let texteAccumule = "";
      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            historique: historiqueEnvoye.map((m) => ({ role: m.role, contenu: m.contenuPourModele ?? m.contenu, fichier: m.fichier })),
          }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          setErreur(data?.error ?? "Erreur de l'assistant IA.");
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        const lecteur = res.body.getReader();
        const decodeur = new TextDecoder();
        let tampon = "";
        while (true) {
          const { value, done } = await lecteur.read();
          if (done) break;
          tampon += decodeur.decode(value, { stream: true });
          const morceaux = tampon.split("\n\n");
          tampon = morceaux.pop() ?? "";
          for (const morceau of morceaux) {
            const ligne = morceau.trim();
            if (!ligne.startsWith("data:")) continue;
            const evenement = JSON.parse(ligne.slice(5).trim()) as EvenementSSE;
            if (evenement.type === "texte") {
              texteAccumule += evenement.delta;
              const texteFinal = texteAccumule;
              setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, contenu: texteFinal } : m)));
            } else if (evenement.type === "proposition") {
              setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, proposition: evenement.proposition, propositionStatut: "en_attente" } : m)));
            } else if (evenement.type === "proposition_conge") {
              setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, propositionConge: evenement.proposition, propositionStatut: "en_attente" } : m)));
            } else if (evenement.type === "proposition_message_interne") {
              setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, propositionMessageInterne: evenement.proposition, propositionStatut: "en_attente" } : m)));
            } else if (evenement.type === "proposition_message_support") {
              setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, propositionMessageSupport: evenement.proposition, propositionStatut: "en_attente" } : m)));
            } else if (evenement.type === "proposition_devis") {
              const resume = resumeDevisPourModele(evenement.proposition);
              setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, propositionDevis: evenement.proposition, propositionStatut: "en_attente", contenuPourModele: resume } : m)));
            } else if (evenement.type === "erreur") {
              setErreur(evenement.message);
            }
          }
        }
      } catch {
        setErreur("Erreur de connexion à l'assistant.");
      }

      if (voixActive && texteAccumule && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const parole = new SpeechSynthesisUtterance(texteAccumule);
        parole.lang = "fr-FR";
        window.speechSynthesis.speak(parole);
      }
    });
  }

  useEffect(() => {
    envoyerRef.current = envoyer;
  });

  useEffect(() => {
    const Ctor = ctorReconnaissance();
    if (!Ctor) return;
    const reco = new Ctor();
    reco.lang = "fr-FR";
    // continuous=true : ne coupe pas au premier silence entre deux phrases, seulement
    // sur arrêt manuel (bouton micro) ou silence prolongé — sinon un vocal un peu long
    // se faisait tronquer et envoyer avant que l'utilisateur ait fini de parler.
    reco.continuous = true;
    reco.interimResults = true;
    reco.onresult = (event) => {
      // En continuous=true, chaque segment reconnu (final ou en cours) doit être joint avec
      // un espace explicite : certains navigateurs ne mettent pas d'espace de bord, ce qui
      // collait les mots entre deux segments ("LaurentPourEntretien").
      const morceaux: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const morceau = event.results[i][0].transcript.trim();
        if (morceau) morceaux.push(morceau);
      }
      const texte = morceaux.join(" ");
      dernierTexteVocalRef.current = texte;
      setSaisie(texte);
    };
    reco.onerror = () => setEcoute(false);
    reco.onend = () => {
      setEcoute(false);
      const texteFinal = dernierTexteVocalRef.current;
      dernierTexteVocalRef.current = "";
      if (texteFinal.trim()) envoyerRef.current(texteFinal);
    };
    reconnaissanceRef.current = reco;
  }, []);

  function basculerEcoute() {
    if (!reconnaissanceRef.current) return;
    if (ecoute) {
      reconnaissanceRef.current.stop();
      setEcoute(false);
    } else {
      setErreur(null);
      window.speechSynthesis?.cancel();
      reconnaissanceRef.current.start();
      setEcoute(true);
    }
  }

  function validerProposition(index: number) {
    const message = messages[index];
    if (!message.proposition) return;
    startTransition(async () => {
      const res = await creerAffectationDepuisPropositionAction({
        affectationId: message.proposition!.affectationId,
        employeIds: message.proposition!.employeIds,
        typeActivite: message.proposition!.typeActivite,
        chantierId: message.proposition!.chantierId,
        lieuActivite: message.proposition!.lieuActivite,
        date: message.proposition!.date,
        heures: message.proposition!.heures,
        tache: message.proposition!.tache,
      });
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, propositionStatut: "error" in res ? "en_attente" : "creee" } : m)));
      if ("error" in res) setErreur(res.error);
    });
  }

  function validerPropositionConge(index: number) {
    const message = messages[index];
    if (!message.propositionConge) return;
    startTransition(async () => {
      const res = await creerDemandeCongeDepuisPropositionAction({
        typeConge: message.propositionConge!.typeConge,
        dateDebut: message.propositionConge!.dateDebut,
        dateFin: message.propositionConge!.dateFin,
        demiJourDebut: message.propositionConge!.demiJourDebut,
        demiJourFin: message.propositionConge!.demiJourFin,
        commentaire: message.propositionConge!.commentaire,
      });
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, propositionStatut: "error" in res ? "en_attente" : "creee" } : m)));
      if ("error" in res) setErreur(res.error);
    });
  }

  function validerPropositionMessageInterne(index: number) {
    const message = messages[index];
    if (!message.propositionMessageInterne) return;
    startTransition(async () => {
      const res = await envoyerMessageInterneDepuisPropositionAction({
        destinataireEmployeId: message.propositionMessageInterne!.destinataireEmployeId,
        chantierId: message.propositionMessageInterne!.chantierId,
        contenu: message.propositionMessageInterne!.contenu,
      });
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, propositionStatut: "error" in res ? "en_attente" : "creee" } : m)));
      if ("error" in res) setErreur(res.error);
    });
  }

  function validerPropositionMessageSupport(index: number) {
    const message = messages[index];
    if (!message.propositionMessageSupport) return;
    startTransition(async () => {
      const res = await envoyerMessageSupportDepuisPropositionAction({ contenu: message.propositionMessageSupport!.contenu });
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, propositionStatut: "error" in res ? "en_attente" : "creee" } : m)));
      if ("error" in res) setErreur(res.error);
    });
  }

  function validerPropositionDevis(index: number) {
    const message = messages[index];
    if (!message.propositionDevis) return;
    startTransition(async () => {
      const res = await creerDevisDepuisPropositionAction({
        clientId: message.propositionDevis!.clientId,
        objet: message.propositionDevis!.objet,
        lignes: message.propositionDevis!.lignes.map((l) => ({
          designation: l.designation,
          description: l.description,
          type: l.type,
          quantite: l.quantite,
          unite: l.unite,
          prixUnitaireHt: l.prixUnitaireHt,
          tauxTva: l.tauxTva,
          remiseLigne: l.remiseLigne,
        })),
        notesClient: message.propositionDevis!.notesClient,
      });
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, propositionStatut: "error" in res ? "en_attente" : "creee", devisIdCree: "error" in res ? undefined : res.devisId } : m)));
      if ("error" in res) setErreur(res.error);
    });
  }

  function refuserProposition(index: number) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, propositionStatut: "refusee" } : m)));
  }

  return (
    <>
      {ouvert && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[32rem] max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-200 bg-elsatia-navy px-4 py-3 dark:border-neutral-700">
            <span className="text-sm font-semibold text-white">✨ Assistant {PRODUCT_NAME}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setVoixActive((v) => !v); window.speechSynthesis?.cancel(); }}
                aria-label={voixActive ? "Couper la voix" : "Activer la voix"}
                title={voixActive ? "Couper la voix" : "Activer la voix"}
                className="text-white/80 hover:text-white"
              >
                {voixActive ? "🔊" : "🔇"}
              </button>
              <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="text-white/80 hover:text-white">
                ×
              </button>
            </div>
          </div>

          {/* AI-LAUNCH-V1B §35 : role="log" est le role ARIA prevu pour une suite de messages
              (contrairement a un simple aria-live="polite" generique). Combine a
              aria-relevant="additions", seule l'ajout d'une NOUVELLE bulle de message est
              annonce — pas chaque delta de streaming qui modifie le texte d'une bulle deja
              presente — pour eviter une lecture d'ecran insupportable pendant la reponse. */}
          <div role="log" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-neutral-500">
                Pose une question sur ton activité (à l&apos;écrit ou au micro 🎙️) : « quels chantiers sont en retard ? »,
                « qui est absent aujourd&apos;hui ? », « programme Julien sur le chantier Dupont demain »…
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={
                    "inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm " +
                    (m.role === "user"
                      ? "bg-elsatia-navy text-white"
                      : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100")
                  }
                >
                  {m.fichierNom && <span className="mb-1 block text-xs opacity-80">📎 {m.fichierNom}</span>}
                  {m.contenu || (m.role === "assistant" && i === messages.length - 1 && pending ? "…" : "")}
                </span>
                {m.proposition && (
                  <div className="mt-1 inline-block w-full max-w-[85%] rounded-lg border border-elsatia-gold/60 bg-elsatia-gold/10 p-3 text-left text-sm">
                    {m.proposition.affectationId && <p className="text-[11px] font-medium uppercase tracking-wide text-blue-700">Modification</p>}
                    <p><strong>{m.proposition.employeNoms.join(", ")}</strong> → {m.proposition.typeActivite === "chantier" ? m.proposition.chantierNom : LIBELLES_TYPE_ACTIVITE[m.proposition.typeActivite]}</p>
                    {m.proposition.typeActivite !== "chantier" && m.proposition.lieuActivite && (
                      <p className="text-neutral-600 dark:text-neutral-300">{m.proposition.lieuActivite} · <a href={lienMaps(m.proposition.lieuActivite)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">Itinéraire</a></p>
                    )}
                    <p className="text-neutral-600 dark:text-neutral-300">{m.proposition.date} · {m.proposition.heures} h{m.proposition.tache ? ` · ${m.proposition.tache}` : ""}</p>
                    {m.proposition.avertissement && <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">⚠ {m.proposition.avertissement}</p>}
                    {m.propositionStatut === "en_attente" && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => validerProposition(i)} disabled={pending} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                          {m.proposition.affectationId ? "Valider la modification" : "Valider et créer"}
                        </button>
                        <button type="button" onClick={() => refuserProposition(i)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium">
                          Ignorer
                        </button>
                      </div>
                    )}
                    {m.propositionStatut === "creee" && <p className="mt-2 text-xs font-medium text-green-700">✓ {m.proposition.affectationId ? "Affectation modifiée" : "Affectation créée"}</p>}
                    {m.propositionStatut === "refusee" && <p className="mt-2 text-xs text-neutral-500">Ignorée</p>}
                  </div>
                )}
                {m.propositionConge && (
                  <div className="mt-1 inline-block w-full max-w-[85%] rounded-lg border border-elsatia-gold/60 bg-elsatia-gold/10 p-3 text-left text-sm">
                    <p><strong>{LIBELLES_TYPE_CONGE[m.propositionConge.typeConge]}</strong> · {m.propositionConge.dateDebut}{m.propositionConge.dateFin !== m.propositionConge.dateDebut ? ` → ${m.propositionConge.dateFin}` : ""}</p>
                    <p className="text-neutral-600 dark:text-neutral-300">
                      {m.propositionConge.demiJourDebut === m.propositionConge.demiJourFin ? LIBELLES_DEMI_JOURNEE[m.propositionConge.demiJourDebut] : `${LIBELLES_DEMI_JOURNEE[m.propositionConge.demiJourDebut]} → ${LIBELLES_DEMI_JOURNEE[m.propositionConge.demiJourFin]}`}
                      {m.propositionConge.commentaire ? ` · ${m.propositionConge.commentaire}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">Sera soumise pour approbation, comme depuis la page Congés.</p>
                    {m.propositionStatut === "en_attente" && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => validerPropositionConge(i)} disabled={pending} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                          Valider et soumettre
                        </button>
                        <button type="button" onClick={() => refuserProposition(i)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium">
                          Ignorer
                        </button>
                      </div>
                    )}
                    {m.propositionStatut === "creee" && <p className="mt-2 text-xs font-medium text-green-700">✓ Demande envoyée au responsable</p>}
                    {m.propositionStatut === "refusee" && <p className="mt-2 text-xs text-neutral-500">Ignorée</p>}
                  </div>
                )}
                {m.propositionMessageInterne && (
                  <div className="mt-1 inline-block w-full max-w-[85%] rounded-lg border border-elsatia-gold/60 bg-elsatia-gold/10 p-3 text-left text-sm">
                    <p>→ <strong>{m.propositionMessageInterne.destinataireEmployeNom ?? `Fil chantier · ${m.propositionMessageInterne.chantierNom}`}</strong></p>
                    <p className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-300">{m.propositionMessageInterne.contenu}</p>
                    {m.propositionStatut === "en_attente" && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => validerPropositionMessageInterne(i)} disabled={pending} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                          Valider et envoyer
                        </button>
                        <button type="button" onClick={() => refuserProposition(i)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium">
                          Ignorer
                        </button>
                      </div>
                    )}
                    {m.propositionStatut === "creee" && <p className="mt-2 text-xs font-medium text-green-700">✓ Message envoyé</p>}
                    {m.propositionStatut === "refusee" && <p className="mt-2 text-xs text-neutral-500">Ignoré</p>}
                  </div>
                )}
                {m.propositionMessageSupport && (
                  <div className="mt-1 inline-block w-full max-w-[85%] rounded-lg border border-elsatia-gold/60 bg-elsatia-gold/10 p-3 text-left text-sm">
                    <p><strong>Message au support {BRAND_NAME}</strong></p>
                    <p className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-300">{m.propositionMessageSupport.contenu}</p>
                    {m.propositionStatut === "en_attente" && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => validerPropositionMessageSupport(i)} disabled={pending} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                          Valider et envoyer
                        </button>
                        <button type="button" onClick={() => refuserProposition(i)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium">
                          Ignorer
                        </button>
                      </div>
                    )}
                    {m.propositionStatut === "creee" && <p className="mt-2 text-xs font-medium text-green-700">✓ Message envoyé au support</p>}
                    {m.propositionStatut === "refusee" && <p className="mt-2 text-xs text-neutral-500">Ignoré</p>}
                  </div>
                )}
                {m.propositionDevis && (
                  <div className="mt-1 inline-block w-full max-w-[85%] rounded-lg border border-elsatia-gold/60 bg-elsatia-gold/10 p-3 text-left text-sm">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Devis proposé (brouillon)</p>
                    <p><strong>{m.propositionDevis.clientNom}</strong> · {m.propositionDevis.objet}</p>
                    {/* Lignes empilées (pas de tableau) : la fenêtre de l'assistant reste étroite
                        quelle que soit la largeur d'écran — voir AI-DEVIS-V1 §51. */}
                    <div className="mt-2 space-y-1.5">
                      {m.propositionDevis.lignes.map((l, li) => (
                        <div key={li} className="rounded border border-neutral-200 bg-white/60 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900/40">
                          <p className="font-medium">{l.designation}</p>
                          <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-neutral-600 dark:text-neutral-300">
                            <span>{l.quantite} {l.unite}</span>
                            <span>· {l.prixUnitaireHt !== null ? `${euros(l.prixUnitaireHt)} HT/${l.unite}` : "Prix à renseigner"}</span>
                            {l.prixUnitaireHt !== null && l.sourcePrix === "historique" && <span className="text-amber-700 dark:text-amber-400">(basé sur un devis précédent)</span>}
                            <span>· TVA {l.tauxTva}%</span>
                            {l.remiseLigne > 0 && <span>· remise {l.remiseLigne}%</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                    {m.propositionDevis.hypotheses.length > 0 && (
                      <div className="mt-2 rounded bg-amber-100 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                        <p className="font-medium">Hypothèses :</p>
                        <ul className="list-disc pl-4">
                          {m.propositionDevis.hypotheses.map((h, hi) => (
                            <li key={hi}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.propositionDevis.avertissement && <p className="mt-1 text-neutral-600 dark:text-neutral-300">{m.propositionDevis.avertissement}</p>}
                    {m.propositionStatut === "en_attente" && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => validerPropositionDevis(i)} disabled={pending} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                          Créer le brouillon
                        </button>
                        <button type="button" onClick={() => refuserProposition(i)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium">
                          Ignorer
                        </button>
                      </div>
                    )}
                    {m.propositionStatut === "creee" && (
                      <p className="mt-2 text-xs font-medium text-green-700">
                        ✓ Brouillon de devis créé
                        {m.devisIdCree && (
                          <>
                            {" · "}
                            <a href={`/devis/${m.devisIdCree}`} className="underline">Ouvrir le devis</a>
                          </>
                        )}
                      </p>
                    )}
                    {m.propositionStatut === "refusee" && <p className="mt-2 text-xs text-neutral-500">Ignoré</p>}
                  </div>
                )}
              </div>
            ))}
            {ecoute && <p className="text-sm text-elsatia-navy dark:text-elsatia-gold">🎙️ Je t&apos;écoute…</p>}
            {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
            <div ref={finRef} />
          </div>

          <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
            {fichierJoint && (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-elsatia-gold/10 px-2 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate">📎 {fichierJoint.nom}</span>
                <button type="button" onClick={() => setFichierJoint(null)} aria-label="Retirer la pièce jointe" className="text-neutral-500 hover:text-red-600">×</button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input ref={fichierInputRef} type="file" accept={MIME_PIECES_JOINTES_ACCEPTEES} onChange={choisirFichier} className="hidden" />
              <button
                type="button"
                onClick={() => fichierInputRef.current?.click()}
                aria-label="Joindre un fichier"
                title="Joindre une photo ou un PDF"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
              >
                📎
              </button>
              {micSupporte && (
                <button
                  type="button"
                  onClick={basculerEcoute}
                  aria-label={ecoute ? "Arrêter le micro" : "Parler à l'assistant"}
                  title={ecoute ? "Arrêter le micro" : "Parler à l'assistant"}
                  className={`rounded-md px-3 py-2 text-sm ${ecoute ? "bg-red-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
                >
                  🎙️
                </button>
              )}
              <input
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    envoyer();
                  }
                }}
                placeholder="Écris ou parle…"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <button
                type="button"
                onClick={() => envoyer()}
                disabled={pending || (!saisie.trim() && !fichierJoint)}
                className="rounded-md bg-elsatia-navy px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      {!ouvert && (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          aria-label={`Assistant ${PRODUCT_NAME}`}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-elsatia-gold px-4 py-3 text-sm font-semibold text-elsatia-navy shadow-lg hover:brightness-95"
        >
          <span aria-hidden="true">✨</span>
          <span className="hidden sm:inline">Assistant</span>
        </button>
      )}
    </>
  );
}
