# FH Planet

FH Planet is a small static site with two layers:

- `/` — the existing **FH Planet** dashboard (todo, routine, reminders, projects, modes). That page is unchanged aside from a **FH Planet Modules** launcher.
- `/finance/` — the standalone **FH Planet Finance** department for **FH Organization**, **FH Academy**, and **FH Planet**.

`app.py`, `fhplanet-reports.service`, and `dash.html` stay in the repository. The Python reporting service is not part of the public static publish.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | FH Planet dashboard hub, with a launcher into Finance |
| `dash.html` | Earlier dashboard page, kept as-is |
| `app.py` | Oracle reporting service (stdlib HTTP, `/reports`). Not published |
| `fhplanet-reports.service` | User systemd unit for `app.py`. Not published |
| `finance/` | Static Finance app: `index.html`, `css/app.css`, `js/` |
| `assets/nav.js`, `assets/nav.css`, `assets/windows.js`, `assets/hub.css` | Shared top bar and bottom taskbar (Dashboard, To Do, Finance, Planning). Finance opens in a hub window (no iframe). Add a category by editing `FH_PLANET_NAV` in `assets/nav.js`. |
| `_headers` | Security headers for Cloudflare Pages |
| `.gitlab-ci.yml` | Verify, Cloudflare Pages deploy, manual SSH deploy |
| `.github/workflows/deploy.yml` | The same pipeline on GitHub |

Finance keeps its ledger in `localStorage` (`fhplanet.finance.v1`). The hub reads `fhplanet.finance.summary` for the live liquid / today in / today out / posted counts. JSON backup, JSON restore, and CSV export are in the Finance app under Hermes Control.

Names used everywhere: **FH Organization**, **FH Academy**, **FH Planet**.

## Finance modules

- **FIN-01** Central Cash Box — combined Bank, MFS (bKash, Nagad, Rocket, Upay), card, and cash; today in/out; 7-day deadlines; quick add; module toggles
- **FIN-02** Transaction log — credit / debit / transfer, BDT and USD, fees, tags (`bazaar_market`, `personal`, `private`, plus custom), groups by name / pass number / admin reference, notes on transactions and groups, auto-tag rules, bKash/Nagad/Rocket/Upay/bank SMS paste with TrxID duplicate check
- **FIN-03** Account hub and switchboard — individual and combined balances, School → Classroom → Section float, fee totals. PIN, CVV, and OTP are never stored or requested
- **FIN-04** Cash box custodian view
- **FIN-05** Loan khata — given (পাওনা) and received (দেনা), linked ledger rows, running balance, notes
- **FIN-10** Immutable audit log — posted rows are reversed or adjusted, not deleted
- **FIN-11** Budgets by tag or group, with progress and deviation alerts
- Role preview — Admin/Supreme, Editor, Auditor, and a customer layer filtered by Customer ID

Sample figures load the first time Finance is opened in a browser. They are demo numbers.

## Local preview

From the repository root:

```sh
python3 -m http.server 8080
```

Open `http://127.0.0.1:8080/` and `http://127.0.0.1:8080/finance/`.

`node scripts/selfcheck.js` checks the SMS parser, balances, reversals, grouping, and CSV export. No browser required.

## CI jobs

GitLab (`.gitlab-ci.yml`) is the pipeline for the mirror at `gitlab.com/gpcare017/fh-planet-dashboard`. GitHub Actions (`.github/workflows/deploy.yml`) does the same checks on this GitHub repo.

| Job | When it runs | What it does |
| --- | --- | --- |
| `validate` | Every branch push and every merge request. No secrets required. | Runs `node scripts/selfcheck.js`, builds `dist/` with `scripts/stage-public.sh`, and checks that `index.html` still contains the existing dashboard plus the FH Planet Modules launcher, that `finance/` and its CSS/JS are present, and that `app.py` and `fhplanet-reports.service` are not in `dist/`. Uploads `dist/` as the `fh-planet-dist` artifact (kept 14 days). |
| `deploy_cloudflare_pages` | Default branch only, and only when both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set. | Publishes the staged site with `wrangler pages deploy`. The project name is `CF_PAGES_PROJECT` or `fh-planet-dashboard`. |
| `deploy_ssh_server` | Default branch only, manual, and only when `SSH_PRIVATE_KEY` is set. | Rsyncs `dist/` to `DEPLOY_USER@DEPLOY_HOST:DEPLOY_PATH`. |

Until the deploy variables exist, a push produces a green pipeline that stops after `validate`.

`dist/` is the public site. It leaves out `app.py`, `fhplanet-reports.service`, `.git`, `.github`, `.gitlab-ci.yml`, `.env`, and `data/`.

### Variables

Set these as masked CI/CD variables on GitLab, or as Actions secrets on GitHub. None are written into the repo.

| Variable | Used by | Required to deploy |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `deploy_cloudflare_pages` | Yes, with the account id |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy_cloudflare_pages` | Yes, with the API token |
| `CF_PAGES_PROJECT` | `deploy_cloudflare_pages` | No. Defaults to `fh-planet-dashboard` |
| `SSH_PRIVATE_KEY` | `deploy_ssh_server` | Yes, or the manual job is not created. Raw key, or base64 so GitLab can mask it |
| `SSH_KNOWN_HOSTS` | `deploy_ssh_server` | Yes when you play the SSH job. One line from `ssh-keyscan -H your.host` |
| `DEPLOY_USER` | `deploy_ssh_server` | Yes when you play the SSH job |
| `DEPLOY_HOST` | `deploy_ssh_server` | Yes when you play the SSH job |
| `DEPLOY_PATH` | `deploy_ssh_server` | Yes when you play the SSH job. Absolute web root |

`_headers` is included in the publish. The existing dashboard keeps its script in the HTML page, so the content-security policy allows inline scripts.

## SSH / No-IP / Oracle

Use this when the same static site should also be copied to the Caddy host. Point `DEPLOY_PATH` at the **web root** (for example `/var/www/fhplanet`), not a home directory that holds the reporting database.

| Variable | Purpose |
| --- | --- |
| `SSH_PRIVATE_KEY` | Deploy private key. On GitHub this may be the raw multi-line key. On GitLab, masked variables cannot contain newlines, so store **base64** of the key. The script accepts either form |
| `SSH_KNOWN_HOSTS` | One line from `ssh-keyscan -H your.host` |
| `DEPLOY_USER` | SSH user |
| `DEPLOY_HOST` | Hostname or No-IP name |
| `DEPLOY_PATH` | Absolute web root |

`rsync --delete` updates that directory. `app.py`, `fhplanet-reports.service`, `data/`, `*.db`, and virtualenvs are excluded so a shared folder does not lose the reporting service. Host keys are checked; the script does not turn that check off.

- **GitHub:** Actions → Deploy → Run workflow → enable “Also deploy over SSH”. The job skips itself when `SSH_PRIVATE_KEY` is empty.
- **GitLab:** on the default branch, play `deploy_ssh_server`. The job is absent until `SSH_PRIVATE_KEY` is set.

A Caddy site can serve the folder directly:

```caddy
example.ddns.net {
  root * /var/www/fhplanet
  file_server
}
```

The reporting service in `app.py` keeps listening on `127.0.0.1:8090` under `/reports` when its systemd unit is running. It is separate from this static deploy.
