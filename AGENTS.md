<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Pure rules (CSV parsing, caption matching, Oslo scheduling, ZIP safety, audio levels) live in src/lib/*.ts without I/O and are covered by src/test/core-rules.test.ts — keeps behaviour testable.
- Import runs in the browser (src/lib/importer.ts): ZIPs are streamed entry-by-entry with fflate; never send archives to server functions — Workers have short limits and small memory.
- Publishing is a per-(asset, platform) state machine in src/lib/publisher.server.ts, claimed via the claim_publications DB lease; intent is persisted before each Meta write and interrupted sends become "unknown" — prevents double posts.
- publications and meta_connection are written only server-side (admin client); clients can only read them — status cannot be faked from the browser.
- FFmpeg probing/rendering runs in the local worker (worker/render-worker.mjs) via /api/public/worker/* guarded by WORKER_SECRET; originals in storage are never overwritten or deleted (no storage delete policy).
- Meta credentials are server secrets (META_PAGE_ACCESS_TOKEN, META_PAGE_ID, META_IG_USER_ID, optional META_GRAPH_VERSION), never stored in the database or browser.
- The cron route /api/public/cron/publish uses authenticateCronRequest; the cron job is created only when the user first activates publishing.
