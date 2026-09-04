/**
 * Workspace tab model — what the main tab strip holds. A tab is either an
 * open request (with its own response/loading state) or an environment editor.
 */
import { newRequest, type RequestState, type SendResult } from "@/types";
import type { ScriptOutcome } from "@/scripting/runner";

/** Sub-tabs of the request builder. */
export type ReqTab = "params" | "headers" | "body" | "scripts";
/** Sub-tabs of the response panel. */
export type ResTab = "pretty" | "raw" | "headers" | "tests";

export interface RequestTab {
  id: string;
  kind: "request";
  /** collection node this tab is bound to, or null for an unsaved request */
  nodeId: string | null;
  req: RequestState;
  res: SendResult | null;
  error: string | null;
  loading: boolean;
  reqTab: ReqTab;
  resTab: ResTab;
  /** result of the post-response script (tests + logs), if any */
  script: ScriptOutcome | null;
  /** has unsaved edits (or was never saved to a folder) */
  dirty: boolean;
}

export interface EnvironmentTab {
  id: string;
  kind: "environment";
  envId: string;
}

export type WorkspaceTab = RequestTab | EnvironmentTab;

/** A fresh request tab, optionally pre-filled and bound to a node. */
export function newRequestTab(req?: RequestState, nodeId: string | null = null): RequestTab {
  return {
    id: crypto.randomUUID(),
    kind: "request",
    nodeId,
    req: req ?? newRequest(),
    res: null,
    error: null,
    loading: false,
    reqTab: "params",
    resTab: "pretty",
    script: null,
    dirty: false,
  };
}
