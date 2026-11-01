#!/bin/bash
# LekhaPal launcher for Mac / Linux - developed by CA Sudanshu Mallick
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8765/" 2>/dev/null || xdg-open "http://localhost:8765/") &
echo "LekhaPal is running at http://localhost:8765  (close this window to stop)"
python3 -m http.server 8765 --bind 127.0.0.1
