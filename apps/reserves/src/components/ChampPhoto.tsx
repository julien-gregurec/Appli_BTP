"use client";

import { useRef, useState } from "react";
import {
  ACCEPT_PHOTO, TAILLE_MAX_PHOTO, estMimePhotoAccepte, formaterOctets,
} from "@/lib/images";
import { compresserPhoto } from "@/lib/images-navigateur";

/**
 * Champ photo du terrain. `capture="environment"` ouvre directement l'appareil photo
 * arrière sur mobile ; l'utilisateur garde l'accès à sa photothèque et, sur ordinateur,
 * au sélecteur de fichiers habituel.
 *
 * La compression a lieu ICI, avant l'envoi : ce qui part sur le réseau est déjà une
 * image de taille raisonnable. C'est ce qui rend l'ajout de photo praticable sur une
 * connexion de chantier.
 */
export function ChampPhoto({
  nom = "photo",
  requis = false,
  libelle = "Photo",
  aide,
}: {
  nom?: string;
  requis?: boolean;
  libelle?: string;
  aide?: string;
}) {
  const entree = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [travail, setTravail] = useState(false);

  async function surChangement() {
    const champ = entree.current;
    const fichier = champ?.files?.[0];
    setErreur(null);
    if (!champ || !fichier) { setApercu(null); setDetail(null); return; }

    if (!estMimePhotoAccepte(fichier.type)) {
      setErreur(
        fichier.type === "image/heic" || fichier.type === "image/heif"
          ? "Ce format HEIC n’est pas pris en charge. Réglez votre appareil sur « Le plus compatible », ou choisissez une photo JPEG."
          : "Choisissez une image JPEG, PNG ou WEBP.",
      );
      champ.value = "";
      setApercu(null); setDetail(null);
      return;
    }
    if (fichier.size > TAILLE_MAX_PHOTO) {
      setErreur(`Cette image dépasse ${formaterOctets(TAILLE_MAX_PHOTO)}.`);
      champ.value = "";
      return;
    }

    setTravail(true);
    try {
      const compresse = await compresserPhoto(fichier);
      // Le champ envoyé au serveur porte l'image compressée, pas le cliché brut.
      const transfert = new DataTransfer();
      transfert.items.add(compresse);
      champ.files = transfert.files;
      setApercu(URL.createObjectURL(compresse));
      setDetail(
        compresse.size < fichier.size
          ? `${formaterOctets(compresse.size)} — allégée depuis ${formaterOctets(fichier.size)}`
          : formaterOctets(compresse.size),
      );
    } catch {
      // `compresserPhoto` rend déjà l'original quand elle échoue ; ce filet ne couvre
      // plus que l'aperçu lui-même.
      setApercu(URL.createObjectURL(fichier));
      setDetail(formaterOctets(fichier.size));
    } finally {
      setTravail(false);
    }
  }

  return (
    <div className="champ-photo">
      <label>
        {libelle}
        <input
          ref={entree}
          type="file"
          name={nom}
          accept={ACCEPT_PHOTO}
          capture="environment"
          required={requis}
          onChange={surChangement}
        />
      </label>
      {aide && <p className="mention" style={{ marginTop: 0 }}>{aide}</p>}
      {travail && <p className="mention">Préparation de la photo…</p>}
      {erreur && <div className="message erreur">{erreur}</div>}
      {apercu && (
        <div className="apercu-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={apercu} alt="Aperçu de la photo sélectionnée" />
          {detail && <span className="mention">{detail}</span>}
        </div>
      )}
    </div>
  );
}
