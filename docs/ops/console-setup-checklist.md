# Console setup checklist (#171, #222, #225, #14)

The repo side of environments, Sentry and monitoring is code. These steps create accounts,
projects, secrets and alert channels, so they are done by hand by the project owner. Never commit
a key or token; every secret below goes into GitHub repository secrets.

## 0. Unblock production deploys (do first)

Deploys to `notedude2` have failed since Oct 22; the live site is the Oct 12 build.

- [ ] Google Cloud console, project `notedude2`, IAM: find the service account whose key is in
      the repo secret `FIREBASE_SERVICE_ACCOUNT_NOTEDUDE2` (one deploy account belongs to the
      `notedude-mcp` project; that works if it is granted roles on `notedude2`).
- [ ] Grant it **Firebase Hosting Admin** and **Service Usage Consumer** on `notedude2`.
- [ ] Re-run the last failed "CI" workflow on `main` and confirm the deploy step passes.

## 1. Staging project (#171)

Blocked in part by billing: since late 2024 a new Firebase project needs the **Blaze** plan to
create its default Cloud Storage bucket, and attachments (#259) need Storage. Without Blaze,
staging can run Auth, Firestore and Hosting but attachment uploads will fail there. This is the
same Blaze upgrade as notedude_mcp#9.

- [ ] Firebase console, Add project, id **`notedude2-staging`** (if you choose another id,
      change `staging` in `.firebaserc`). Analytics off.
- [ ] Build, Authentication, Get started, enable **Google**. Support email: yours.
- [ ] Authentication, Settings, Authorized domains: keep `localhost`, add
      `notedude2-staging.web.app` (and a custom domain if you add one).
- [ ] Firestore Database, Create, production mode, same region as `notedude2`.
- [ ] Storage, Get started (needs Blaze).
- [ ] Project settings, General, Your apps, Add app, Web, nickname `notedude staging`. Copy
      `apiKey`, `appId`, `messagingSenderId` from the config shown.
- [ ] Google Cloud console for `notedude2-staging`, IAM, Service accounts, create
      `github-deploy` with roles **Firebase Hosting Admin**, **Firebase Rules Admin**,
      **Service Usage Consumer**. Keys, Add key, JSON.
- [ ] GitHub, repo Settings, Secrets and variables, Actions:
  - Secret `FIREBASE_SERVICE_ACCOUNT_STAGING` = the whole JSON key file. Then delete the file.
  - Variable `STAGING_FIREBASE_PROJECT_ID` = `notedude2-staging` (setting this turns the staging
    deploy on).
  - Variable `STAGING_FIREBASE_API_KEY`, `STAGING_FIREBASE_APP_ID`,
    `STAGING_FIREBASE_MESSAGING_SENDER_ID` = the values copied above.
  - Optional: `STAGING_SAME_ORIGIN_AUTH_HOSTS` = `notedude2-staging.web.app`, only after
    `https://notedude2-staging.web.app/__/auth/handler` is added as an authorized redirect URI
    on the staging OAuth client (Google Cloud console, APIs & Services, Credentials, the
    "Web client (auto created by Google Service)"). This is what lets the iOS home-screen
    sign-in (#260) work on staging.

## 2. Production approval gate (#171)

- [ ] GitHub, repo Settings, Environments, `production` (created by the first run of the new
      workflow, or create it): Required reviewers = you; tick **Prevent self-review** only if a
      second person can approve; Deployment branches = `main` only.
- [ ] Optionally do the same for `staging` with no reviewers and branch `main` only.

From then on a merge to `main` deploys to staging, waits for your approval on the run page, then
deploys the same commit to production.

## 3. Sentry (#222)

- [ ] sentry.io, create an organization (or use yours), Create project, platform
      **Next.js**, alert frequency "Alert me on every new issue".
- [ ] Project settings, Client Keys (DSN): copy the DSN.
- [ ] Settings, Developer settings / Auth tokens, create an **organization token** (or a
      personal token with scopes `project:releases` and `org:read`).
- [ ] GitHub variables: `NEXT_PUBLIC_SENTRY_DSN` = the DSN, `SENTRY_ORG` = org slug,
      `SENTRY_PROJECT` = project slug.
- [ ] GitHub secret: `SENTRY_AUTH_TOKEN` = the token.
- [ ] After the next deploy, the run page's "Monitoring" summary should say Sentry on and source
      maps uploaded. Trigger an error in production and confirm in Sentry: release = commit SHA,
      environment `production`, readable stack, no user or note data.
- [ ] Sentry, Alerts: keep "new issue, email"; add a filter `environment:production` so staging
      errors don't email.

## 4. Uptime and alerts (#225)

Run from any machine with gcloud signed in as an owner of the project:

```bash
gcloud components install beta
ops/monitoring/setup.sh --project notedude2 --host app.notedude.app --email <your email> --dry-run
ops/monitoring/setup.sh --project notedude2 --host app.notedude.app --email <your email>
# later, for staging:
ops/monitoring/setup.sh --project notedude2-staging --env staging --host notedude2-staging.web.app --email <your email>
```

- [ ] Click the verification link Google emails for the alert channel.
- [ ] Test: Monitoring, Alerting, the "site down" policy shows "No incidents". Optionally create
      a throwaway uptime check on a 404 path and confirm the email arrives.

Cloud Monitoring's uptime checks and alerting are within its free allotment for this volume, but
Google may ask for a billing account on the project before enabling the API. If it does, this
step waits on the same Blaze upgrade.

## 5. Security settings from the review (#14)

- [ ] Google Cloud console, `notedude2`, APIs & Services, Credentials, the Browser key: Application
      restrictions = HTTP referrers `https://app.notedude.app/*`, `https://notedude2.web.app/*`,
      `https://notedude2.firebaseapp.com/*`; API restrictions = Identity Toolkit API, Token
      Service API, Cloud Firestore API, Cloud Storage for Firebase API, Firebase Installations API.
- [ ] Firebase console, `notedude2`, Authentication, Authorized domains: remove `localhost` and
      `127.0.0.1` once staging exists.
- [ ] Firebase console, App Check: register the web app with reCAPTCHA Enterprise (code change
      to follow, then enforce after a week of metrics).
- [ ] Rotate any Admin SDK JSON key that has lived on a laptop (MCP setup).
