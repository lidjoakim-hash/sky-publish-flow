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
- Up next calendar grouping and date arithmetic are pure browser-safe rules in src/lib/next-calendar.ts; its view consumes brand-filtered assets and persisted publication states without scheduling writes.
- The Instagram/Facebook tap-to-preview dialog lives only in src/components/asset-preview.tsx; Up next passes withActions (swap/unapprove), Calendar opens it read-only — change the mockups in that file, never copy them.
- Import runs in the browser (src/lib/importer.ts): ZIPs are streamed entry-by-entry with fflate; never send archives to server functions — Workers have short limits and small memory.
- Publishing is a per-(asset, platform) state machine in src/lib/publisher.server.ts, claimed via the claim_publications DB lease; intent is persisted before each Meta write and interrupted sends become "unknown".
- Facebook image posts: format is per brand via src/lib/facebook-feed.ts (pure rules, no I/O) — Lidverk publishes unpublished-photo + Page /feed with attached_media (feed post id persisted before confirmation, never re-created after an ambiguous response); all other brands keep the direct published photo upload.
- publications and meta_connection are written only server-side (admin client); clients can only read them — status cannot be faked from the browser.
- FFmpeg probing/rendering runs in the local worker (worker/render-worker.mjs) via /api/public/worker/* guarded by WORKER_SECRET; originals in storage are never overwritten, and deleted only by the owner-initiated deleteAssets server function (no storage delete policy for clients).
- Meta credentials are server secrets, never stored in the database or browser.
- Calendar plans are previewed client-side; commitSchedule recomputes the plan from persisted data and refuses stale previews, then writes via the commit_schedule DB function (one transaction, row locks, lease/lock/brand/collision checks, all-or-nothing) — the browser cannot bypass planning safeguards.
- Calendar slots are per business: other businesses' dates never block or delay a plan (planner and commit_schedule both filter by brand).
- Assets carry brand_slug; planning, organizing, ideas and metrics are scoped per brand, and each brand posts only with its own Meta secrets (Skyline: META_*, others: META_<SLUG>_*, IG id only when Instagram is chosen), never falling back to another brand's — prevents posting one brand to another's accounts.
- metric_snapshots are separate from publications; clients may only write source manual/csv, meta_api rows come from the server — metrics can never alter publish status.

- Publication rows are created by the assets_sync_publications DB trigger when a Skyline item is dated (idempotent; reschedule resets only pending/retry/skipped/missed rows); activation only checks approved items — publishing follows the schedule without a second enqueue step.
- Unsent slots older than the 3-hour claim window are marked "missed" by mark_missed_publications each tick, with one alert per item, and are never posted late; the owner reschedules or skips — prevents silent loss and backlog bursts.
- Settings post_times are validated by a DB trigger (HH:MM, strictly ascending, none equal to reel_time), mirrored in src/lib/publishing-rules.ts for UI errors — the database is the final guard.

- Per-business publishing lives in brand_publishing (platforms + enabled, server-written only); brand_platform_enabled gates the trigger, claim and missed-marking, and the publisher re-checks canSend (src/lib/brand-publishing.ts) at send time — the global switch alone never enables a business.
- checkMetaConnection is read-only (src/lib/meta-verify.ts: GETs only, token must belong to the expected Page, scopes per chosen platforms) and never creates publication rows; rows are queued only by the explicit setBrandPublishing owner action after a confirmed test — connecting can never start posting.
- Businesses listed in INSTAGRAM_LOGIN_BRANDS (src/lib/brand-publishing.ts) connect via Instagram API with Instagram Login on graph.instagram.com (no Facebook Page, Instagram-only, META_<SLUG>_IG_ACCESS_TOKEN + IG_USER_ID, verified username/id match); all others keep Facebook Login unchanged — lets Page-less accounts post without touching existing connections.
