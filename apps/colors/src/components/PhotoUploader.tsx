"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PhotoUploader({seauId}:{seauId:string}) {
  const routeur=useRouter();const formulaire=useRef<HTMLFormElement>(null);const [message,setMessage]=useState("");const [charge,setCharge]=useState(false);
  async function envoyer(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setCharge(true);setMessage("");
    const donnees=new FormData(event.currentTarget);donnees.set("seauId",seauId);
    const reponse=await fetch("/api/photos",{method:"POST",body:donnees});const resultat=await reponse.json();
    setCharge(false);setMessage(reponse.ok
      ? resultat.nettoyageRequis
        ? resultat.nettoyageSuivi
          ? "Photo enregistrée. L’ancienne photo sera nettoyée automatiquement."
          : "Photo enregistrée, mais l’ancienne photo nécessite un nettoyage manuel."
        : "Photo enregistrée."
      : resultat.erreur??"Échec du téléversement");
    if(reponse.ok){formulaire.current?.reset();routeur.refresh();}
  }
  return <form ref={formulaire} onSubmit={envoyer} className="inline-form"><label>Photo du seau<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" required/></label><button className="primary-action" disabled={charge}>{charge?"Envoi…":"Ajouter la photo"}</button>{message&&<p className="inline-message" role="status">{message}</p>}</form>;
}
