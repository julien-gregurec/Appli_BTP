import json, subprocess, sys
C="accessconv-pg2"; B="http://localhost:9999"
def call(method, path, body=None, token=None):
    cmd=["docker","exec",C,"curl","-s","-o","/dev/stdout","-w","\n%{http_code}","-X",method,B+path,"-H","Content-Type: application/json","-H","apikey: anon"]
    if token: cmd+=["-H","Authorization: Bearer "+token]
    if body is not None: cmd+=["-d",json.dumps(body)]
    out=subprocess.run(cmd,capture_output=True,text=True).stdout
    txt,_,code=out.rpartition("\n")
    try: j=json.loads(txt) if txt.strip() else {}
    except Exception: j={"raw":txt[:120]}
    return int(code), j
def show(label, code, j):
    extra = j.get("error_code") or j.get("msg") or j.get("error") or ""
    print(f"{label:<62} HTTP {code} {extra}")
email="logout-scopes@audit.test"; pw="Audit-passw0rd!"
c,j=call("POST","/signup",{"email":email,"password":pw}); show("signup (compte fictif, base jetable)",c,j)
def login(name):
    c,j=call("POST","/token?grant_type=password",{"email":email,"password":pw}); show(f"connexion « {name} » (une session par application)",c,j)
    return {"at":j["access_token"],"rt":j["refresh_token"]}
gp=login("Gestion Pro"); colors=login("Colors"); reserves=login("Réserves")
print("-- Colors refuse l'accès : signOut({ scope:'local' }) sur la session Colors")
c,j=call("POST","/logout?scope=local",token=colors["at"]); show("POST /logout?scope=local (session Colors)",c,j)
c,j=call("GET","/user",token=colors["at"]); show("  session Colors : GET /user avec son jeton d'accès",c,j)
c,j=call("POST","/token?grant_type=refresh_token",{"refresh_token":colors["rt"]}); show("  session Colors : refresh du refresh token",c,j)
c,j=call("GET","/user",token=gp["at"]); show("  session GP : GET /user (toujours valide ?)",c,j)
c,j=call("POST","/token?grant_type=refresh_token",{"refresh_token":gp["rt"]}); show("  session GP : refresh",c,j)
if c==200: gp={"at":j["access_token"],"rt":j["refresh_token"]}
c,j=call("POST","/token?grant_type=refresh_token",{"refresh_token":reserves["rt"]}); show("  session Réserves : refresh",c,j)
if c==200: reserves={"at":j["access_token"],"rt":j["refresh_token"]}
print("-- Comportement ACTUEL : signOut() sans option = scope global, déclenché par un refus dans une app")
colors2=login("Colors (2e tentative)")
c,j=call("POST","/logout?scope=global",token=colors2["at"]); show("POST /logout?scope=global (refus Colors, code actuel)",c,j)
c,j=call("GET","/user",token=gp["at"]); show("  session GP : GET /user après le logout global",c,j)
c,j=call("POST","/token?grant_type=refresh_token",{"refresh_token":gp["rt"]}); show("  session GP : refresh après le logout global",c,j)
c,j=call("POST","/token?grant_type=refresh_token",{"refresh_token":reserves["rt"]}); show("  session Réserves : refresh après le logout global",c,j)
