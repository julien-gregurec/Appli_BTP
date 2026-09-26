"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajouterPhotoCompteRenduAction, supprimerPhotoCompteRenduAction } from "@/app/actions/documents";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

const PHOTOS_MAX = 8;

export function PhotosCompteRendu({
  chantierId,
  compteRenduId,
  photos,
}: {
  chantierId: string;
  compteRenduId: string;
  photos: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function ajouter(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    setErreur(null);
    startTransition(async () => {
      for (const fichier of Array.from(fichiers)) {
        const formData = new FormData();
        formData.set("fichier", fichier);
        const resultat = await ajouterPhotoCompteRenduAction(chantierId, compteRenduId, formData);
        if ("error" in resultat) {
          setErreur(resultat.error);
          break;
        }
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      {erreur && <p className="text-xs text-red-700">{erreur}</p>}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/documents/${photo.id}`} alt={photo.nom} className="h-20 w-full object-cover" />
              <form action={supprimerPhotoCompteRenduAction.bind(null, chantierId, photo.id)} className="absolute inset-x-0 bottom-0 bg-black/60 opacity-0 group-hover:opacity-100">
                <ConfirmSubmitButton message={`Retirer la photo « ${photo.nom} » de ce compte-rendu ?`} className="w-full py-1 text-xs text-white">
                  Retirer
                </ConfirmSubmitButton>
              </form>
            </div>
          ))}
        </div>
      )}
      {photos.length < PHOTOS_MAX && (
        <label className="inline-block cursor-pointer text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
          {pending ? "Envoi…" : "+ Ajouter une photo"}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            multiple
            disabled={pending}
            className="sr-only"
            onChange={(event) => ajouter(event.target.files)}
          />
        </label>
      )}
    </div>
  );
}
