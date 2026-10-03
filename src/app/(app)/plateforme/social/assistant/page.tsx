import { contexteSocial } from "@/lib/social/acces";
import { peut } from "@/lib/social/roles";
import { AccesRefuse } from "@/components/social/AccesRefuse";
import { AssistantSocial } from "@/components/social/AssistantSocial";
import { SocialEntete } from "@/components/social/SocialEntete";

export const metadata = { title: "Assistant Social — ELSATIA Social" };

export default async function AssistantPage() {
  const ctx = await contexteSocial();
  if (!ctx || !peut(ctx.role, "rediger")) return <AccesRefuse />;
  return (
    <main className="p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <SocialEntete titre="Assistant Social ELSATIA" role={ctx.role} actif="/plateforme/social/assistant" description="Sujets, calendrier éditorial, textes par réseau, hashtags, appels à l’action, analyse et réponses : toujours des propositions, jamais d’envoi automatique." />
        <AssistantSocial />
        <p className="text-xs text-neutral-500">La génération des textes par réseau, la reformulation, le raccourcissement, les hashtags et l’appel à l’action se trouvent dans l’éditeur de publication. L’analyse des performances est dans Statistiques ; les réponses aux commentaires dans Commentaires.</p>
      </div>
    </main>
  );
}
