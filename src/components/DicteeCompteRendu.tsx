"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { structurerCompteRenduIAAction, enregistrerCompteRenduAction } from "@/app/actions/comptesRendus";

type ReconnaissanceVocale = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function DicteeCompteRendu({ chantierId }: { chantierId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ecoute, setEcoute] = useState(false);
  const [supporte, setSupporte] = useState(true);
  const [transcription, setTranscription] = useState("");
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const reconnaissanceRef = useRef<ReconnaissanceVocale | null>(null);

  useEffect(() => {
    type FenetreAvecReco = Window & {
      SpeechRecognition?: new () => ReconnaissanceVocale;
      webkitSpeechRecognition?: new () => ReconnaissanceVocale;
    };
    const fenetre = window as FenetreAvecReco;
    const Ctor = fenetre.SpeechRecognition ?? fenetre.webkitSpeechRecognition;
    if (!Ctor) {
      setSupporte(false);
      return;
    }
    const reco = new Ctor();
    reco.lang = "fr-FR";
    reco.continuous = true;
    reco.interimResults = true;
    reco.onresult = (event) => {
      let texte = "";
      for (let i = 0; i < event.results.length; i++) texte += event.results[i][0].transcript;
      setTranscription(texte);
    };
    reco.onerror = () => setEcoute(false);
    reco.onend = () => setEcoute(false);
    reconnaissanceRef.current = reco;
  }, []);

  function basculerEcoute() {
    if (!reconnaissanceRef.current) return;
    if (ecoute) {
      reconnaissanceRef.current.stop();
      setEcoute(false);
    } else {
      setErreur(null);
      reconnaissanceRef.current.start();
      setEcoute(true);
    }
  }

  function structurer() {
    setErreur(null);
    startTransition(async () => {
      const res = await structurerCompteRenduIAAction(transcription);
      if ("error" in res && res.error) {
        setErreur(res.error);
        return;
      }
      setTitre(res.titre ?? "");
      setContenu(res.contenu ?? "");
    });
  }

  function enregistrer() {
    setErreur(null);
    startTransition(async () => {
      const res = await enregistrerCompteRenduAction(chantierId, titre, contenu, transcription);
      if ("error" in res && res.error) {
        setErreur(res.error);
        return;
      }
      setTranscription("");
      setTitre("");
      setContenu("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-liria-gold/60 bg-liria-gold/5 p-4">
      <div>
        <h2 className="font-semibold">✨ Compte-rendu par dictée</h2>
        <p className="text-sm text-neutral-500">
          {supporte ? "Dicte ce qui a été fait aujourd'hui, l'IA en fait un compte-rendu propre." : "Dictée non disponible sur ce navigateur : écris directement ton compte-rendu."}
        </p>
      </div>

      {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

      <div className="space-y-2">
        {supporte && (
          <button
            type="button"
            onClick={basculerEcoute}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${ecoute ? "bg-red-600" : "bg-liria-navy"}`}
          >
            {ecoute ? "⏹ Arrêter la dictée" : "🎙️ Dicter"}
          </button>
        )}
        <textarea
          rows={4}
          value={transcription}
          onChange={(e) => setTranscription(e.target.value)}
          placeholder="Aujourd'hui nous avons terminé les cloisons du bureau 2, il manque encore les prises électriques…"
          className={input}
        />
        <button type="button" onClick={structurer} disabled={pending || !transcription.trim()} className="rounded-md bg-liria-navy px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "…" : "✨ Structurer avec l'IA"}
        </button>
      </div>

      {(titre || contenu) && (
        <div className="space-y-2 border-t border-liria-gold/40 pt-3">
          <label className="block text-xs text-neutral-500">
            Titre
            <input value={titre} onChange={(e) => setTitre(e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="block text-xs text-neutral-500">
            Compte-rendu
            <textarea rows={6} value={contenu} onChange={(e) => setContenu(e.target.value)} className={`${input} mt-1`} />
          </label>
          <button type="button" onClick={enregistrer} disabled={pending || !contenu.trim()} className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? "Enregistrement…" : "Enregistrer le compte-rendu"}
          </button>
        </div>
      )}
    </div>
  );
}
