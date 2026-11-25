# Waterflood Intelligence

Browser-only Kuwait waterflood engineering dashboard, published with GitHub Pages.

## What works

Ten navigation areas, six-field and reservoir filtering, real cached satellite maps,
all-well subsurface 3D surfaces, real terrain with illustrative wellsite equipment,
operating trends and four prepared engineering answers. No language-model service.

Start streaming replays a local CSV: 100 wells, one all-well update every five seconds,
120 steps over ten minutes. Original source interval is one minute; this is accelerated
playback of app-generated illustrative profiles, not measured field telemetry.
Rate, phase fraction, pressure and ESP variation are correlated and engineering-balanced.
Start is idle by default; Stop and Restart operate only in the current tab.
Keep the tab foregrounded: browsers can throttle background timers. Refresh starts a
new idle browser session. No shared streaming server is involved.

## Deliberate differences from the local application

GitHub Pages cannot run Python. Optimisation, MCP engineering tools, pipeline execution,
watch-rule changes, persistent approvals, work requests, audit and outbox are unavailable,
not silently approximated. Their tabs explain the limitation. QA definitions and scenario
evidence are published source snapshots, not fresh pipeline results. No SCADA write-back.
The full local application is maintained separately and is not required by this site.

Coordinates and wellsite equipment are indicative, not surveyed or photogrammetric.
Satellite imagery observes the surface only. Formation surfaces are data-derived
geological interpretation, not photographs of underground reservoirs.

## Build and deployment

Node.js 22 or later:

```powershell
Set-Location app\web
npm ci
npx tsc --noEmit
node pages-build.mjs
$env:VITE_STATIC = 'true'
$env:VITE_BASE = '/waterflood-intelligence/'
npm run preview
```

Open the displayed local origin followed by `/waterflood-intelligence/`.
`node pages-acceptance.mjs` accepts `PAGES_URL` and `PAGES_EVIDENCE` environment variables;
it verifies ten areas, assets, filters, prepared answers and all 120 five-second playback
steps with a controlled browser clock. Its default local test origin is port 4176.

The Pages workflow builds `app/web/dist-pages`, creates every `.html` entry point and
deploys the artifact using GitHub's official Pages actions. Set `VITE_BASE` when building
under a different repository path. Normal refresh and direct links work without a server
rewrite.

## Published data and attribution

`public/data` contains app-generated source snapshots, 100 per-well histories,
geology, PVT and the 12,000-row playback CSV. `provenance.json` describes the export.
No private requirements, runtime audit, conversations, approvals or outbox are included.
The repository is intentionally public. See [ATTRIBUTION.md](ATTRIBUTION.md) for imagery,
terrain and reference rights. Dependency licensing remains with the respective authors.
