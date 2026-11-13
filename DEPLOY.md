# Deploying Voltline

Production is one Ubuntu box serving **https://voltline.mrballistic.com** as static files behind Apache. Releases ship from GitHub Actions when you push a version tag. There is no backend, no process manager and no secrets on the server: the site is the contents of `dist/`.

- [Releasing](#releasing)
- [What the pipeline does](#what-the-pipeline-does)
- [Production layout](#production-layout)
- [CI secrets and the deploy key](#ci-secrets-and-the-deploy-key)
- [One-time server setup](#one-time-server-setup)
- [Rollback](#rollback)
- [Dependency updates](#dependency-updates)
- [Gotchas](#gotchas)
- [Reference](#reference)

---

## Releasing

1. Bump `version` in `package.json` and refresh the lockfile:
   ```bash
   npm pkg set version=1.0.0
   npm install --package-lock-only
   ```
2. Turn the `## Unreleased` section of `CHANGELOG.md` into `## 1.0.0 (YYYY-MM-DD)` (and add a fresh empty `## Unreleased` above it). That section becomes the GitHub Release's notes, and the deploy refuses a version without one. Preview it with `node scripts/release-notes.mjs 1.0.0`.
3. Open a PR to `main`. CI (`.github/workflows/ci.yml`) has to pass.
4. Merge, then tag the merge commit and push the tag:
   ```bash
   git checkout main && git pull --ff-only
   git tag -a v1.0.0 -m "1.0.0: what changed"
   git push origin v1.0.0
   ```
5. Watch it: `gh run watch` (or the Actions tab).

A version with a hyphen (`1.1.0-rc.1`) deploys the same way and is marked a prerelease on GitHub. Note that it still goes live: there is only one environment.

## What the pipeline does

`.github/workflows/deploy.yml` runs on any `v*` tag:

| Job | What it does |
|---|---|
| **Verify release tag** | Refuses the tag unless it is on `main`, matches `package.json`'s version, **and** has a section in `CHANGELOG.md`. |
| **ci** | Calls `ci.yml`: lint, type-check, tests with coverage thresholds (`src/engine` and `src/ai`), build, a short AI bench run and a bundle hygiene check (no API keys, no LLM endpoints, no Google Fonts in `dist/`). |
| **Deploy to production** | Builds the site on Node 26, then over SSH as `voltline-deploy`: rsyncs everything except `index.html` into `/var/www/voltline`, then rsyncs again with `--delete` so `index.html` lands last and stale hashed bundles go. Finally it smoke-tests the public site: the page has `<title>Voltline</title>` and one hashed asset returns 200. |
| **GitHub Release** | After a successful deploy, creates the release for the tag (“Voltline 1.0.0”) with that version's `CHANGELOG.md` section as its notes. It is the only job with `contents: write`, and it never sees the deploy secrets. An existing release is left alone, so hand-edited notes survive a re-run. |

Deploys are serialized (`concurrency: deploy`, shared with any other workflow that uses the group), so two tags pushed close together run one after the other.

CI also runs on every PR to `main` and every push to `main`. The Playwright browser smoke test (`npm run smoke`) is not wired in yet; its steps are a commented placeholder in `ci.yml`.

## Production layout

| | |
|---|---|
| Host | `mrballistic.com`, Ubuntu 24.04 LTS (shared with `initech.mrballistic.com` and other sites; nothing here touches them) |
| Site | `https://voltline.mrballistic.com` (Apache vhost `voltline-le-ssl.conf`, Let's Encrypt via certbot) |
| Files | `/var/www/voltline`, owned by `voltline-deploy`, dirs `755`, files `644` (Apache can read but not write) |
| Logs | `/var/log/apache2/voltline-{access,error}.log` |
| Node on the server | Not needed. The site is built in CI; the server only holds the output. |

Apache serves static files only: no proxy modules, no `.htaccess` (`AllowOverride None`). The vhost sets `FallbackResource /index.html`, a year-long immutable cache for `assets/*` and `audio/*` (their names are hashed), `no-cache` for `index.html`, HSTS, `nosniff`, a referrer policy, MIME types for `.webm` and `.m4a`, and a Content-Security-Policy matching the desktop app's: `default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:`.

### The deploy user

**`voltline-deploy`** owns `/var/www/voltline` and has **no sudo** and no other write access. Its key in `authorized_keys` is prefixed with `restrict` (no pty, no port or agent forwarding). Because the site is static, a leaked CI key can replace the site's files and nothing more: there is no server-side code or secret for it to reach. Rotate the key if it leaks and redeploy the last good tag.

Check the boundary any time:
```bash
ssh voltline-deploy@mrballistic.com 'sudo -n true; id'
# expect: a sudo refusal, then the user's own uid and groups only
```

## CI secrets and the deploy key

Everything the deploy needs lives in the **`production` environment** (Settings → Environments), whose deployment policy admits only `v*` tags. Only the deploy job names that environment, so no other workflow, branch or fork PR can read these:

| Name | Kind | Value |
|---|---|---|
| `DEPLOY_SSH_KEY` | secret | private half of the CI deploy key |
| `DEPLOY_KNOWN_HOSTS` | secret | `ssh-keyscan -t ed25519 mrballistic.com`, pins the host |
| `DEPLOY_HOST` | secret | `mrballistic.com` |
| `DEPLOY_USER` | secret | `voltline-deploy` |

Set or rotate them with `--env production`: `gh secret set DEPLOY_SSH_KEY --env production < key`.

The workflows pin third-party actions to commit SHAs (version in a trailing comment; Dependabot updates both), and checkouts set `persist-credentials: false`.

**Pin the host key against a known fingerprint, never blind:**
```bash
ssh-keyscan -t ed25519 mrballistic.com > /tmp/kh
ssh-keygen -lf /tmp/kh                                       # compare with:
ssh-keygen -F mrballistic.com -f ~/.ssh/known_hosts | ssh-keygen -lf -
```

**Creating or rotating the CI key:**
```bash
ssh-keygen -t ed25519 -N '' -C 'github-actions deploy: voltline -> voltline-deploy@mrballistic.com' -f ~/.ssh/voltline_ci_deploy
# Build the file locally and copy it up: passing keys as ssh arguments
# splits them at their spaces (see Gotchas).
printf 'restrict %s\n' "$(cat ~/.ssh/voltline_ci_deploy.pub)" > /tmp/ak
scp /tmp/ak <admin>@mrballistic.com:/tmp/ak && rm /tmp/ak
ssh <admin>@mrballistic.com 'sudo install -d -o voltline-deploy -g voltline-deploy -m 700 /home/voltline-deploy/.ssh && sudo install -o voltline-deploy -g voltline-deploy -m 600 /tmp/ak /home/voltline-deploy/.ssh/authorized_keys && rm /tmp/ak'
gh secret set DEPLOY_SSH_KEY --env production < ~/.ssh/voltline_ci_deploy
```
Replacing the file revokes the old key. `<admin>` is your sudo-capable account; never give its key to CI.

## One-time server setup

For rebuilding the box from scratch. Apache and certbot already exist on the shared server, so only steps 2 to 4 apply to it.

```bash
# 1. System packages (fresh box only)
sudo apt update
sudo apt install -y apache2 certbot python3-certbot-apache rsync

# 2. The deploy user and the web root. No sudo rights for this user.
sudo useradd -r -m -s /bin/bash voltline-deploy
sudo mkdir -p /var/www/voltline
sudo chown voltline-deploy: /var/www/voltline

# 3. Apache vhost + TLS. Install the port-80 vhost BEFORE certbot, so
#    configtest passes and the HTTP-01 challenge has somewhere to land.
sudo a2enmod ssl headers rewrite
sudo cp deploy/apache-voltline.conf /etc/apache2/sites-available/voltline.conf
sudo a2ensite voltline
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d voltline.mrballistic.com
# certbot's generated 443 vhost is a redirect loop here; replace it with the known-good one
sudo cp deploy/apache-voltline-le-ssl.conf /etc/apache2/sites-available/voltline-le-ssl.conf
sudo apache2ctl configtest && sudo systemctl reload apache2

# 4. Deploy key for voltline-deploy: see "CI secrets and the deploy key" above
```

The `voltline.mrballistic.com` DNS record must resolve to the box before step 3, or certbot's challenge fails. Inspect the other vhosts first (`ls /etc/apache2/sites-enabled`) and change nothing that belongs to other sites. Then push a release tag.

If either vhost file changes in the repo, copy it up by hand and reload; the pipeline deliberately can't touch Apache (the deploy user has no sudo).

## Rollback

Deploying an older version is just running the pipeline for it:

- **Preferred:** revert on `main`, bump the patch version, tag. It goes through the same checks as any release.
- **Fast:** re-run the deploy for an older tag. In the Actions tab, open the old tag's `Deploy` run and choose **Re-run all jobs**. It rebuilds that tag's commit and rsyncs it over the site, `--delete` included. (The `verify` job will refuse it if that tag is no longer on `main`.) The release already exists, so it is left alone.
- **CI down:** check out the old tag and run the same two rsyncs by hand with your own key for `voltline-deploy`:
  ```bash
  git checkout v1.0.0 && npm ci && npm run build
  rsync -rltz --chmod=D755,F644 --exclude=index.html dist/ voltline-deploy@mrballistic.com:/var/www/voltline/
  rsync -rltz --chmod=D755,F644 --delete dist/ voltline-deploy@mrballistic.com:/var/www/voltline/
  git checkout -
  ```

Players who loaded the old page keep working: hashed assets are removed on the next deploy, so a tab left open across a release may need a refresh.

## Dependency updates

- **Dependabot** (`.github/dependabot.yml`) checks npm and GitHub Actions monthly. Minor and patch bumps arrive as one grouped PR; majors arrive individually.
- **Held on purpose:** TypeScript majors (typescript-eslint peers `typescript <6.1.0`) and `@types/node` majors (they track the Node runtime, 26). Close PRs that ignore the hold, with a comment.
- Install exact-peer families together: `vitest` and `@vitest/coverage-v8` move as a set. Re-run `npm audit` after every fix instead of trusting `npm audit fix`'s summary.
- A new Node major means bumping `.nvmrc`, `engines.node`, `@types/node` and the `node-version` in both workflows in one change. The server needs no Node.

## Gotchas

What carried over from the initech pipeline and applies to a static site.

- **Install the port-80 vhost before certbot.** Apache's configtest fails on a 443 block whose certificate doesn't exist yet, so the 443 vhost can only come after issuance.
- **certbot's generated 443 vhost is unreliable.** It copies the port-80 vhost, so a redirect-only port-80 vhost yields a redirect-only 443 vhost: an infinite https to https loop. Always replace it with `deploy/apache-voltline-le-ssl.conf`.
- **Keep the ACME path out of the redirect.** The port-80 vhost redirects everything except `/.well-known/acme-challenge/`, so renewals keep working. Check with `sudo certbot renew --dry-run`.
- **`index.html` goes last.** Uploading it first would serve a page whose hashed assets are not there yet. The workflow's two-pass rsync exists for this.
- **The deploy user has no sudo, on purpose.** If a future step needs Apache config or certbot, do it by hand as your admin account instead of widening the deploy user.
- **ssh only offers keys it knows about.** A key with a non-default filename needs a `Host` entry with `IdentityFile` in `~/.ssh/config`; without one, ssh falls back to a password prompt, which the server refuses.
- **ssh flattens its arguments into one string.** `ssh host bash -s -- "$PUBKEY"` splits the key at its spaces on the far side, which silently wrote a broken `authorized_keys` once. Copy files with `scp` instead.
- **Subdomain, not subpath.** The build uses `base: './'` and the vhost assumes the site root, so the vhosts are for `voltline.mrballistic.com`, not `mrballistic.com/voltline`.
- **A tab left open across a release** can 404 on a hashed file the new deploy removed; a refresh fixes it.

## Reference

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | PR and `main` checks; reused by deploy |
| `.github/workflows/deploy.yml` | Tag-triggered release |
| `.github/dependabot.yml` | Update policy |
| `scripts/release-notes.mjs` | Prints a version's `CHANGELOG.md` section |
| `deploy/apache-voltline.conf` | Port-80 vhost (HTTPS redirect, certbot bootstrap) |
| `deploy/apache-voltline-le-ssl.conf` | Port-443 vhost: static site, cache and security headers, CSP |
