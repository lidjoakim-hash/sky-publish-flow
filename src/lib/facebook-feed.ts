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
  if (p.status === "pending" || p.status === "retry") return "upload_photo";
  if (p.remote_id) return "confirm";
  if (p.container_id) return "create_feed";
  return "upload_photo";
}
