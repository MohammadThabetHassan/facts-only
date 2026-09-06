// Loopback HTTP-CONNECT proxy: lets git reach github.com when a security
// product blocks outbound connections from git-remote-https.exe but allows
// loopback connections. TLS stays end-to-end between git and GitHub
// (the proxy only relays the tunnelled bytes).
//
// Usage: node scripts/dev-git-tunnel.mjs [listenPort]   (default 8899)
// Then:  git -c http.proxy=http://127.0.0.1:8899 push …

import net from "node:net";

const PORT = Number(process.argv[2] || 8899);
const TARGET_HOST = "github.com";
const TARGET_PORT = 443;

const server = net.createServer((client) => {
  client.once("data", (chunk) => {
    const request = chunk.toString("latin1");
    const match = request.match(/^CONNECT\s+([^\s:]+):(\d+)/i);
    if (!match || match[1] !== TARGET_HOST) {
      client.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      client.destroy();
      return;
    }
    client.write("HTTP/1.1 200 Connection established\r\n\r\n");
    // raw TCP relay — TLS is end-to-end between git and GitHub
    const upstream = net.connect({ host: TARGET_HOST, port: TARGET_PORT }, () => {
      console.log(`tunnel established → ${TARGET_HOST}:${TARGET_PORT}`);
    });
    upstream.on("error", (e) => {
      console.error("upstream error:", e.message);
      client.destroy();
    });
    client.pipe(upstream);
    upstream.pipe(client);
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
  });
  client.on("error", () => {});
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`git tunnel listening on http://127.0.0.1:${PORT} → ${TARGET_HOST}:${TARGET_PORT}`);
});
