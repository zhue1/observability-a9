# A9 — Observability with OpenTelemetry, MongoDB, and Jaeger

This is an instrumented `todo-service` built for the observability assignment. It collects **traces** from HTTP/Express/MongoDB, **metrics** (request counts and latency), and **structured logs** correlated with trace IDs. Jaeger 2.5.0 displays **traces**; metrics and logs are printed to the Node.js terminal, not to Jaeger.

## Verification status — November 21, 2026

Dependency installation, JavaScript syntax checks, and OpenTelemetry tracer/meter initialization passed. The installed dependency tree reports zero npm audit vulnerabilities. End-to-end verification is pending: Docker Desktop is not installed on the verification machine, MongoDB is unavailable, and application startup fails with `ECONNREFUSED` on port 27017. No successful request traces, Jaeger screenshots, or submission-ready PDF have been produced. The original Word template remains unchanged.

## Requirements

- Docker Desktop, started and running
- Node.js **22.15.0 or later** (required by the updated OpenTelemetry SDK)
- npm and Git
- Python 3 with `python-docx` for finalizing the supplied report template

## 1. Install and start infrastructure

```bash
npm install
npm run check
docker compose up -d
docker compose ps
```

Docker Compose starts MongoDB on `localhost:27017` and Jaeger on `localhost:16686`. **Port `4318` is also published**; the assignment's original Jaeger command does not show it, but it is required for the OTLP HTTP exporter used by this project.

The lockfile pins a matching OpenTelemetry 3.1.1 / 0.301.2 SDK set. HTTP, Express, and MongoDB are automatically instrumented through their individual instrumentation packages, avoiding unused cloud detectors. Use `npm ci` to reproduce the locked installation.

If you want to use the exact commands in the assignment instead of Docker Compose, run:

```bash
docker run -d --name a9-mongo -p 127.0.0.1:27017:27017 mongo:7.0
docker run -d --name jaeger -p 127.0.0.1:16686:16686 -p 127.0.0.1:4318:4318 -p 127.0.0.1:4317:4317 jaegertracing/jaeger:2.5.0
```

Use either Docker Compose **or** those `docker run` commands, not both simultaneously.

## 2. Part 3 — Run once with console tracing

In one terminal:

```bash
npm run start:console
```

In another terminal:

```bash
curl http://localhost:3000/todo
```

The terminal should show exported spans, JSON logs, and periodic request-count/latency metrics. `tracing.js` is preloaded with `--require` so instrumentation starts **before** Express and MongoDB load.

## 3. Part 3 — Switch to Jaeger (OTLP exporter)

Stop the console run with Ctrl+C. The same `tracing.js` can switch to the OTLP exporter by selecting the Jaeger environment config:

```bash
npm run start:jaeger
```

Open another terminal and generate several known requests:

```bash
npm run traffic
```

The traffic command makes nine real HTTP requests and fails if a status or returned value is unexpected. It checks MongoDB health, listing, lookup, creation, validation, missing data, and the intentional HTTP 500 response. It does not by itself verify that traces reached Jaeger.

After several seconds, open [http://localhost:16686](http://localhost:16686). In Jaeger's **Search** panel, choose **todo-service**, set Lookback to **Last Hour**, and search for recent traces. Capture the search results first. Click a trace with `GET /todo`; expand the root HTTP/Express and MongoDB spans and capture the second screenshot. Also inspect the intentionally failing `/error-demo` trace (HTTP 500) to verify error tags.

**Do not submit the sample Jaeger screenshots in the course instructions as your own. Capture screenshots from your real local Jaeger UI.** Put the files at `evidence/jaeger-search.png` and `evidence/jaeger-trace.png` (or pass the paths explicitly when finalizing).

## 4. What to expect (verify on your machine)

| Signal | Where to find it | What it represents |
| --- | --- | --- |
| Traces and spans | Jaeger Search + trace detail | One trace for an HTTP request, child spans for Express route, `todo.list`/`todo.get`, and MongoDB operations; durations, timing, status/error attributes. |
| Metrics | Node terminal every ~5 seconds | `todo.http.requests` count and `todo.http.server.duration` latency histogram, grouped by method, route, and status. |
| Logs | Node terminal, JSON | Timestamped `http_request`, `todos_listed`, `server_started`, and error events. `trace_id` ties relevant logs to a request's trace. |

Jaeger is not a metrics or log viewer in this setup. The screenshot section of the assignment asks for **Jaeger trace screenshots**, while the 350-word analysis should distinguish all three telemetry types.

## 5. Finalize the template PDF after a real Jaeger run

You have a report draft beside this project zip; `scripts/finalize_deliverable.py` rebuilds the final report using the **original uploaded Word template**, preserving the template's heading styles and numbering. It inserts a **real public GitHub URL** as a clickable hyperlink, your name, an analysis of no more than 350 words, and your actual Jaeger screenshots.

Copy `Observability Deliverable.docx` (the original blank template) into this project directory if it is not already present. Then run from the project root:

```bash
python3 -m pip install python-docx pillow
python3 scripts/finalize_deliverable.py \
  --name "YOUR FULL NAME" \
  --github-url "https://github.com/YOUR-USERNAME/observability-a9" \
  --screenshot evidence/jaeger-search.png \
  --screenshot evidence/jaeger-trace.png \
  --output "Observability Submission.docx"
```

Open the DOCX to confirm the screenshots; use Word **File → Save As / Export → PDF** and submit the PDF to your course. If LibreOffice is installed, alternatively:

```bash
libreoffice -env:UserInstallation=file:///tmp/lo-observability-a9 --headless --convert-to pdf --outdir . 'Observability Submission.docx'
```

Before submitting, replace the general analysis with concrete observed timings/counts if you can read them from Jaeger. The report text lives in `analysis.txt` and can be edited; keep it within 350 words.

## 6. Make the GitHub repository public

Create a new repository called `observability-a9` on GitHub and set its visibility to **Public**. Then, from this directory:

```bash
git init
git add .
git commit -m "Add instrumented observability todo service"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/observability-a9.git
git push -u origin main
```

If GitHub authentication fails, use your normal GitHub CLI (`gh auth login`) or Git Credential Manager. Avoid checking in credentials. Verify the public URL in an incognito window. Adding a screenshot to GitHub is optional, but the PDF must contain it.

## Troubleshooting

- **No traces:** confirm `npm run start:jaeger`, check Jaeger port `4318`, run `npm run traffic`, inspect server output for exporter errors, then refresh Jaeger. Wait at least a few seconds for batched exporting.
- **`todo-service` not listed:** ensure startup finished (MongoDB connection succeeded), then retry `curl` and check the Jaeger Search Lookback.
- **MongoDB connection errors:** check `docker compose ps` and `docker compose logs mongo`.
- **Port already occupied:** shut down conflicting processes or containers first; don't run duplicate MongoDB/Jaeger stacks.
- **Traces missing HTTP or DB spans:** verify Node starts with `--require ./tracing.js` *before* importing app modules.
- **Docker stopped:** start Docker Desktop, then `docker compose up -d` again.

## References

- https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
- https://opentelemetry.io/docs/languages/js/exporters/
- https://www.jaegertracing.io/docs/2.5/getting-started/ (older course example version)
