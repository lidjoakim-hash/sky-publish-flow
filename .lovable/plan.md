# Per-Reel render progress

## What will change
- Show a progress bar and numeric percentage on every Reel with an active render.
- Label queued, rendering, completed, failed, and cancelled states clearly.
- Keep the existing overall completion wheel and honest ETA based only on worker updates.
- Verify the progress calculations and Audio Studio display without starting a real render or publishing anything.

## Technical details
- Extend the render progress presentation with a focused per-job row component.
- Use persisted `render_jobs.progress`; queued jobs remain at 0% and processing jobs never display 100% before worker confirmation.
- Add unit coverage for per-job display progress and run the relevant tests plus preview checks.
