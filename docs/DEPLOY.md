# Deploying the hosted demo

`Dockerfile.demo` builds one container with HydraDB, the Klew API and the site. The httpx and flask graphs
are indexed and warm-started at build time, so the demo starts pre-trained. HydraDB listens on loopback only;
the container exposes one port (`$PORT`, default 7860).

The demo graph is shared by visitors and resets to the pre-trained state whenever the container restarts.
Writes are rate-limited (`KLEW_RATE_PER_MIN`, default 30 per minute per IP).

## Option A: Hugging Face Spaces (free; 2 vCPU, 16 GB RAM)

1. Create a Space: SDK **Docker**, hardware **CPU basic** (free), visibility **public**.
2. Push this repository to the Space with the demo Dockerfile as `Dockerfile`:
   ```bash
   git clone https://huggingface.co/spaces/<user>/klew hf-space
   cp -r klew web eval deploy pyproject.toml README.md LICENSE hf-space/
   cp Dockerfile.demo hf-space/Dockerfile
   # Spaces read app_port from the README front matter:
   printf -- '---\ntitle: Klew\nsdk: docker\napp_port: 7860\n---\n\n' | cat - README.md > hf-space/README.md
   cd hf-space && git add -A && git commit -m "Klew demo" && git push
   ```
3. The URL is `https://<user>-klew.hf.space`.

## Option B: Render (free web service; 512 MB RAM)

1. New → Web Service → connect the GitHub repo → Runtime **Docker**, Dockerfile path `Dockerfile.demo`.
2. Instance type **Free**. Render sets `PORT` itself.
3. Free instances sleep after idle; set the repository variable `KLEW_DEMO_URL` to the service URL so
   `.github/workflows/keep-awake.yml` pings it every 10 minutes.

## Run it locally

```bash
docker build -f Dockerfile.demo -t klew-demo .
docker run --rm -p 7860:7860 klew-demo        # http://localhost:7860
```

## Waitlist emails ("Use your repo")

The Playground's **Use your repo** button opens a waitlist form (name, email, optional repo link).
`POST /api/waitlist` emails each sign-up to you through [Resend](https://resend.com):

1. Create a free Resend account with the inbox you want sign-ups delivered to, and create an API key.
2. In Render → your service → **Environment**, add `RESEND_API_KEY` (the key) and `WAITLIST_TO`
   (that same inbox), then redeploy.

Without a verified domain, Resend's shared sender (`onboarding@resend.dev`) can only deliver to your Resend
account's own address, so `WAITLIST_TO` must be that address. Set `WAITLIST_FROM` once you verify a domain.
Without the key the form says "The waitlist isn't configured on this server yet." Sign-ups are rate-limited to
3 per 10 minutes per IP (`KLEW_WAITLIST_PER_10MIN`), and a hidden honeypot field drops bots.
