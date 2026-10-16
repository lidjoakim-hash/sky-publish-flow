/**
 * Pure rules for Facebook feed posts with an attached image (unpublished photo upload + Page /feed).
 * No I/O — the publisher persists intent between steps; these helpers only decide payloads and the
 * next action, so an ambiguous response can never trigger a blind duplicate feed creation.
 */

/** Which businesses publish image posts as feed posts (caption + attached photo) instead of direct photo objects. */
const FEED_FORMAT_BRANDS = new Set(["lidverk"]);

export type FacebookPostFormat = "photo" | "feed";
/** Existing brands keep the legacy direct-photo behavior; only listed brands use the feed format. */
export function facebookPostFormat(brand: string): FacebookPostFormat {
  return FEED_FORMAT_BRANDS.has(brand) ? "feed" : "photo";
}

/** Step 1 payload: upload the photo unpublished so it can be attached to a feed post. */
export function buildPhotoUploadParams(imageUrl: string) {
  return { url: imageUrl, published: "false" } as const;
}

/** Step 2 payload: create the feed post with the full caption and the uploaded photo attached. */
export function buildFeedPostParams(photoId: string, caption: string) {
  return { message: caption, attached_media: JSON.stringify([{ media_fbid: photoId }]) } as const;
}

export interface FeedPostState {
  status: string;
  /** Uploaded (unpublished) photo id once step 1 succeeded. */
  container_id: string | null;
  /** Feed post id once step 2 succeeded — set before any confirmation, so the feed step never repeats. */
  remote_id: string | null;
}

/**
 * Next action for a feed-format image post. Once remote_id exists the answer is always "confirm",
 * never "create_feed" again — an interrupted or ambiguous feed creation stays "unknown" for review.
 */
export function feedPostNextAction(p: FeedPostState): "upload_photo" | "create_feed" | "confirm" {
  // A saved feed post id always wins: even on a retry-status row we only confirm it, never recreate.
  if (p.remote_id) return "confirm";
  if (p.status === "pending" || p.status === "retry") return "upload_photo";
  if (p.container_id) return "create_feed";
  return "upload_photo";
}

/**
 * Once feed intent is persisted (status "publishing"), any ambiguous outcome must become
 * "unknown" for review — a retry would re-upload the photo and create a duplicate feed post.
 * Returns "unknown" only for feed-format brands in that state; everything else keeps existing behavior.
 */
export function feedErrorOutcome(p: { platform: string; brand: string; persistedStatus: string }): "unknown" | null {
  if (p.platform === "facebook" && facebookPostFormat(p.brand) === "feed" && p.persistedStatus === "publishing") return "unknown";
  return null;
}

/** A feed post counts as published only when Meta confirms it is published AND returns its link. */
export function feedConfirmOutcome(p: { is_published?: boolean; permalink_url?: string }): "published" | "defer" {
  return p.is_published === true && !!p.permalink_url ? "published" : "defer";
}

/**
 * Legacy rows (created before the feed format) hold an already-published direct photo id.
 * Attaching such a photo to a new feed post would duplicate it — refuse instead.
 */
export function feedCreateGuard(photo: { is_published?: boolean }): "proceed" | "unknown" {
  return photo.is_published === true ? "unknown" : "proceed";
}
