import type { RequestState } from "@/types";

/** Short human label for a request: its URL without the scheme, or a fallback. */
export function reqLabel(req: RequestState, fallback: string): string {
  if (req.url.trim()) return req.url.replace(/^https?:\/\//, "").slice(0, 32);
  return fallback;
}
