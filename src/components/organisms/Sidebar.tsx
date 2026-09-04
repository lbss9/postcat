import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "@/components/atoms/Icon";
import Button from "@/components/atoms/Button";
import { useContextMenu, type ContextMenuItem } from "@/components/molecules/ContextMenu";
import type {
  Environment,
  HistoryEntry,
  NodeKind,
  TreeNode,
} from "@/types";

type SideTab = "collections" | "environments" | "history";

/** id of the node currently being dragged (module-scoped: one sidebar at a time). */
let draggingId: string | null = null;

export interface SidebarProps {
  // requests (collections tree + loose requests + history)
  nodes: TreeNode[];
  activeNodeId: string | null;
  onCreateNode: (kind: NodeKind) => void;
  onNewRequest: () => void;
  onAddFolder: (parentId: string) => void;
  onAddRequest: (parentId: string) => void;
  onRenameNode: (id: string, name: string) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (node: TreeNode) => void;
  onOpenRequest: (node: TreeNode) => void;
  onMoveNode: (id: string, parentId: string | null, index: number) => void;
  onExportNode: (node: TreeNode) => void;
  onImport: () => void;
  // environments
  environments: Environment[];
  onCreateEnv: () => void;
  onOpenEnv: (id: string) => void;
  onDeleteEnv: (id: string) => void;
  onSetActiveEnv: (id: string) => void;
  // history
  history: HistoryEntry[];
  onOpenHistory: (h: HistoryEntry) => void;
  onClearHistory: () => void;
}

export default function Sidebar(props: SidebarProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SideTab>("collections");

  const tabs: { id: SideTab; label: string; icon: IconName }[] = [
    { id: "collections", label: t("side.collections"), icon: "library" },
    { id: "environments", label: t("side.environments"), icon: "layers" },
    { id: "history", label: t("side.history"), icon: "clock" },
  ];

  return (
    <aside className="sidebar">
      <div className="side-tabs">
        {tabs.map((tb) => (
          <Button
            variant="bare"
            key={tb.id}
            className={`side-tab ${tab === tb.id ? "active" : ""}`}
            onClick={() => setTab(tb.id)}
          >
            <Icon name={tb.icon} size={14} />
            <span>{tb.label}</span>
          </Button>
        ))}
      </div>

      {tab === "collections" && <CollectionsPanel {...props} />}
      {tab === "environments" && <EnvironmentsPanel {...props} />}
      {tab === "history" && <HistoryPanel {...props} />}
    </aside>
  );
}

/* -------------------------------- requests --------------------------------- */

function NewMenu({
  onNewRequest,
  onNewFolder,
}: {
  onNewRequest: () => void;
  onNewFolder: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const items = [
    { label: t("side.newRequestName"), action: onNewRequest },
    { label: t("side.newFolderName"), action: onNewFolder },
  ];
  return (
    <div className="newmenu">
      <Button variant="bare" className="side-add" icon="plus" iconSize={13} onClick={() => setOpen((o) => !o)}>
        {t("side.new")}
      </Button>
      {open && (
        <>
          <div className="newmenu-backdrop" onClick={() => setOpen(false)} />
          <div className="newmenu-pop">
            {items.map((it) => (
              <Button
                variant="bare"
                key={it.label}
                className="menu-item"
                onClick={() => {
                  it.action();
                  setOpen(false);
                }}
              >
                <span>{it.label}</span>
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CollectionsPanel(props: SidebarProps) {
  const { nodes, onCreateNode } = props;
  const { t } = useTranslation();
  const { open } = useContextMenu();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // right-click on empty space in the tree
  const emptyMenu: ContextMenuItem[] = [
    { label: t("ctx.newRequest"), icon: "file-plus", onSelect: props.onNewRequest },
    { label: t("ctx.newFolder"), icon: "folder-plus", onSelect: () => onCreateNode("folder") },
    { separator: true },
    { label: t("ctx.import"), icon: "upload", onSelect: props.onImport },
  ];

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, TreeNode[]>();
    for (const n of nodes) {
      const key = n.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return map;
  }, [nodes]);

  const nodesById = useMemo(() => {
    const m = new Map<string, TreeNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const roots = childrenOf.get(null) ?? [];

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="side-panel">
      <div className="side-panel-head">
        <span className="side-panel-title">{t("side.collections")}</span>
        <div className="side-head-actions">
          <NewMenu
            onNewRequest={props.onNewRequest}
            onNewFolder={() => onCreateNode("folder")}
          />
        </div>
      </div>
      <div
        className="tree"
        onContextMenu={(e) => open(e, emptyMenu)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (draggingId) props.onMoveNode(draggingId, null, roots.length);
          draggingId = null;
        }}
      >
        {roots.length === 0 && (
          <p className="side-empty">{t("side.noCollections")}</p>
        )}
        {roots.map((n) => (
          <TreeRow
            key={n.id}
            node={n}
            depth={0}
            childrenOf={childrenOf}
            nodesById={nodesById}
            expanded={expanded}
            onToggle={toggle}
            props={props}
          />
        ))}
      </div>
    </div>
  );
}

function isDescendant(
  nodesById: Map<string, TreeNode>,
  ancestorId: string,
  nodeId: string,
): boolean {
  let cur = nodesById.get(nodeId)?.parentId ?? null;
  while (cur) {
    if (cur === ancestorId) return true;
    cur = nodesById.get(cur)?.parentId ?? null;
  }
  return false;
}

function TreeRow({
  node,
  depth,
  childrenOf,
  nodesById,
  expanded,
  onToggle,
  props,
}: {
  node: TreeNode;
  depth: number;
  childrenOf: Map<string | null, TreeNode[]>;
  nodesById: Map<string, TreeNode>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  props: SidebarProps;
}) {
  const { t } = useTranslation();
  const { open } = useContextMenu();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [dropHint, setDropHint] = useState(false);
  const isContainer = node.kind !== "request";
  const isCollection = node.kind === "collection";
  const isOpen = expanded.has(node.id);
  const kids = childrenOf.get(node.id) ?? [];

  function commit() {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== node.name) props.onRenameNode(node.id, name);
    else setDraft(node.name);
  }

  function startRename() {
    setDraft(node.name);
    setEditing(true);
  }

  function nodeMenu(): ContextMenuItem[] {
    if (isContainer) {
      const items: ContextMenuItem[] = [
        {
          label: t("ctx.newRequestHere"),
          icon: "file-plus",
          onSelect: () => {
            props.onAddRequest(node.id);
          },
        },
        { label: t("ctx.newFolderHere"), icon: "folder-plus", onSelect: () => props.onAddFolder(node.id) },
        { separator: true },
        { label: t("ctx.rename"), icon: "pencil", onSelect: startRename },
      ];
      if (isCollection) {
        items.push({ label: t("ctx.export"), icon: "download", onSelect: () => props.onExportNode(node) });
      }
      items.push(
        { separator: true },
        { label: t("ctx.delete"), icon: "trash", danger: true, onSelect: () => props.onDeleteNode(node.id) },
      );
      return items;
    }
    return [
      { label: t("ctx.open"), icon: "open-tab", onSelect: () => props.onOpenRequest(node) },
      { label: t("ctx.rename"), icon: "pencil", onSelect: startRename },
      { label: t("ctx.duplicate"), icon: "duplicate", onSelect: () => props.onDuplicateNode(node) },
      { separator: true },
      { label: t("ctx.delete"), icon: "trash", danger: true, onSelect: () => props.onDeleteNode(node.id) },
    ];
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDropHint(false);
    const dragged = draggingId;
    draggingId = null;
    if (!dragged || dragged === node.id) return;
    if (isDescendant(nodesById, dragged, node.id)) return; // no cycles
    if (isContainer) {
      props.onMoveNode(dragged, node.id, (childrenOf.get(node.id) ?? []).length);
    } else {
      const siblings = childrenOf.get(node.parentId) ?? [];
      const idx = siblings.findIndex((s) => s.id === node.id);
      props.onMoveNode(dragged, node.parentId, idx + 1);
    }
  }

  return (
    <div className="tree-branch">
      <div
        className={`tree-row ${node.kind} ${
          props.activeNodeId === node.id ? "active" : ""
        } ${dropHint ? "drop-hint" : ""}`}
        draggable
        onDragStart={(e) => {
          draggingId = node.id;
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (draggingId && draggingId !== node.id) setDropHint(true);
        }}
        onDragLeave={() => setDropHint(false)}
        onDrop={handleDrop}
        onClick={() => (isContainer ? onToggle(node.id) : props.onOpenRequest(node))}
        onContextMenu={(e) => open(e, nodeMenu())}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename();
        }}
      >
        {isContainer ? (
          <span className={`tw-chevron ${isOpen ? "open" : ""}`}>
            <Icon name="chevron" size={13} />
          </span>
        ) : (
          <span className={`method-tag m-${(node.request?.method ?? "get").toLowerCase()}`}>
            {node.request?.method ?? "GET"}
          </span>
        )}

        {editing ? (
          <input
            className="tree-edit"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(node.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span className="tree-name">{node.name}</span>
        )}

        <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
          {isContainer && (
            <>
              <Button
                variant="bare"
                className="tree-act"
                title={t("side.addRequest")}
                onClick={() => props.onAddRequest(node.id)}
              >
                <Icon name="plus" size={15} />
              </Button>
              <Button
                variant="bare"
                className="tree-act"
                title={t("side.addFolder")}
                onClick={() => props.onAddFolder(node.id)}
              >
                <Icon name="folder-plus" size={14} />
              </Button>
            </>
          )}
          {isCollection && (
            <Button
              variant="bare"
              className="tree-act"
              title={t("side.export")}
              onClick={() => props.onExportNode(node)}
            >
              <Icon name="download" size={14} />
            </Button>
          )}
          <Button
            variant="bare"
            className="tree-act danger"
            title={t("actions.remove")}
            onClick={() => props.onDeleteNode(node.id)}
          >
            <Icon name="trash" size={14} />
          </Button>
        </span>
      </div>

      {isContainer && isOpen && (
        <div className="tree-children">
          {kids.length === 0 && <p className="tree-empty">{t("side.emptyFolder")}</p>}
          {kids.map((k) => (
            <TreeRow
              key={k.id}
              node={k}
              depth={depth + 1}
              childrenOf={childrenOf}
              nodesById={nodesById}
              expanded={expanded}
              onToggle={onToggle}
              props={props}
            />
          ))}
        </div>
      )}
    </div>
  );
}


/* ------------------------------- environments ------------------------------ */

function EnvironmentsPanel({
  environments,
  onCreateEnv,
  onOpenEnv,
  onDeleteEnv,
  onSetActiveEnv,
}: SidebarProps) {
  const { t } = useTranslation();
  const { open } = useContextMenu();

  function envMenu(env: Environment): ContextMenuItem[] {
    return [
      { label: t("ctx.open"), icon: "open-tab", onSelect: () => onOpenEnv(env.id) },
      {
        label: env.isActive ? t("ctx.deactivate") : t("ctx.setActive"),
        icon: "power",
        onSelect: () => onSetActiveEnv(env.isActive ? "" : env.id),
      },
      { separator: true },
      { label: t("ctx.delete"), icon: "trash", danger: true, onSelect: () => onDeleteEnv(env.id) },
    ];
  }

  return (
    <div className="side-panel">
      <div className="side-panel-head">
        <span className="side-panel-title">{t("side.environments")}</span>
        <Button variant="bare" className="side-add" icon="plus" iconSize={13} onClick={onCreateEnv}>
          {t("side.newEnv")}
        </Button>
      </div>
      <div
        className="env-list"
        onContextMenu={(e) =>
          open(e, [{ label: t("ctx.newEnv"), icon: "plus", onSelect: onCreateEnv }])
        }
      >
        {environments.length === 0 && <p className="side-empty">{t("side.noEnvs")}</p>}
        {environments.map((env) => (
          <div
            key={env.id}
            className={`env-row-simple ${env.isActive ? "active" : ""}`}
            onContextMenu={(e) => open(e, envMenu(env))}
          >
            <Button
              variant="bare"
              className={`env-radio ${env.isActive ? "on" : ""}`}
              title={t("side.setActive")}
              onClick={() => onSetActiveEnv(env.isActive ? "" : env.id)}
            />
            <Button variant="bare" className="env-open" onClick={() => onOpenEnv(env.id)} title={env.name}>
              <span className="env-open-name">{env.name}</span>
              {env.isActive && <span className="env-badge">{t("side.active")}</span>}
            </Button>
            <Button
              variant="bare"
              className="tree-act danger"
              title={t("actions.remove")}
              onClick={() => onDeleteEnv(env.id)}
            >
              <Icon name="x" size={13} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- history --------------------------------- */

function HistoryPanel({ history, onOpenHistory, onClearHistory }: SidebarProps) {
  const { t } = useTranslation();
  const { open } = useContextMenu();

  function histMenu(h: HistoryEntry): ContextMenuItem[] {
    return [
      { label: t("ctx.openRequest"), icon: "open-tab", onSelect: () => onOpenHistory(h) },
      { separator: true },
      { label: t("ctx.clearHistory"), icon: "trash", danger: true, onSelect: onClearHistory },
    ];
  }

  return (
    <div className="side-panel">
      <div className="side-panel-head">
        <span className="side-panel-title">{t("side.history")}</span>
        {history.length > 0 && (
          <Button
            variant="bare"
            className="side-icon-btn"
            title={t("side.clearRecent")}
            onClick={onClearHistory}
          >
            <Icon name="trash" size={14} />
          </Button>
        )}
      </div>
      <div className="hist-list">
        {history.length === 0 && (
          <p className="side-empty">{t("sidebar.historyEmpty")}</p>
        )}
        {history.map((h) => (
          <Button
            variant="bare"
            key={h.id}
            className="hist-row"
            onClick={() => onOpenHistory(h)}
            onContextMenu={(e) => open(e, histMenu(h))}
            title={h.url}
          >
            <span className={`method-tag m-${h.method.toLowerCase()}`}>{h.method}</span>
            <span className="hist-url">{h.url || "—"}</span>
            {h.status != null && (
              <span className={`status-dot ${statusClass(h.status)}`} />
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "s-2xx";
  if (status >= 300 && status < 400) return "s-3xx";
  if (status >= 400 && status < 500) return "s-4xx";
  if (status >= 500) return "s-5xx";
  return "s-0";
}
