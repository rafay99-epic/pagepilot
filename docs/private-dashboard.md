# Private dashboard

`/dashboard/` is your side of PagePilot. Search every page your agents published, preview
one, copy its link or delete it. `/dashboard/#/storage` shows how much of the bucket is
in use.

PagePilot has no login screen of its own. You create one Cloudflare Access application,
and Access signs you in. This guide takes you from nothing to signed in.

## How sign-in works

1. You open `/dashboard/`.
2. Cloudflare Access stops the request and asks who you are.
3. You sign in. Access forwards the request with a signed token.
4. The Worker checks the token's signature, audience, issuer and expiry, then checks that
   the email is yours. Anything else gets a 403.

That is two locks. Access guards the edge and the Worker checks again, so a mistake in
one does not open the door.

## You need

- PagePilot deployed on [your own domain](deploy.md#use-your-own-domain). Access protects
  hostnames on a zone in your Cloudflare account.
- Zero Trust turned on for that account. The free plan is enough for one owner.

The examples below use `pagepilot.example.com`. Swap in your hostname.

## 1. Create the application

In the Cloudflare dashboard, go to **Zero Trust > Access controls > Applications**.

1. Select **Create new application**, then **Self-hosted and private**.
2. Name it, for example `PagePilot dashboard`.
3. Select **Add public hostname** twice and enter these two:

   | Domain                  | Path            |
   | ----------------------- | --------------- |
   | `pagepilot.example.com` | `dashboard`     |
   | `pagepilot.example.com` | `api/dashboard` |

   Each path covers everything below it, so the dashboard's assets and API calls are
   included.

Stop there. Do not add `/api/mcp` or `/p/`. Agents and people opening a link cannot pass
an Access login, so both would break.

## 2. Allow only yourself

Under **Access policies**, create a policy:

| Field   | Value                   |
| ------- | ----------------------- |
| Action  | Allow                   |
| Include | Emails, then your email |

Add nothing else. No Bypass policy and no Everyone rule. Applications deny by default, so
this one policy is the whole guest list.

## 3. Pick how you sign in

Choose the identity providers the application accepts. If you have not connected one,
Access uses a one-time PIN and emails a code to the address you type. Google or GitHub
work too if you have added them to Zero Trust.

Set a session duration you can live with, then select **Create**.

## 4. Copy two values

| Value       | Where it is                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------ |
| AUD tag     | Applications, **Configure** on your app, **Additional settings**, Application Audience (AUD) Tag |
| Team domain | **Zero Trust > Settings**. It looks like `your-team.cloudflareaccess.com`                        |

## 5. Give them to the Worker

The Worker needs three secrets.

| Secret               | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| `ACCESS_TEAM_DOMAIN` | The team domain. Hostname only, lowercase, no `https://` |
| `ACCESS_AUD`         | The AUD tag                                              |
| `OWNER_EMAIL`        | The email from step 2, exactly as you type it at sign-in |

```bash
bunx wrangler secret put ACCESS_TEAM_DOMAIN --env production
bunx wrangler secret put ACCESS_AUD --env production
bunx wrangler secret put OWNER_EMAIL --env production
```

Secrets survive deploys, so you do this once. If your Worker has another name, add
`--name <worker>`. The hosted instance uses `--env '' --name pagepilot-preview`.

Keep all three out of git. The team domain and AUD tag are identifiers, not passwords,
but this repo is public and treats them as secrets anyway. They belong in Worker secrets
and in your ignored `.dev.vars`.

## 6. Sign in

Open `https://pagepilot.example.com/dashboard/`. Access asks for your email, you enter
the code, and the dashboard loads. **Sign out** in the top bar ends the Access session.

Three checks that Access covers the dashboard and nothing else:

```bash
# Redirects to your team's Access login
curl -I https://pagepilot.example.com/dashboard/

# 401 from PagePilot, not a redirect. Agents are not behind Access
curl -i -X POST https://pagepilot.example.com/api/mcp

# ok
curl https://pagepilot.example.com/health
```

## If you get stuck

| What you see                             | What it means                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| 503 `Dashboard access is not configured` | A secret is missing, or the team domain is not a bare `cloudflareaccess.com` hostname |
| 403 `Forbidden` with no login page       | The Access application does not cover this path, so no token arrived                  |
| 403 `Forbidden` after signing in         | `ACCESS_AUD` is from another app, or your email differs from `OWNER_EMAIL`            |
| Access says you are not allowed          | The policy does not include the email you signed in with                              |
| 503 on `localhost`                       | Expected. The dashboard has no local sign-in. See [run locally](run-locally.md)       |

Next: [Connect an agent](connect-an-agent.md)
