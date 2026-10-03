// Faux serveur « Responses API » pour la recette locale : réponses déterministes.
import http from "node:http";
const texteUtilisateur = (input) => {
  const msg = [...(input ?? [])].reverse().find((m) => m.role === "user");
  return typeof msg?.content === "string" ? msg.content : "";
};
http.createServer((req, res) => {
  let corps = "";
  req.on("data", (c) => (corps += c));
  req.on("end", () => {
    const b = JSON.parse(corps || "{}");
    const outil = b.tool_choice?.name ?? "";
    const source = texteUtilisateur(b.input).split("Texte principal :\n").pop().split("Texte :\n").pop().trim();
    const phrase = source.split(/(?<=[.!?])\s/)[0];
    const args = {
      proposer_variantes: { facebook: `Bonne nouvelle pour les entreprises du bâtiment ! ${source}\n\nDécouvrez-le dès maintenant.`, instagram: `${phrase} ✨\n\nLien dans la bio.\n\n#ELSATIA #BTP #Chantier #Logiciel`, linkedin: `Dirigeants et conducteurs de travaux : ${source}\n\nUn gain de temps concret pour vos équipes.\n\n#ELSATIA #BTP #Productivité`, hashtags: ["#ELSATIA", "#BTP"], cta: "Demander une démonstration" },
      texte_propose: { texte: `${source.slice(0, Math.max(40, Math.floor(source.length * 0.6)))}…` },
      reponse_proposee: { texte: "Merci pour votre message ! Notre équipe vous répond au plus vite par message privé." },
    }[outil] ?? {};
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "resp_test", object: "response", created_at: Math.floor(Date.now() / 1000), status: "completed", model: b.model, output: outil ? [{ type: "function_call", id: "fc_1", call_id: "call_1", name: outil, arguments: JSON.stringify(args), status: "completed" }] : [{ type: "message", id: "m1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Analyse de test.", annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }));
  });
}).listen(4010);
