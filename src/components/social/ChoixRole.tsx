"use client";

import { useState } from "react";
import { definirRoleAction } from "@/app/actions/social";
import { ROLES_SOCIAL } from "@/lib/social/roles";
import { BoutonAction } from "@/components/social/BoutonAction";

export function ChoixRole({ email, role }: { email: string; role: string }) {
  const [valeur, setValeur] = useState(role);
  return (
    <span className="flex flex-wrap items-start gap-2">
      <select aria-label={`Rôle de ${email}`} value={valeur} onChange={(e) => setValeur(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900">
        {ROLES_SOCIAL.map((r) => <option key={r.cle} value={r.cle}>{r.libelle}</option>)}
      </select>
      <BoutonAction libelle="Enregistrer" action={() => definirRoleAction(email, valeur)} />
    </span>
  );
}
