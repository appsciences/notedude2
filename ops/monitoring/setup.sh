#!/usr/bin/env bash
# Uptime check and Cloud Monitoring alerts for a notedude Firebase project (#225).
#
# Creates, in the given project:
#   - an email notification channel (or uses one you pass with --channel)
#   - an HTTPS uptime check on the site, every 5 minutes from several regions
#   - alert policies: site down, Firestore read spike, Firestore write spike,
#     Firestore rules denying requests (policies/*.json)
#
# Safe to re-run: anything that already exists (matched by display name) is left alone.
# Run it once per environment, e.g.
#
#   ops/monitoring/setup.sh --project notedude2 --host app.notedude.app --email you@example.com
#   ops/monitoring/setup.sh --project notedude2-staging --env staging \
#       --host notedude2-staging.web.app --email you@example.com
#
# Needs: gcloud signed in as an owner/editor of the project (`gcloud auth login`), and the
# gcloud beta component for creating the email channel (`gcloud components install beta`),
# unless you pass --channel. --dry-run prints what would be created and changes nothing.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

PROJECT=""
ENV_NAME="production"
HOST=""
EMAIL=""
CHANNEL=""
DRY_RUN=false
# Thresholds are per hour, for the whole project. Pick them well above normal use: they are
# a guard against runaway loops and abuse, not a usage report. Tune after a week of data.
READS_PER_HOUR=50000
WRITES_PER_HOUR=10000
DENIES_PER_HOUR=500

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  cat <<EOF

Options:
  --project ID            Firebase / Google Cloud project id (required)
  --host HOST             site host to check (required), e.g. app.notedude.app
  --email ADDRESS         where alerts go (required unless --channel)
  --channel NAME          existing channel, projects/ID/notificationChannels/N
  --env NAME              label used in alert names (default: production)
  --reads-per-hour N      default $READS_PER_HOUR
  --writes-per-hour N     default $WRITES_PER_HOUR
  --denies-per-hour N     default $DENIES_PER_HOUR
  --dry-run               print the plan and the rendered policies, change nothing
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --channel) CHANNEL="$2"; shift 2 ;;
    --env) ENV_NAME="$2"; shift 2 ;;
    --reads-per-hour) READS_PER_HOUR="$2"; shift 2 ;;
    --writes-per-hour) WRITES_PER_HOUR="$2"; shift 2 ;;
    --denies-per-hour) DENIES_PER_HOUR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

die() { echo "error: $*" >&2; exit 1; }
[[ -n "$PROJECT" ]] || die "--project is required"
[[ -n "$HOST" ]] || die "--host is required"
[[ -n "$EMAIL" || -n "$CHANNEL" ]] || die "--email or --channel is required"
for n in "$READS_PER_HOUR" "$WRITES_PER_HOUR" "$DENIES_PER_HOUR"; do
  [[ "$n" =~ ^[0-9]+$ ]] || die "thresholds must be whole numbers, got '$n'"
done

g() { gcloud --project "$PROJECT" --quiet "$@"; }
run() {
  if $DRY_RUN; then echo "[dry-run] gcloud --project $PROJECT $*"; else g "$@"; fi
}

# Substitute ${VAR} placeholders in a policy template. Only the names below are replaced, so
# nothing else in the JSON is touched.
render() {
  sed \
    -e "s|\${ENV}|$ENV_NAME|g" \
    -e "s|\${HOST}|$HOST|g" \
    -e "s|\${CHANNEL}|$CHANNEL|g" \
    -e "s|\${UPTIME_CHECK_ID}|$UPTIME_CHECK_ID|g" \
    -e "s|\${READS_PER_HOUR}|$READS_PER_HOUR|g" \
    -e "s|\${WRITES_PER_HOUR}|$WRITES_PER_HOUR|g" \
    -e "s|\${DENIES_PER_HOUR}|$DENIES_PER_HOUR|g" \
    "$1"
}

echo "== notedude monitoring for project $PROJECT ($ENV_NAME), site https://$HOST/"

echo "-- enabling the Cloud Monitoring API"
run services enable monitoring.googleapis.com

if [[ -z "$CHANNEL" ]]; then
  CHANNEL_NAME="notedude alerts ($EMAIL)"
  existing=""
  $DRY_RUN || existing="$(g beta monitoring channels list \
    --filter="displayName=\"$CHANNEL_NAME\"" --format='value(name)' | head -n1)"
  if [[ -n "$existing" ]]; then
    CHANNEL="$existing"
    echo "-- using existing email channel $CHANNEL"
  elif $DRY_RUN; then
    CHANNEL="projects/$PROJECT/notificationChannels/DRY_RUN"
    echo "[dry-run] would create email channel '$CHANNEL_NAME'"
  else
    echo "-- creating email channel for $EMAIL (Google sends a verification email)"
    CHANNEL="$(g beta monitoring channels create \
      --display-name="$CHANNEL_NAME" --type=email \
      --channel-labels=email_address="$EMAIL" --format='value(name)')"
  fi
fi

CHECK_NAME="notedude $ENV_NAME ($HOST)"
existing=""
$DRY_RUN || existing="$(g monitoring uptime list-configs \
  --filter="displayName=\"$CHECK_NAME\"" --format='value(name)' | head -n1)"
if [[ -n "$existing" ]]; then
  echo "-- uptime check exists: $existing"
  UPTIME_ID_PATH="$existing"
elif $DRY_RUN; then
  echo "[dry-run] would create uptime check '$CHECK_NAME' on https://$HOST/ every 5 min"
  UPTIME_ID_PATH="projects/$PROJECT/uptimeCheckConfigs/DRY_RUN"
else
  echo "-- creating uptime check '$CHECK_NAME'"
  # Matches "notedude" in the page so a blank or error page served with 200 still fails.
  UPTIME_ID_PATH="$(g monitoring uptime create "$CHECK_NAME" \
    --resource-type=uptime-url \
    --resource-labels=host="$HOST",project_id="$PROJECT" \
    --protocol=https --path=/ --port=443 --validate-ssl=true \
    --period=5 --timeout=10 \
    --matcher-type=contains-string --matcher-content=notedude \
    --format='value(name)')"
fi
UPTIME_CHECK_ID="${UPTIME_ID_PATH##*/}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for template in "$HERE"/policies/*.json; do
  rendered="$tmp/$(basename "$template")"
  render "$template" > "$rendered"
  display="$(sed -n 's/^  "displayName": "\(.*\)",$/\1/p' "$rendered" | head -n1)"
  existing=""
  $DRY_RUN || existing="$(g monitoring policies list \
    --filter="displayName=\"$display\"" --format='value(name)' | head -n1)"
  if [[ -n "$existing" ]]; then
    echo "-- policy exists, left alone: $display"
    continue
  fi
  if $DRY_RUN; then
    echo "[dry-run] would create policy: $display"
    cat "$rendered"
  else
    echo "-- creating policy: $display"
    g monitoring policies create --policy-from-file="$rendered" --format='value(name)'
  fi
done

cat <<EOF

Done. Next:
  - Confirm the verification email for the alert channel, if one was sent.
  - Test the uptime alert: Monitoring, Uptime checks, '$CHECK_NAME', or point a throwaway
    check at a path that 404s and watch for the email within ~10 minutes.
  - Revisit thresholds after a week: Metrics Explorer, firestore.googleapis.com/document/read_count.
EOF
