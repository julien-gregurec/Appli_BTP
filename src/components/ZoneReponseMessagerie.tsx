"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suggererReponseIAAction } from "@/app/actions/messagerie";
import {
  MESSAGERIE_MEDIA_MIME_TYPES,
  MESSAGERIE_MEDIA_NOMBRE_MAX,
  resoudreMimeMediaMessagerie,
  validerMediaMessagerie,
} from "@/lib/messagerie-medias";
import { createClient } from "@/lib/supabase/client";

export function ZoneReponseMessagerie({
  conversationId,
  actionEnvoyer,
  peutUtiliserIA = true,
}: {
  conversationId: string;
  actionEnvoyer: (formData: FormData) => void;
  peutUtiliserIA?: boolean;
}) {
  const router = useRouter();
  const inputFichiers = useRef<HTMLInputElement>(null);
  const [contenu, setContenu] = useState("");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [envoiMedia, setEnvoiMedia] = useState(false);
  const [pendingIA, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function suggerer() {
    setErreur(null);
    startTransition(async () => {
      const res = await suggererReponseIAAction(conversationId);
      if ("error" in res) {
        setErreur(res.error);
        return;
      }
      setContenu(res.brouillon);
    });
  }

  function selectionnerFichiers(liste: FileList | null) {
    setErreur(null);
    const selection = Array.from(liste ?? []);
    if (selection.length > MESSAGERIE_MEDIA_NOMBRE_MAX) {
      setErreur("Vous pouvez envoyer au maximum cinq photos ou vidéos à la fois.");
      setFichiers([]);
      return;
    }
    for (const fichier of selection) {
      const mime = resoudreMimeMediaMessagerie(fichier.name, fichier.type);
      const validation = validerMediaMessagerie({
        nom: fichier.name,
        mime,
        taille: fichier.size,
      });
      if (validation) {
        setErreur(`${fichier.name} : ${validation}.`);
        setFichiers([]);
        return;
      }
    }
    setFichiers(selection);
  }

  async function nettoyer(paths: string[]) {
    if (paths.length === 0) return;
    await fetch("/api/messagerie/pieces-jointes/preparer", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, paths }),
    }).catch(() => undefined);
  }

  async function envoyerAvecMedias(event: FormEvent<HTMLFormElement>) {
    if (fichiers.length === 0) {
      if (!contenu.trim()) {
        event.preventDefault();
        setErreur("Écrivez un message ou ajoutez une photo ou une vidéo.");
      }
      return;
    }
    event.preventDefault();
    setErreur(null);
    setEnvoiMedia(true);
    const supabase = createClient();
    const paths: string[] = [];
    const pieces: Array<{
      path: string;
      nom: string;
      mime: string;
      type: "image" | "video";
      taille: number;
    }> = [];
    try {
      for (const fichier of fichiers) {
        const mime = resoudreMimeMediaMessagerie(fichier.name, fichier.type);
        const preparation = await fetch("/api/messagerie/pieces-jointes/preparer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId,
            nom: fichier.name,
            mime,
            taille: fichier.size,
          }),
        });
        const resultat = await preparation.json() as {
          error?: string;
          path?: string;
          token?: string;
          type?: "image" | "video";
        };
        if (!preparation.ok || !resultat.path || !resultat.token || !resultat.type) {
          throw new Error(resultat.error ?? "Impossible de préparer le fichier");
        }
        paths.push(resultat.path);
        const { error: uploadError } = await supabase.storage
          .from("messagerie-medias")
          .uploadToSignedUrl(resultat.path, resultat.token, fichier, {
            contentType: mime,
          });
        if (uploadError) throw new Error("Le téléversement du média a échoué");
        pieces.push({
          path: resultat.path,
          nom: fichier.name,
          mime,
          type: resultat.type,
          taille: fichier.size,
        });
      }

      const publication = await fetch("/api/messagerie/pieces-jointes/finaliser", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, contenu, pieces }),
      });
      const resultat = await publication.json() as { error?: string };
      if (!publication.ok) throw new Error(resultat.error ?? "Le message n’a pas pu être publié");
      setContenu("");
      setFichiers([]);
      if (inputFichiers.current) inputFichiers.current.value = "";
      router.refresh();
    } catch (cause) {
      await nettoyer(paths);
      setErreur(cause instanceof Error ? cause.message : "L’envoi a échoué");
    } finally {
      setEnvoiMedia(false);
    }
  }

  return (
    <form action={actionEnvoyer} onSubmit={envoyerAvecMedias} className="border-t p-3">
      {erreur && <p className="mb-2 text-xs text-red-600">{erreur}</p>}
      {fichiers.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {fichiers.map((fichier) => (
            <span key={`${fichier.name}-${fichier.lastModified}`} className="max-w-full truncate rounded-full bg-neutral-100 px-3 py-1 text-xs dark:bg-neutral-800">
              {fichier.type.startsWith("video/") ? "🎬" : "📷"} {fichier.name}
            </span>
          ))}
          <button
            type="button"
            className="text-xs text-red-600 hover:underline"
            onClick={() => {
              setFichiers([]);
              if (inputFichiers.current) inputFichiers.current.value = "";
            }}
          >
            Retirer
          </button>
        </div>
      )}
      <input
        ref={inputFichiers}
        type="file"
        multiple
        accept={MESSAGERIE_MEDIA_MIME_TYPES.join(",")}
        onChange={(event) => selectionnerFichiers(event.target.files)}
        className="sr-only"
        aria-label="Ajouter des photos ou des vidéos"
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          name="contenu"
          maxLength={5000}
          rows={2}
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          placeholder="Écrire un message…"
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
        />
        <div className="flex flex-row gap-2 self-end sm:flex-col">
          <button
            type="button"
            onClick={() => inputFichiers.current?.click()}
            disabled={envoiMedia}
            className="rounded border px-3 py-2 text-xs font-medium disabled:opacity-50"
          >
            📎 Photo / vidéo
          </button>
          {peutUtiliserIA && (
            <button type="button" onClick={suggerer} disabled={pendingIA || envoiMedia} className="rounded border px-3 py-2 text-xs font-medium text-[#9a7625] disabled:opacity-50">
              {pendingIA ? "…" : "✨ Suggérer"}
            </button>
          )}
          <button disabled={envoiMedia} className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {envoiMedia ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">Jusqu’à 5 photos ou vidéos courtes · 20 Mo maximum par fichier.</p>
    </form>
  );
}
