// ELSATIA — Pack opérateur V9 : classement de réversibilité des migrations (Phase K).
//
// Déterminé DEPUIS LE SQL : les corps de fonctions et blocs `$tag$ … $tag$` sont retirés, puis
// chaque instruction de PREMIER NIVEAU est typée. Un bloc `do $$ … $$` est analysé par son
// contenu. Le dépôt ne contient AUCUN script « down » : « REVERSIBLE » ne veut pas dire qu'un
// retour SQL est fourni, mais que la migration ne touche ni données ni structure de table.
//
//   REVERSIBLE        fonctions (create or replace), droits, policies, index, commentaires :
//                     rien d'écrit dans les données ; laisser en place sous le code V8 est sûr
//                     (signatures conservées), un retour éventuel = rejouer la définition
//                     antérieure, jamais nécessaire au rollback code.
//   FORWARD_ONLY      ajoute schéma / table / colonne / trigger / lignes de référence : additif,
//                     compatible avec le code V8, mais le retirer détruirait ce qui a été écrit
//                     depuis → on ne le retire pas ; seul un retour COMPLET passe par restauration.
//   RESTORE_REQUIRED  modifie ou supprime des données ou de la structure existante au niveau
//                     supérieur (update / delete / truncate / drop table|column|type, alter … type) :
//                     seul une restauration du backup revient à l'état antérieur.

const ORDRE = { REVERSIBLE: 0, FORWARD_ONLY: 1, RESTORE_REQUIRED: 2 };

/** Retire commentaires, chaînes et corps dollar-quotés ; renvoie le texte + les corps `do`. */
export function niveauSuperieur(sql) {
  let out = "";
  const corpsDo = [];
  let i = 0;
  const s = String(sql);
  while (i < s.length) {
    const c = s[i];
    if (c === "-" && s[i + 1] === "-") { const j = s.indexOf("\n", i); i = j === -1 ? s.length : j; continue; }
    if (c === "/" && s[i + 1] === "*") { const j = s.indexOf("*/", i + 2); i = j === -1 ? s.length : j + 2; continue; }
    if (c === "'") { let j = i + 1; while (j < s.length) { if (s[j] === "'" && s[j + 1] === "'") { j += 2; continue; } if (s[j] === "'") break; j += 1; } out += "''"; i = j + 1; continue; }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i));
      if (m) {
        const tag = m[0];
        const fin = s.indexOf(tag, i + tag.length);
        const corps = s.slice(i + tag.length, fin === -1 ? s.length : fin);
        // Un bloc `do` : son contenu est exécuté à la migration → analysé.
        if (/\bdo\s*$/i.test(out.slice(-40))) corpsDo.push(corps);
        out += " $corps$ ";
        i = fin === -1 ? s.length : fin + tag.length;
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return { texte: out, corpsDo };
}

const REGLES = [
  // [type, motif sur l'instruction normalisée]
  ["DESTRUCTIF", /^drop\s+(table|schema|type|view|materialized\s+view|sequence|column|extension)\b/],
  ["DESTRUCTIF", /^alter\s+table\b.*\b(drop\s+column|drop\s+constraint|alter\s+column\b.*\btype\b|rename\b)/],
  ["DONNEES_MODIFIEES", /^(update|delete|truncate|merge)\b/],
  ["DONNEES_MODIFIEES", /^with\b.*\b(update|delete)\b/],
  ["DONNEES_AJOUTEES", /^insert\s+into\b/],
  ["STRUCTURE_AJOUTEE", /^create\s+(schema|table|sequence|type|view|materialized\s+view|extension)\b/],
  ["STRUCTURE_AJOUTEE", /^alter\s+table\b.*\b(add\s+column|add\s+constraint|enable\s+row\s+level\s+security|force\s+row\s+level\s+security)\b/],
  ["TRIGGER", /^(create(\s+or\s+replace)?(\s+constraint)?\s+trigger|drop\s+trigger)\b/],
  ["APPEL", /^(select|perform)\b/],
  ["FONCTION", /^(create(\s+or\s+replace)?\s+(function|procedure)|drop\s+(function|procedure)|alter\s+function)\b/],
  ["POLICY", /^(create|drop|alter)\s+policy\b/],
  ["INDEX", /^(create(\s+unique)?\s+index|drop\s+index)\b/],
  ["INDEX", /^(create|drop|alter)\s+statistics\b/], // statistiques étendues du planificateur
  ["DROITS", /^(grant|revoke|alter\s+default\s+privileges)\b/],
  ["META", /^(comment\s+on|notify|set|reset|begin|commit|analyze|do)\b/],
  ["META", /^lock\s+table\b/], // verrou de transaction : n'écrit rien (libéré au COMMIT / ROLLBACK)
];

/** Instructions de premier niveau, typées. */
export function instructions(sql) {
  const { texte, corpsDo } = niveauSuperieur(sql);
  const res = [];
  for (const brut of texte.split(";")) {
    const n = brut.replace(/\s+/g, " ").trim().toLowerCase();
    if (!n) continue;
    const regle = REGLES.find(([, m]) => m.test(n));
    res.push({ type: regle ? regle[0] : "INCONNU", debut: n.slice(0, 80) });
  }
  // Contenu des blocs `do` : instructions dynamiques (execute format(...)) et directes.
  for (const corps of corpsDo) {
    const sousTexte = corps.replace(/execute\s+format\s*\(\s*'([^']*)'/gi, ";$1;").replace(/\bexecute\s+'([^']*)'/gi, ";$1;");
    for (const sous of instructions(sousTexte.replace(/\bbegin\b|\bend\b|\bloop\b|\bdeclare\b/gi, ";"))) {
      if (sous.type === "INCONNU" || sous.type === "META") continue;
      res.push({ ...sous, type: sous.type, dansDo: true });
    }
  }
  return res;
}

const TYPE_CLASSE = {
  DESTRUCTIF: "RESTORE_REQUIRED",
  DONNEES_MODIFIEES: "RESTORE_REQUIRED",
  INCONNU: "RESTORE_REQUIRED", // inconnu = traité comme le pire (conservateur)
  DONNEES_AJOUTEES: "FORWARD_ONLY",
  STRUCTURE_AJOUTEE: "FORWARD_ONLY",
  TRIGGER: "FORWARD_ONLY",
  APPEL: "FORWARD_ONLY",
  FONCTION: "REVERSIBLE",
  POLICY: "REVERSIBLE",
  INDEX: "REVERSIBLE",
  DROITS: "REVERSIBLE",
  META: "REVERSIBLE",
};

/** Classe une migration. */
export function classerMigration(sql) {
  const inst = instructions(sql);
  const types = [...new Set(inst.map((x) => x.type))];
  let classe = "REVERSIBLE";
  for (const t of types) if (ORDRE[TYPE_CLASSE[t]] > ORDRE[classe]) classe = TYPE_CLASSE[t];
  const fonctions = [...String(sql).matchAll(/create\s+or\s+replace\s+function\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  return { classe, types, fonctions: [...new Set(fonctions)], nbInstructions: inst.length };
}

/**
 * Notes de retour arrière qui ne se déduisent pas d'un motif SQL (sécurité, ordre DB → code).
 * Chaque note est justifiée dans docs/runbooks/ELSATIA_V9_PREVIEW_ROLLBACK.md.
 */
export const NOTES_RETOUR = Object.freeze({
  "20261002001001": "CORRECTIF DE SÉCURITÉ (lecture fail-open fermée) : ne JAMAIS rejouer les anciennes policies, même en rollback code.",
  "20261002001112": "Registre des clés + garde d'écriture : le code V8 écrit en v1 (k1), accepté par la garde ; laisser en place.",
  "20261002001113": "Limiteur de connexion : requis par le code V9 (login fail-closed sans lui) ; sans effet sur le code V8.",
  "20261002000901": "Preuves d'acceptation légale (append-only) : ne jamais supprimer, même en rollback.",
  "20261003000103": "Données de référence LOCALES (url_locale de Réserves) mises à jour seulement si encore à la valeur d'origine ; sans effet sur l'accès : laisser en place.",
  "20261003001406": "Recalcul unique du cache du tableau de bord (donnée dérivée, idempotent) : aucune restauration nécessaire, laisser en place.",
  "20261003000201": "Pont d'upgrade PRODUCTION (phase 0) : no-op en Preview (20260921000300 déjà au ledger) ; aucun retour à prévoir.",
  "20261003000202": "Pont d'upgrade PRODUCTION (contrôle final) : no-op en Preview si les lignes sont conformes, échec propre sinon ; aucun retour à prévoir.",
  "20261003001407": "Confidentialité du coût horaire : ne JAMAIS rouvrir la colonne (ni grant, ni retour arrière), même en rollback code.",
  "20261003001501": "File push durable : retour arrière scripts/perf/hardening/rollback/rollback_20261003001501.sql (décision humaine).",
  "20261003001503": "RLS 13 tables : verrous ACCESS EXCLUSIVE pris d'un coup (lock_timeout 10 s) — un échec est propre (transaction annulée, ledger inchangé) et rejouable ; retour arrière scripts/perf/hardening/rollback/rollback_20261003001503.sql.",
});

/** Classement de la liste de migrations { version, name, sql }. */
export function classerTrain(migrations) {
  return migrations.map((m) => ({ version: m.version, name: m.name, ...classerMigration(m.sql), note: NOTES_RETOUR[m.version] ?? "" }));
}
