export const METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export type Method = (typeof METHODS)[number];

export type BodyType = "none" | "form-data" | "urlencoded" | "raw" | "binary";
export type RawLang = "text" | "json" | "javascript" | "html" | "xml";
export const RAW_LANGS: RawLang[] = ["text", "json", "javascript", "html", "xml"];

export interface KeyVal {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

/** A form-data field: text or a file (value holds the file path when type is "file"). */
export interface FormField {
  id: string;
  key: string;
  value: string;
  type: "text" | "file";
  enabled: boolean;
}

export interface RequestState {
  method: Method;
  url: string;
  params: KeyVal[];
  /** path variables derived from `:name` segments in the URL */
  pathVars: KeyVal[];
  headers: KeyVal[];
  bodyType: BodyType;
  rawLang: RawLang;
  raw: string;
  formData: FormField[];
  urlencoded: KeyVal[];
  binaryPath: string;
  /** JS that runs before the request is sent (pc.* sandbox) */
  preScript: string;
  /** JS that runs after the response arrives — tests & post-processing */
  postScript: string;
}

/** Sync path-variable rows with the `:name` segments present in the URL, keeping existing values. */
export function syncPathVars(url: string, existing: KeyVal[]): KeyVal[] {
  const path = url.split("?")[0];
  const names: string[] = [];
  const re = /:([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) if (!names.includes(m[1])) names.push(m[1]);
  return names.map((name) => {
    const prev = existing.find((e) => e.key === name);
    return prev ?? { id: crypto.randomUUID(), key: name, value: "", enabled: true };
  });
}

export interface SendResult {
  status: number;
  statusText: string;
  ok: boolean;
  timeMs: number;
  sizeBytes: number;
  headers: [string, string][];
  body: string;
  contentType: string;
  finalUrl: string;
}

export interface HistoryEntry {
  id: string;
  method: Method;
  url: string;
  status: number | null;
  at: number;
  request: RequestState;
}

export type NodeKind = "collection" | "folder" | "request";

export interface TreeNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  request: RequestState | null;
  variables: EnvVar[] | null;
  position: number;
}

export interface EnvVar {
  key: string;
  value: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  isActive: boolean;
  variables: EnvVar[];
  position: number;
}

export function emptyRow(): KeyVal {
  return { id: crypto.randomUUID(), key: "", value: "", enabled: true };
}

export function emptyFormField(): FormField {
  return { id: crypto.randomUUID(), key: "", value: "", type: "text", enabled: true };
}

export function newRequest(): RequestState {
  return {
    method: "GET",
    url: "",
    params: [emptyRow()],
    pathVars: [],
    headers: [emptyRow()],
    bodyType: "none",
    rawLang: "json",
    raw: "",
    formData: [emptyFormField()],
    urlencoded: [emptyRow()],
    binaryPath: "",
    preScript: "",
    postScript: "",
  };
}

/** Fill in any missing fields on a request loaded from disk/history (schema migration). */
export function normalizeRequest(r: Partial<RequestState> | null | undefined): RequestState {
  const base = newRequest();
  if (!r) return base;
  // migrate the old body model (bodyType json|text|form + body string)
  const legacy = r as { body?: string; bodyType?: string };
  let bodyType = r.bodyType as BodyType | undefined;
  let raw = base.raw;
  let rawLang = base.rawLang;
  if (legacy.bodyType === "json" || legacy.bodyType === "text") {
    bodyType = "raw";
    rawLang = legacy.bodyType === "json" ? "json" : "text";
    raw = legacy.body ?? "";
  } else if (legacy.bodyType === "form") {
    bodyType = "urlencoded";
  }
  return {
    method: (r.method as Method) ?? base.method,
    url: r.url ?? base.url,
    params: r.params ?? base.params,
    pathVars: r.pathVars ?? syncPathVars(r.url ?? "", []),
    headers: r.headers ?? base.headers,
    bodyType: bodyType ?? base.bodyType,
    rawLang: r.rawLang ?? rawLang,
    raw: r.raw ?? raw,
    formData: r.formData ?? base.formData,
    urlencoded: r.urlencoded ?? base.urlencoded,
    binaryPath: r.binaryPath ?? base.binaryPath,
    preScript: r.preScript ?? base.preScript,
    postScript: r.postScript ?? base.postScript,
  };
}
