#!/bin/sh
set -eu
app_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$app_dir/index.html"
fi
if command -v sensible-browser >/dev/null 2>&1; then
  exec sensible-browser "$app_dir/index.html"
fi
printf '%s\n' 'Open index.html in your web browser.' >&2
exit 1
