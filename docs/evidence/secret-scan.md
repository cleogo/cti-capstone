# Secret scan (PRD §13, M8)

Scan of every commit on every branch, before the repo goes public.

## Command

gitleaks is not installed on the build machine, so it runs from its pinned
Docker image. From the repo root, in Git Bash:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo" zricethezav/gitleaks:v8.24.3 detect --source /repo --log-opts="--all" --redact -v
```

On macOS or Linux, use `-v "$(pwd):/repo"` and leave out `MSYS_NO_PATHCONV=1`.

## Result (4 Nov 2026)

```
INF 26 commits scanned.
INF scanned ~6002702 bytes (6 MB) in 6.46s
INF no leaks found
```

Exit code 0. The scan covered `--all`, so every branch and tag. The head
commit was `4094dbf` (M7).

## Why it is clean

- `.env.local` and every `.env*.local` are in `.gitignore` and were never
  committed. `.env.example` holds placeholders only (`sk-...`, `pk-lf-...`).
- The Langfuse trace links in the evidence files use `<LANGFUSE_BASE_URL>`,
  not a real host with keys.
- `private/` (costing formula, cost and margin data) is gitignored.
- The Docker image holds no secrets. They come from `--env-file .env.local`
  at run time, and `.dockerignore` keeps `.env*` and `private/` out of the
  build context.

## Re-run

Run the command again before the final submission (M10), after the last
commit. A finding fails the submission checklist until the secret is
rotated and removed from history.
