// Puits SMTP local (tests uniquement) : accepte tout, n'envoie rien.
import { createServer } from "node:net";
createServer((socket) => {
  let data = false;
  socket.write("220 sink ESMTP\r\n");
  socket.on("data", (chunk) => {
    for (const line of chunk.toString().split("\r\n")) {
      if (!line) continue;
      if (data) {
        if (line === ".") {
          data = false;
          socket.write("250 OK\r\n");
        }
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO" || cmd === "HELO") socket.write("250 sink\r\n");
      else if (cmd === "DATA") {
        data = true;
        socket.write("354 go\r\n");
      } else if (cmd === "QUIT") socket.end("221 bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
  socket.on("error", () => {});
}).listen(2500, "127.0.0.1");
