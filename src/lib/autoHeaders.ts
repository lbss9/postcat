import type { RequestState } from "./types";

export interface AutoHeader {
  key: string;
  /** the value, or a hint when it's only known at send time */
  value: string;
  /** true when the real value is computed when the request is sent */
  computed?: boolean;
}

const CONTENT_TYPE: Record<string, string> = {
  text: "text/plain",
  json: "application/json",
  javascript: "application/javascript",
  html: "text/html",
  xml: "application/xml",
};

/** Content-Type our engine sets for the current body, or null for no body. */
function bodyContentType(req: RequestState): AutoHeader | null {
  switch (req.bodyType) {
    case "raw":
      return { key: "Content-Type", value: CONTENT_TYPE[req.rawLang] ?? "text/plain" };
    case "urlencoded":
      return { key: "Content-Type", value: "application/x-www-form-urlencoded" };
    case "form-data":
      return { key: "Content-Type", value: "multipart/form-data; boundary=…", computed: true };
    case "binary":
      return { key: "Content-Type", value: "application/octet-stream" };
    default:
      return null;
  }
}

/**
 * The headers our HTTP engine (reqwest) adds on its own — a read-only preview,
 * mirroring what actually goes on the wire. Some values are only known when the
 * request is sent (marked `computed`).
 */
export function computeAutoHeaders(req: RequestState): AutoHeader[] {
  const list: AutoHeader[] = [];

  // Host — from the URL when it's static, otherwise resolved at send time
  const host = /^\s*[a-z]+:\/\/([^/?#{}]+)/i.exec(req.url)?.[1];
  list.push(
    host
      ? { key: "Host", value: host }
      : { key: "Host", value: "computed", computed: true },
  );

  list.push({ key: "User-Agent", value: "PostCat/0.1.0" });
  list.push({ key: "Accept-Encoding", value: "gzip, deflate, br" });
  list.push({ key: "Connection", value: "keep-alive" });

  const ct = bodyContentType(req);
  if (ct) {
    list.push(ct);
    list.push({ key: "Content-Length", value: "computed", computed: true });
  }

  return list;
}

/** Names (lower-cased) of the manual, enabled headers that override an auto one. */
export function overriddenKeys(req: RequestState): Set<string> {
  const set = new Set<string>();
  for (const h of req.headers) {
    if (h.enabled && h.key.trim()) set.add(h.key.trim().toLowerCase());
  }
  return set;
}
