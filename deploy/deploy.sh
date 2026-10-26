#!/bin/sh
# Ship Katze to Jinx. The box keeps its own checkout at /opt/apps/Katze, so the
# unit of deployment is a fast-forward of that checkout, a rebuild in place and
# a restart of the `katze` systemd unit. Nothing is copied from here, which is
# what makes a deploy from CI and a deploy from a laptop the same operation.
#
# --ff-only rather than a plain pull: if the checkout on the box has drifted,
# stop and say so rather than quietly merging something nobody wrote.
#
# The disk on Jinx is failing, so writes are kept down: the npm cache is on
# tmpfs (/tmp/npm, set in ~/.npmrc there) and dev dependencies are pruned once
# the build is done. Runtime config is /etc/apps/katze.env, read by the unit.
set -eu
ssh ssh.futile.studio '
  set -eu
  cd /opt/apps/Katze
  git pull --ff-only

  # The site block is only reinstalled when it actually changed, so an ordinary
  # deploy never reloads Caddy. conf.d is imported into the config that serves
  # every other site on the box, so a block Caddy rejects is put back before
  # anything reloads: one that fails to parse would take all of them down.
  LIVE=/etc/caddy/conf.d/katze.caddy
  if ! cmp -s deploy/katze.caddy "$LIVE"; then
    sudo -n cp "$LIVE" "$LIVE.prev" 2>/dev/null || true
    sudo -n install -m 644 deploy/katze.caddy "$LIVE"
    if ! caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      if [ -f "$LIVE.prev" ]; then sudo -n mv "$LIVE.prev" "$LIVE"; else sudo -n rm -f "$LIVE"; fi
      echo "katze: site block rejected by caddy validate, config unchanged" >&2
      exit 1
    fi
    sudo -n rm -f "$LIVE.prev"
    sudo -n systemctl reload caddy
    echo "katze: site block installed and caddy reloaded"
  fi

  HUSKY=0 npm ci --no-audit --no-fund
  npm run build
  npm prune --omit=dev
  # The box npm is older than the one that wrote the lockfile, and prune
  # rewrites it to its own dialect. Put it back so the next pull fast-forwards.
  git checkout -- package-lock.json
  sudo -n systemctl restart katze

  # Come back and check, rather than trusting that a restart meant "serving".
  sleep 5
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4331/healthz || true)
  case "$code" in
    2*) echo "katze: serving on 127.0.0.1:4331 (HTTP $code)" ;;
    *) echo "katze: not serving (HTTP $code)"; sudo -n journalctl -u katze -n 30 --no-pager; exit 1 ;;
  esac
'
echo "katze: deployed to https://katze.futile.studio"
