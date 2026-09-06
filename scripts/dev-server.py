#!/usr/bin/env python3
"""Tiny dev server for manual testing of the webapp and panel pages.

Fixes two papercuts of `python -m http.server` on Windows:
  - forces correct MIME type for .js (module scripts require text/javascript)
  - disables caching so edits show up on reload

Run from the repo root:  python scripts/dev-server.py   → http://127.0.0.1:8123
"""

import http.server
import mimetypes
import socketserver

PORT = 8123
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"FactLens dev server → http://127.0.0.1:{PORT}/webapp/index.html")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
