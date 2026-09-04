import {
  RAW_LANGS,
  emptyFormField,
  emptyRow,
  newRequest,
  syncPathVars,
  type EnvVar,
  type NodeKind,
  type RawLang,
  type RequestState,
} from "@/types";

/** A node to be created in the tree during import. */
export interface ImportNode {
  kind: NodeKind;
  name: string;
  request?: RequestState;
  variables?: EnvVar[];
  children?: ImportNode[];
}

const uid = () => crypto.randomUUID();

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export function detectFormat(data: Any): "collection" | "openapi" | null {
  if (!data || typeof data !== "object") return null;
  if (data.openapi || data.swagger) return "openapi";
  if (Array.isArray(data.item) || (data.info && typeof data.info.schema === "string"))
    return "collection";
  return null;
}

/* ------------------------- collection format (v2) ------------------------- */

function rawLangOf(v: unknown): RawLang {
  return RAW_LANGS.includes(v as RawLang) ? (v as RawLang) : "text";
}

function mapItemRequest(pr: Any): RequestState {
  const req = newRequest();
  req.method = String(pr?.method ?? "GET").toUpperCase() as RequestState["method"];

  req.headers = [
    ...(pr?.header ?? []).map((h: Any) => ({
      id: uid(),
      key: h?.key ?? "",
      value: h?.value ?? "",
      enabled: !h?.disabled,
    })),
    emptyRow(),
  ];

  let urlRaw = "";
  let query: Any[] = [];
  let variable: Any[] = [];
  if (typeof pr?.url === "string") urlRaw = pr.url;
  else if (pr?.url) {
    urlRaw = pr.url.raw ?? "";
    query = pr.url.query ?? [];
    variable = pr.url.variable ?? [];
  }
  req.url = urlRaw;
  req.params = [
    ...query.map((q) => ({
      id: uid(),
      key: q?.key ?? "",
      value: q?.value ?? "",
      enabled: !q?.disabled,
    })),
    emptyRow(),
  ];
  req.pathVars = syncPathVars(
    urlRaw,
    variable.map((v) => ({ id: uid(), key: v?.key ?? "", value: v?.value ?? "", enabled: true })),
  );

  const body = pr?.body;
  if (body?.mode === "raw") {
    req.bodyType = "raw";
    req.raw = body.raw ?? "";
    req.rawLang = rawLangOf(body.options?.raw?.language);
  } else if (body?.mode === "urlencoded") {
    req.bodyType = "urlencoded";
    req.urlencoded = [
      ...(body.urlencoded ?? []).map((u: Any) => ({
        id: uid(),
        key: u?.key ?? "",
        value: u?.value ?? "",
        enabled: !u?.disabled,
      })),
      emptyRow(),
    ];
  } else if (body?.mode === "formdata") {
    req.bodyType = "form-data";
    req.formData = [
      ...(body.formdata ?? []).map((f: Any) => ({
        id: uid(),
        key: f?.key ?? "",
        value: f?.type === "file" ? f?.src ?? "" : f?.value ?? "",
        type: f?.type === "file" ? ("file" as const) : ("text" as const),
        enabled: !f?.disabled,
      })),
      emptyFormField(),
    ];
  } else if (body?.mode === "file") {
    req.bodyType = "binary";
    req.binaryPath = body.file?.src ?? "";
  }
  return req;
}

function mapItem(item: Any): ImportNode {
  // a folder has an "item" array; a request has a "request"
  if (Array.isArray(item?.item)) {
    return {
      kind: "folder",
      name: item?.name ?? "Folder",
      variables: mapVars(item?.variable),
      children: item.item.map(mapItem),
    };
  }
  return {
    kind: "request",
    name: item?.name ?? item?.request?.url?.raw ?? "Request",
    request: mapItemRequest(item?.request ?? {}),
  };
}

function mapVars(list: Any): EnvVar[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list.map((v) => ({ key: v?.key ?? "", value: String(v?.value ?? ""), enabled: true }));
}

export function parseCollection(data: Any): ImportNode {
  return {
    kind: "collection",
    name: data?.info?.name ?? "Imported collection",
    variables: mapVars(data?.variable),
    children: (data?.item ?? []).map(mapItem),
  };
}

/* -------------------------------- OpenAPI --------------------------------- */

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

function openApiBaseUrl(data: Any): string {
  if (Array.isArray(data?.servers) && data.servers[0]?.url) return String(data.servers[0].url);
  // swagger 2
  if (data?.host) {
    const scheme = data.schemes?.[0] ?? "https";
    return `${scheme}://${data.host}${data.basePath ?? ""}`;
  }
  return "";
}

export function parseOpenApi(data: Any): ImportNode {
  const base = openApiBaseUrl(data).replace(/\/$/, "");
  const children: ImportNode[] = [];
  const paths = data?.paths ?? {};
  for (const path of Object.keys(paths)) {
    const ops = paths[path] ?? {};
    for (const method of HTTP_METHODS) {
      const op = ops[method];
      if (!op) continue;
      const req = newRequest();
      req.method = method.toUpperCase() as RequestState["method"];
      // OpenAPI uses {param}; convert to our :param path variables
      const localPath = path.replace(/\{([^}]+)\}/g, ":$1");
      req.url = `${base}${localPath}`;
      req.pathVars = syncPathVars(req.url, []);
      children.push({
        kind: "request",
        name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
        request: req,
      });
    }
  }
  return {
    kind: "collection",
    name: data?.info?.title ?? "Imported API",
    children,
  };
}

/* --------------------------------- entry ---------------------------------- */

export function parseImport(text: string): ImportNode {
  const data = JSON.parse(text);
  const fmt = detectFormat(data);
  if (fmt === "collection") return parseCollection(data);
  if (fmt === "openapi") return parseOpenApi(data);
  throw new Error("unknown-format");
}

/* -------------------- serialize to collection JSON (v2.1) ------------------ */

import type { TreeNode } from "@/types";

function reqToJson(r: RequestState): Any {
  const header = r.headers
    .filter((h) => h.key)
    .map((h) => ({ key: h.key, value: h.value, disabled: !h.enabled || undefined }));
  const query = r.params
    .filter((p) => p.key)
    .map((p) => ({ key: p.key, value: p.value, disabled: !p.enabled || undefined }));
  const variable = r.pathVars
    .filter((p) => p.key)
    .map((p) => ({ key: p.key, value: p.value }));

  const out: Any = {
    method: r.method,
    header,
    url: { raw: r.url, query: query.length ? query : undefined, variable: variable.length ? variable : undefined },
  };

  if (r.bodyType === "raw") {
    out.body = { mode: "raw", raw: r.raw, options: { raw: { language: r.rawLang } } };
  } else if (r.bodyType === "urlencoded") {
    out.body = {
      mode: "urlencoded",
      urlencoded: r.urlencoded
        .filter((u) => u.key)
        .map((u) => ({ key: u.key, value: u.value, disabled: !u.enabled || undefined })),
    };
  } else if (r.bodyType === "form-data") {
    out.body = {
      mode: "formdata",
      formdata: r.formData
        .filter((f) => f.key)
        .map((f) =>
          f.type === "file"
            ? { key: f.key, type: "file", src: f.value, disabled: !f.enabled || undefined }
            : { key: f.key, type: "text", value: f.value, disabled: !f.enabled || undefined },
        ),
    };
  } else if (r.bodyType === "binary") {
    out.body = { mode: "file", file: { src: r.binaryPath } };
  }
  return out;
}

function nodeToItem(node: TreeNode, byParent: Map<string | null, TreeNode[]>): Any {
  if (node.kind === "request") {
    return { name: node.name, request: node.request ? reqToJson(node.request) : {} };
  }
  return {
    name: node.name,
    item: (byParent.get(node.id) ?? []).map((c) => nodeToItem(c, byParent)),
  };
}

export function serializeCollection(root: TreeNode, nodes: TreeNode[]): string {
  const byParent = new Map<string | null, TreeNode[]>();
  for (const n of nodes) {
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId)!.push(n);
  }
  const collection = {
    info: {
      name: root.name,
      // These two fields are the collection interchange format's required
      // identifiers — kept verbatim so other API tools can import the file.
      _postman_id: crypto.randomUUID(),
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: (byParent.get(root.id) ?? []).map((c) => nodeToItem(c, byParent)),
    variable: (root.variables ?? [])
      .filter((v) => v.key)
      .map((v) => ({ key: v.key, value: v.value })),
  };
  return JSON.stringify(collection, null, 2);
}
