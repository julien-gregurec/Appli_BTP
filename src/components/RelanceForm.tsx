"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { creerRelanceAction } from "@/app/actions/suite-metier";
import { SearchableSelect } from "@/components/SearchableSelect";

export type FactureARelancer = {
  id: string;
  numero: string;
  client: string;
  chantier: string | null;
  reste: number;
  email: string | null;
  dateEcheance: string | null;
};

const champ = "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const euros = (valeur: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(valeur);

export function RelanceForm({ factures, aujourdHui }: { factures: FactureARelancer[]; aujourdHui: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [factureId, setFactureId] = useState("");
  const [niveau, setNiveau] = useState("1");
  const [canal, setCanal] = useState("email");
  const [datePrevue, setDatePrevue] = useState(aujourdHui);
  const [destinataire, setDestinataire] = useState("");
  const [sujet, setSujet] = useState("Rappel concernant votre facture");
  const [message, setMessage] = useState("");
  const [retour, setRetour] = useState<{ type: "error" | "success"; texte: string } | null>(null);
  const selectionnerFacture = (id: string) => {
    setFactureId(id);
    const selection = factures.find((item) => item.id === id);
    if (!selection) return;
    setDestinataire(selection.email ?? "");
    setSujet(`Rappel concernant la facture ${selection.numero}`);
    setMessage([
      `Bonjour ${selection.client},`, "",
      `Sauf erreur de notre part, la facture ${selection.numero} présente encore un solde de ${euros(selection.reste)} à régler${selection.dateEcheance ? ` depuis le ${new Date(`${selection.dateEcheance}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}.`,
      selection.chantier ? `Chantier concerné : ${selection.chantier}.` : null,
      "", "Merci de bien vouloir procéder à son règlement ou de nous contacter si celui-ci a déjà été effectué.", "", "Cordialement,",
    ].filter((ligne) => ligne !== null).join("\n"));
  };

  function soumettre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRetour(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const resultat = await creerRelanceAction(formData);
      if (resultat.error) {
        setRetour({ type: "error", texte: resultat.error });
        return;
      }
      setRetour({ type: "success", texte: resultat.success ?? "Relance préparée" });
      router.refresh();
      if (resultat.mailto) window.location.href = resultat.mailto;
    });
  }

  return <form onSubmit={soumettre} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
    <div className="sm:col-span-2"><h2 className="font-semibold">Préparer une relance</h2><p className="text-xs text-neutral-500">Recherchez par numéro, client ou chantier. Pour un e-mail, votre messagerie s’ouvrira avec le texte préparé.</p></div>
    {retour && <p className={`rounded p-2 text-sm sm:col-span-2 ${retour.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{retour.texte}</p>}
    <label className="text-xs sm:col-span-2">Facture<SearchableSelect name="facture_id" required value={factureId} onValueChange={selectionnerFacture} options={factures.map((item) => ({ value: item.id, label: `${item.numero} · ${item.client} · ${item.chantier ?? "Sans chantier"} · reste ${euros(item.reste)}`, search: `${item.numero} ${item.client} ${item.chantier ?? ""}` }))} placeholder="Écrire un numéro, un client ou un chantier…" className="mt-1" /></label>
    <label className="text-xs">Niveau<select name="niveau" value={niveau} onChange={(event) => setNiveau(event.target.value)} className={champ}><option value="1">1 · Rappel courtois</option><option value="2">2 · Relance</option><option value="3">3 · Mise en demeure</option><option value="4">4 · Contentieux</option></select></label>
    <label className="text-xs">Canal<select name="canal" value={canal} onChange={(event) => setCanal(event.target.value)} className={champ}><option value="email">E-mail</option><option value="sms">SMS</option><option value="courrier">Courrier</option><option value="telephone">Téléphone</option></select></label>
    <label className="text-xs">Date prévue<input required type="date" name="date_prevue" value={datePrevue} onChange={(event) => setDatePrevue(event.target.value)} className={champ}/></label>
    <label className="text-xs">Destinataire<input name="destinataire" type="email" required={canal === "email"} value={destinataire} onChange={(event) => setDestinataire(event.target.value)} className={champ}/></label>
    <label className="text-xs sm:col-span-2">Sujet<input name="sujet" value={sujet} onChange={(event) => setSujet(event.target.value)} className={champ}/></label>
    <label className="text-xs sm:col-span-2">Message<textarea name="message" rows={6} value={message} onChange={(event) => setMessage(event.target.value)} className={champ}/></label>
    <button disabled={pending || !factureId} className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2">{pending ? "Préparation…" : canal === "email" ? "Préparer et ouvrir ma messagerie" : "Programmer la relance"}</button>
  </form>;
}
