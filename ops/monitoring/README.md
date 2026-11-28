# Monitoring as code (#225)

`setup.sh` creates an uptime check and four alert policies in one Firebase / Google Cloud
project. The policies are the JSON files in `policies/` (Cloud Monitoring `AlertPolicy`
format) with `${...}` placeholders that the script fills in. What is monitored and why is in
spec.md, "Uptime and Backend Monitoring".

```bash
gcloud auth login
gcloud components install beta          # for the email channel; skip if you pass --channel
ops/monitoring/setup.sh --project notedude2 --host app.notedude.app --email you@example.com --dry-run
ops/monitoring/setup.sh --project notedude2 --host app.notedude.app --email you@example.com
```

Re-running is safe: existing items are matched by display name and left alone. To change a
policy, edit its JSON, delete the old policy in the console (Monitoring, Alerting), and re-run.
