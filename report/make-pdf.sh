#!/bin/sh
# Builds ../report.pdf from report.html with headless Chrome.
# macOS path below; set CHROME=/path/to/chrome on other systems.
cd "$(dirname "$0")"
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE=$(mktemp -d)
"$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" \
  --no-pdf-header-footer --print-to-pdf="$PWD/../report.pdf" "file://$PWD/report.html"
rm -rf "$PROFILE"
