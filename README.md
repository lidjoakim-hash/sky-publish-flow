# Scheduling tool

Create a project named Skyline Publisher. The user explicitly wants this complete system built in Lovable. Begin implementation now using the default stack and a persistent backend. Keep the app unpublished and automatic Meta publication paused while it is being built. Avoid adding paid third-party subscriptions without explaining their costs. Implement the core import/library/scheduling/readiness workflows and real backend adapters; make integrations that still need credentials clear. Use a professional calm navy/white interface with teal accents, simple language and mobile-friendly controls.

# Build Skyline Publisher in Lovable

Build a working personal application for Skyline Stavanger, based on the existing local publisher behavior described below. This is a migration and extension of an existing batch publisher, not just a visual mockup. Prioritize minimal effort and low operating cost. Use React/TypeScript with a responsive dashboard, authentication, persistent database, media storage, and server-side publishing jobs. Choose the backend at the beginning; Lovable Cloud is simplest, while an explicitly connected Supabase project gives separate ownership and billing. Show estimated recurring costs and free-tier limits before enabling optional paid services. Do not promise unlimited free storage, rendering, or publishing.

## Exact use case

The user has G:\Skyline_All_120_Reels_44_Posts.zip: 120 Reels, 44 image posts, and Norwegian captions. The original ZIP is about 0.9 GB extracted. Its root Captions.csv uses Asset,Type,Caption. Most media also has a matching .txt caption. The First_Campaign_20_Reels_4_Posts directory contains 20 additional Reels and four posts, followed by the main 100-Reel/40-post library. Reel JPEGs are cover images, not feed posts. Preview images and HTML documents are not publishable assets. Preserve captions and originals. Some videos are silent; all Reels must have audible audio before approval. Do not invent marketing claims or rewrite the provided Norwegian captions automatically.

The intended flow is: upload batch → automatically match media/captions → check content and audio → assign dates → review once → activate → publish to Instagram and Facebook independently. Start with publishing paused. Choose a future start date in the UI; do not inherit the old local app's fixed 2026-10-06 start date.

## Import and library

Support selecting a local folder or multiple files and importing CSV/TXT captions. Add ZIP importing as a resumable background import that processes one entry at a time with bounded memory; never load the entire 0.9 GB archive into a short-lived serverless function. Support ZIP entry/path validation and reject traversal and decompression bombs. Provide folder-upload fallback if browser ZIP processing cannot handle a batch safely. Browser uploads are user-selected files; the hosted app cannot silently read G:\.

Match captions by relative path first, then unique basename, then sidecar .txt. Flag ambiguity and missing captions. Recognize matching Reel covers. Preserve subfolders and import campaign content first. Deduplicate by SHA-256 of file contents, with an explicit override for intentional repeat campaigns. Make uploads resumable, show per-file progress, and preserve import state across refreshes. Allow caption edits, preview, filters, topic labels, skip/unskip, and draft export. Skipping must not delete original files or stored assets.

## Schedule

Default to one image post at 18:00 and one Reel at 19:00 every day in Europe/Oslo, adjusting for daylight saving time. Schedule types independently: posts finish after 44 days, Reels after 120. Appending a batch must avoid collisions and previously published content. Optional topic mixing uses filename labels and user tags; do not claim AI visual understanding or performance optimization unless implemented and verified. Flag seasonal topics for review. Allow batch start-date changes and moving wholly unpublished missed items into future slots. Preserve successes and partially published items. Do not publish a backlog in a burst after downtime. Provide calendar and list views.

## Audio is required

Detect whether every Reel has an audio stream and meaningful audible signal; a silent AAC track does not count as ready. Display Missing audio, Silent audio, Existing audio, Processing, Failed, and Ready states. Block automatic approval/publication for silent Reels until audio is supplied and the final export has been verified.

Let the user upload licensed MP3/WAV music, apply tracks to selected Reels or an entire batch, rotate tracks, adjust volume, preserve or mix existing audio, and preview the result. Produce new rendered copies with AAC audio and a Meta-compatible MP4 video stream. Loop or trim music to video length and add short fades. Keep original videos untouched. Verify final duration, sound level, dimensions and file size. No bundled unlicensed music, scraped trending audio, or claim that Meta's music-library picker is available through publishing APIs. Voiceover is an optional later feature requiring an explicit provider and cost, not a fake working control.

Use an FFmpeg-capable asynchronous worker for probing/rendering, with progress, cancellation and durable job state. Do not try to run a long batch of FFmpeg renders inside short-lived Edge Functions. Provide an inexpensive local worker option if needed; explain that local rendering requires the user's computer to remain on. Cloud publication of already rendered/uploaded assets should continue when the dashboard is closed and the user's computer is off.

## Account connection and publishing

Connect the user's Facebook Page and linked Instagram professional account through official Meta APIs. Prefer a guided OAuth setup where available; a personal server-side token setup can be the first working version. Validate that the Instagram account belongs to the selected Page. Keep secrets server-side, never in browser storage, frontend bundles, logs or export files. Show permission/expiration problems plainly. Use the API version and permissions supported by the actual Meta app and follow its app-role/access/review requirements.

Use a real backend scheduler, for example Supabase Cron invoking bounded Edge Functions. Publish each item independently to both destinations rather than depending on Meta automatic cross-sharing. Persist separate platform statuses, container/video IDs, attempts and errors. Use database leases and uniqueness constraints to prevent two workers sending the same item. Persist intent before publishing and retain remote IDs. Unknown outcomes must go to reconciliation/review rather than a blind retry. Safe retries use backoff; pause on revoked/expired credentials. Poll asynchronous processing across jobs instead of keeping an Edge Function sleeping. Facebook submission is not proof of publication. Show Published only after confirmation.

Use signed media URLs that remain fetchable by Meta for the whole ingestion/processing window. Original storage should be private. Authenticate dashboard access and enforce owner-based database/storage policies. Secure scheduler and worker endpoints. No actual posting until the user has connected accounts, reviewed the real batch and activated it.

## Dashboard

Create a clean branded interface with Overview, Library, Calendar, Audio Studio, Publishing Results and Connections. Show remaining posts/Reels, next publication, audio readiness, upload/render progress, setup tasks, missed slots, failures and per-platform links/results. Make the primary path simple: Add batch → Prepare → Review schedule → Activate. Show meaningful in-app alerts; external email notifications are optional and require setup. Separate real integration status from any demonstration data.

## Acceptance checks

Test quoted/multiline Norwegian CSV captions, the 120-Reel/44-post import, excluded cover/preview files, duplicate bytes under renamed files, missing/ambiguous captions, audio detection including silent streams, rendered audible output, Oslo daylight saving transitions, collision-free imports, scheduler operation with the browser closed, expired tokens, Facebook processing, partial Instagram/Facebook success, crashes after send, and worker concurrency. Preserve files and successful platform records. Report which checks are local/mocked and which were verified live. Never represent an unconnected API or a stubbed audio renderer as working.

## Reference implementation

The local reference has CSV import, a queue with independent Instagram/Facebook states, SHA-256 media deduplication, topic mixing, folder caption matching, preview, preflight, and Oslo scheduling. No source files or media are attached to this initial message. Build these behaviors from the brief; ask for import data when needed. Do not claim the user's 164 media assets are uploaded.

## Official references

- https://docs.lovable.dev/integrations/supabase
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/functions/limits
- https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sky-publish-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/91e6ca5f-5a8b-45bb-819d-8305efa17cc1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
