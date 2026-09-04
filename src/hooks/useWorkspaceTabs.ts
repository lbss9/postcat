import { useEffect, useMemo, useState } from "react";
import { normalizeRequest, type RequestState } from "@/types";
import {
  newRequestTab,
  type EnvironmentTab,
  type RequestTab,
  type WorkspaceTab,
} from "@/types/workspace";

const TABS_KEY = "postcat-tabs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Restore the open tabs from the last session (response bodies are dropped). */
function loadTabs(): { tabs: WorkspaceTab[]; activeTabId: string } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS_KEY) || "null");
    if (!saved?.tabs?.length) return null;
    const tabs: WorkspaceTab[] = saved.tabs.map((t: Any) =>
      t.kind === "environment"
        ? { id: t.id, kind: "environment", envId: t.envId }
        : {
            id: t.id,
            kind: "request",
            nodeId: t.nodeId ?? null,
            req: normalizeRequest(t.req),
            res: null,
            error: null,
            loading: false,
            reqTab: t.reqTab ?? "params",
            resTab: "pretty",
            script: null,
            dirty: !!t.dirty,
          },
    );
    const activeTabId = tabs.some((t) => t.id === saved.activeTabId)
      ? saved.activeTabId
      : tabs[0].id;
    return { tabs, activeTabId };
  } catch {
    return null;
  }
}

function persistTabs(tabs: WorkspaceTab[], activeTabId: string) {
  const slim = tabs.map((t) =>
    t.kind === "request"
      ? { id: t.id, kind: "request", nodeId: t.nodeId, req: t.req, reqTab: t.reqTab, dirty: t.dirty }
      : { id: t.id, kind: "environment", envId: t.envId },
  );
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: slim, activeTabId }));
  } catch {
    /* storage full — ignore */
  }
}

/**
 * The workspace tab strip: open request/environment tabs, the active one, and
 * the operations to open/close/patch them. Tabs survive restarts (localStorage).
 */
export function useWorkspaceTabs() {
  const restored = useMemo(() => loadTabs(), []);
  const firstTab = useMemo(() => newRequestTab(), []);
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => restored?.tabs ?? [firstTab]);
  const [activeTabId, setActiveTabId] = useState<string>(
    () => restored?.activeTabId ?? firstTab.id,
  );

  useEffect(() => {
    persistTabs(tabs, activeTabId);
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((tb) => tb.id === activeTabId) ?? tabs[0];
  const activeReq = activeTab?.kind === "request" ? activeTab : null;

  function updateReqTab(id: string, patch: Partial<RequestTab>) {
    setTabs((ts) =>
      ts.map((tb) => (tb.id === id && tb.kind === "request" ? { ...tb, ...patch } : tb)),
    );
  }
  /** Edit the active request; marks the tab dirty. */
  function patchReq(p: Partial<RequestState>) {
    if (!activeReq) return;
    updateReqTab(activeReq.id, { req: { ...activeReq.req, ...p }, dirty: true });
  }
  function newTab() {
    const tab = newRequestTab();
    setTabs((ts) => [...ts, tab]);
    setActiveTabId(tab.id);
  }
  /** Focus an already-open tab for this request, or open a new one. */
  function openRequestTab(req: RequestState, nodeId: string | null) {
    const existing = tabs.find((tb) => {
      if (tb.kind !== "request") return false;
      // a saved request matches by node; an ad-hoc/history one by method + url
      return nodeId
        ? tb.nodeId === nodeId
        : !tb.nodeId && tb.req.method === req.method && tb.req.url === req.url;
    });
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const tab = newRequestTab(normalizeRequest(structuredClone(req)), nodeId);
    setTabs((ts) => [...ts, tab]);
    setActiveTabId(tab.id);
  }
  function openEnvTab(envId: string) {
    const existing = tabs.find((tb) => tb.kind === "environment" && tb.envId === envId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const tab: EnvironmentTab = { id: crypto.randomUUID(), kind: "environment", envId };
    setTabs((ts) => [...ts, tab]);
    setActiveTabId(tab.id);
  }
  function closeTab(id: string) {
    const idx = tabs.findIndex((tb) => tb.id === id);
    let next = tabs.filter((tb) => tb.id !== id);
    if (next.length === 0) {
      const nt = newRequestTab();
      next = [nt];
      setActiveTabId(nt.id);
    } else if (id === activeTabId) {
      setActiveTabId(next[Math.max(0, idx - 1)].id);
    }
    setTabs(next);
  }

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    activeReq,
    updateReqTab,
    patchReq,
    newTab,
    openRequestTab,
    openEnvTab,
    closeTab,
  };
}
