"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { demanderAssistantIAAction, creerAffectationDepuisPropositionAction } from "@/app/actions/assistant";
import type { MessageChat, PropositionAffectation } from "@/lib/ai/assistant";

type MessageAffiche = MessageChat & { proposition?: PropositionAffectation; propositionStatut?: "en_attente" | "creee" | "refusee" };

export function AssistantIA() {
  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState<MessageAffiche[]>([]);
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ouvert]);

  function envoyer() {
    const question = saisie.trim();
    if (!question) return;
    setErreur(null);
    const historique = [...messages, { role: "user" as const, contenu: question }];
    setMessages(historique);
    setSaisie("");
    startTransition(async () => {
      const res = await demanderAssistantIAAction(historique.map((m) => ({ role: m.role, contenu: m.contenu })));
      if ("error" in res) {
        setErreur(res.error);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          contenu: res.texte ?? "",
          proposition: res.proposition,
          propositionStatut: res.proposition ? "en_attente" : undefined,
        },
      ]);
    });
  }

  function validerProposition(index: number) {
    const message = messages[index];
    if (!message.proposition) return;
    startTransition(async () => {
      const res = await creerAffectationDepuisPropositionAction({
        employeId: message.proposition!.employeId,
        chantierId: message.proposition!.chantierId,
        date: message.proposition!.date,
        heures: message.proposition!.heures,
        tache: message.proposition!.tache,
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
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="text-white/80 hover:text-white">
              ×
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-neutral-500">
                Pose une question sur ton activité : « quels chantiers sont en retard ? », « qui est absent aujourd'hui ? »,
                « programme Julien sur le chantier Dupont demain »…
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
                  {m.contenu}
                </span>
                {m.proposition && (
                  <div className="mt-1 inline-block w-full max-w-[85%] rounded-lg border border-liria-gold/60 bg-liria-gold/10 p-3 text-left text-sm">
                    <p><strong>{m.proposition.employeNom}</strong> → {m.proposition.chantierNom}</p>
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
              </div>
            ))}
            {pending && <p className="text-sm text-neutral-400">…</p>}
            {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
            <div ref={finRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-neutral-200 p-3 dark:border-neutral-700">
            <input
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  envoyer();
                }
              }}
              placeholder="Écris ta question…"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="button"
              onClick={envoyer}
              disabled={pending || !saisie.trim()}
              className="rounded-md bg-liria-navy px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Envoyer
            </button>
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
