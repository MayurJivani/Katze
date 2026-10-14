#!/bin/sh
# Ship Katze to Jinx. The box keeps its own checkout at ~/apps/Katze, so the unit
# of deployment is a fast-forward of that checkout plus a rebuild. Nothing is
# copied from here, which is what makes a deploy from CI and a deploy from a
# laptop the same operation.
#
# --ff-only rather than a plain pull: if the checkout on the box has drifted,
# stop and say so rather than quietly merging something nobody wrote.
#
# Needs no privileges and no one-time installer: /etc/caddy/conf.d is setgid
# webdeploy, the Caddyfile imports conf.d/*.caddy, and `systemctl reload caddy`
# is the single NOPASSWD rule in /etc/sudoers.d/webdeploy.
#
# Re-runnable, and safe to run twice. The site block is only reinstalled when it
# actually changed, so an ordinary deploy never reloads Caddy.
set -eu
cd "$(dirname "$0")/.."

scp -q deploy/katze.caddy ssh.futile.studio:/tmp/katze.caddy.incoming
ssh ssh.futile.studio '
  set -eu
  LIVE=/etc/caddy/conf.d/katze.caddy
  IN=/tmp/katze.caddy.incoming

  if cmp -s "$IN" "$LIVE" 2>/dev/null; then
    rm -f "$IN"
  else
    # Validation has to happen with the block already imported, so keep a copy
    # of whatever was there and put it back if Caddy rejects the result. This
    # file is imported into the config that serves every other site on the box:
    # a block that fails to parse would take all of them down at the next
    # reload, whoever triggers it and for whatever reason.
    cp "$LIVE" "$IN.prev" 2>/dev/null || true
    mv "$IN" "$LIVE"
    if ! caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      if [ -f "$IN.prev" ]; then mv "$IN.prev" "$LIVE"; else rm -f "$LIVE"; fi
      echo "katze: site block rejected by caddy validate, config unchanged" >&2
      exit 1
    fi
    rm -f "$IN.prev"
    sudo -n systemctl reload caddy
    echo "katze: site block installed and caddy reloaded"
  fi

  cd ~/apps/Katze
  git pull --ff-only
  docker compose up -d --build

  # Come back and check, rather than trusting that compose meant "serving".
  sleep 5
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4331/healthz || true)
  case "$code" in
    2*) echo "katze: serving on 127.0.0.1:4331 (HTTP $code)" ;;
    *) echo "katze: not serving (HTTP $code)"; docker compose logs --tail 30; exit 1 ;;
  esac
'
echo "katze: deployed to https://katze.futile.studio"
