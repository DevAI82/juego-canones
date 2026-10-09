import http.server
import os
import sys

# Static file server for testing (python tools/serve_nocache.py game 8421;
# .claude/launch.json's "td-test") that never lets the browser cache --
# plain `python -m http.server` sends Last-Modified, so a reload can keep
# running stale JS modules after an edit.
class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    os.chdir(sys.argv[1])
    port = int(sys.argv[2])
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
