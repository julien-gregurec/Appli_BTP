import json, re, sys
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/var/tmp/perf/rls/pol.json'))
M = "(ARRAY(SELECT public.entreprises_membre_actif()))"
def S(k): return f"(ARRAY(SELECT public.entreprises_avec_permission({k})))"
def U(ks): return "(ARRAY(SELECT public.entreprises_avec_une_permission(ARRAY[" + ", ".join(f"'{k}'" for k in ks) + "])))"
ARG = r"([a-z_]+\.)?[a-z_]+"
def rw(e):
    if e is None: return None
    o = e
    # Fonctions par ligne : ensembles candidats issus des seules lignes de l'utilisateur (ses fiches
    # salarié, ses équipes, ses affectations), filtrés par la fonction d'origine — exact, sans repli
    # ligne à ligne (sauf documents : repli limité aux documents des chantiers de ses équipes).
    e = re.sub(r"\bpeut_consulter_chantier\((%s), (%s)\)" % (ARG, ARG),
        lambda m: f"(({m.group(1)} = ANY {M}) AND (({m.group(1)} = ANY {U(['acces_chantiers','gerer_chantiers'])}) OR (({m.group(1)}, {m.group(3)}) IN ( SELECT x.entreprise_id, x.chantier_id FROM public.chantiers_assignes_consultables() x))))", e)
    e = re.sub(r"\bpeut_consulter_pointage_employe\((%s), (%s)\)" % (ARG, ARG),
        lambda m: f"(({m.group(1)} = ANY {U(['voir_pointages_equipe','gerer_pointage','valider_pointages'])}) OR (({m.group(1)}, {m.group(3)}) IN ( SELECT x.entreprise_id, x.employe_id FROM public.employes_du_compte_pointage_consultables() x)))", e)
    e = re.sub(r"\bpeut_consulter_affectation_employe\((%s), (%s)\)" % (ARG, ARG),
        lambda m: f"(({m.group(1)} = ANY {U(['gerer_planning','voir_pointages_equipe','voir_heures_chantiers'])}) OR (({m.group(1)}, {m.group(3)}) IN ( SELECT x.entreprise_id, x.employe_id FROM public.employes_du_compte_affectation_consultables() x)))", e)
    e = re.sub(r"\bpeut_voir_document_chantier\(id\)",
        f"((entreprise_id = ANY {M}) AND ((entreprise_id = ANY {S(chr(39)+'gerer_chantiers'+chr(39)+'::text')}) OR ((chantier_id = ANY (ARRAY( SELECT public.chantiers_equipes_du_compte()))) AND peut_voir_document_chantier(id))))", e)
    e = re.sub(r"\best_membre_actif\((%s)\)" % ARG, lambda m: f"({m.group(1)} = ANY {M})", e)
    e = re.sub(r"\ba_permission\((%s), ('[a-z_]+'::text)\)" % ARG, lambda m: f"({m.group(1)} = ANY {S(m.group(3))})", e)
    e = re.sub(r"(?<![.\w])auth\.uid\(\)", "( SELECT auth.uid() AS uid)", e)
    return e
def q(s): return "$q$" + s + "$q$" if s is not None else "NULL"
fw = open('/var/tmp/perf/rls/forward.sql','w'); bw = open('/var/tmp/perf/rls/rollback.sql','w'); gd = []
n = 0
for p in d:
    nq, nw = rw(p['q']), rw(p['w'])
    if nq == p['q'] and nw == p['w']: continue
    n += 1
    ident = f"\"{p['p']}\" ON public.{p['t']}"
    clause = lambda qq, ww: (f"\n  USING ({qq})" if qq is not None else "") + (f"\n  WITH CHECK ({ww})" if ww is not None else "")
    fw.write(f"ALTER POLICY {ident}{clause(nq, nw)};\n\n")
    bw.write(f"ALTER POLICY {ident}{clause(p['q'], p['w'])};\n\n")
    gd.append((p['t'], p['p'], p['q'], p['w']))
    for x in (nq, nw):
        if x and re.search(r"\b(est_membre_actif|a_permission)\(", x): print("RESTE", p['t'], p['p'], x, file=sys.stderr)
g = open('/var/tmp/perf/rls/guard.sql','w')
g.write("  select * from (values\n" + ",\n".join(f"    ({q(t)}, {q(pp)}, {q(qq) if qq else 'NULL'}, {q(ww) if ww else 'NULL'})" for t,pp,qq,ww in gd) + "\n  ) v(t, p, q, w)\n")
print(n, "policies rewritten")
