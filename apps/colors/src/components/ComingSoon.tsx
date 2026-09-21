import type { IconeNavigation } from "@/lib/navigation";
import { NavIcon } from "@/components/NavIcon";

export function ComingSoon({ titre, description, icon }: { titre: string; description: string; icon: IconeNavigation }) {
  return (
    <section className="coming-soon">
      <span className="coming-icon"><NavIcon name={icon}/></span>
      <span className="eyebrow">Structure préparée</span>
      <h1>{titre}</h1>
      <p>{description}</p>
      <div className="coming-note"><strong>Bientôt disponible</strong><span>Aucune fonctionnalité métier n’est simulée dans ce jalon.</span></div>
    </section>
  );
}
