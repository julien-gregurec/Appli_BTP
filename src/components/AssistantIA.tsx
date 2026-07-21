"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { creerAffectationDepuisPropositionAction, creerDemandeCongeDepuisPropositionAction } from "@/app/actions/assistant";
import type { MessageChat, PropositionAffectation, PropositionConge } from "@/lib/ai/assistant";
import { lienMaps } from "@/lib/maps";

type MessageAffiche = MessageChat & {
  proposition?: PropositionAffectation;
  propositionConge?: PropositionConge;
  propositionStatut?: "en_attente" | "creee" | "refusee";
  fichierNom?: string;
};
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
    window.addEventListener("liria:ouvrir-assistant", ouvrir);
    return () => window.removeEventListener("liria:ouvrir-assistant", ouvrir);
  }, []);

  function envoyer(texte?: string) {
    const question = (texte ?? saisie).trim();
    const fichier = fichierJoint;
    if (!question && !fichier) return;
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
            historique: historiqueEnvoye.map((m) => ({ role: m.role, contenu: m.contenu, fichier: m.fichier })),
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
    let dernierTexte = "";
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
      dernierTexte = texte;
      setSaisie(texte);
    };
    reco.onerror = () => setEcoute(false);
    reco.onend = () => {
      setEcoute(false);
      if (dernierTexte.trim()) envoyerRef.current(dernierTexte);
      dernierTexte = "";
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
        employeId: message.proposition!.employeId,
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

  function refuserProposition(index: number) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, propositionStatut: "refusee" } : m)));
  }

  return (
    <>
      {ouvert && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[32rem] max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-200 bg-liria-navy px-4 py-3 dark:border-neutral-700">
            <span className="text-sm font-semibold text-white">✨ Assistant Liria</span>
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

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
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
                      ? "bg-liria-navy text-white"
                      : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100")
                  }
                >
                  {m.fichierNom && <span className="mb-1 block text-xs opacity-80">📎 {m.fichierNom}</span>}
                  {m.contenu || (m.role === "assistant" && i === messages.length - 1 && pending ? "…" : "")}
                </span>
                {m.proposition && (
                  <div className="mt-1 inline-block w-full max-w-[85%] rounded-lg border border-liria-gold/60 bg-liria-gold/10 p-3 text-left text-sm">
                    <p><strong>{m.proposition.employeNom}</strong> → {m.proposition.typeActivite === "chantier" ? m.proposition.chantierNom : LIBELLES_TYPE_ACTIVITE[m.proposition.typeActivite]}</p>
                    {m.proposition.typeActivite !== "chantier" && m.proposition.lieuActivite && (
                      <p className="text-neutral-600 dark:text-neutral-300">{m.proposition.lieuActivite} · <a href={lienMaps(m.proposition.lieuActivite)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">Itinéraire</a></p>
                    )}
                    <p className="text-neutral-600 dark:text-neutral-300">{m.proposition.date} · {m.proposition.heures} h{m.proposition.tache ? ` · ${m.proposition.tache}` : ""}</p>
                    {m.propositionStatut === "en_attente" && (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => validerProposition(i)} disabled={pending} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                          Valider et créer
                        </button>
                        <button type="button" onClick={() => refuserProposition(i)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium">
                          Ignorer
                        </button>
                      </div>
                    )}
                    {m.propositionStatut === "creee" && <p className="mt-2 text-xs font-medium text-green-700">✓ Affectation créée</p>}
                    {m.propositionStatut === "refusee" && <p className="mt-2 text-xs text-neutral-500">Ignorée</p>}
                  </div>
                )}
                {m.propositionConge && (
                  <div className="mt-1 inline-block w-full max-w-[85%] rounded-lg border border-liria-gold/60 bg-liria-gold/10 p-3 text-left text-sm">
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
              </div>
            ))}
            {ecoute && <p className="text-sm text-liria-navy dark:text-liria-gold">🎙️ Je t&apos;écoute…</p>}
            {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
            <div ref={finRef} />
          </div>

          <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
            {fichierJoint && (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-liria-gold/10 px-2 py-1 text-xs">
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
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              />
              <button
                type="button"
                onClick={() => envoyer()}
                disabled={pending || (!saisie.trim() && !fichierJoint)}
                className="rounded-md bg-liria-navy px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
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
          aria-label="Assistant Liria"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-liria-gold px-4 py-3 text-sm font-semibold text-liria-navy shadow-lg hover:brightness-95"
        >
          <span aria-hidden="true">✨</span>
          <span className="hidden sm:inline">Assistant</span>
        </button>
      )}
    </>
  );
}
