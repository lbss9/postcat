import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import Icon from "@/components/atoms/Icon";
import { useContextMenu, type ContextMenuItem } from "@/components/molecules/ContextMenu";
import type { Environment, TreeNode } from "@/types";
import type { WorkspaceTab } from "@/types/workspace";
import { reqLabel } from "@/utils/request";

/** The workspace tab strip: scrollable tabs plus a pinned "new tab" button. */
export default function TabBar({
  tabs,
  activeTabId,
  nodesById,
  environments,
  onSelect,
  onClose,
  onNew,
  onDuplicate,
  onCloseOthers,
  onCloseAll,
}: {
  tabs: WorkspaceTab[];
  activeTabId: string;
  nodesById: Map<string, TreeNode>;
  environments: Environment[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseAll: () => void;
}) {
  const { t } = useTranslation();
  const { open } = useContextMenu();
  const scrollRef = useRef<HTMLDivElement>(null);

  function tabMenu(tb: WorkspaceTab): ContextMenuItem[] {
    const items: ContextMenuItem[] = [
      { label: t("ctx.newTab"), icon: "plus", onSelect: onNew },
    ];
    if (tb.kind === "request") {
      items.push({ label: t("ctx.duplicateTab"), icon: "duplicate", onSelect: () => onDuplicate(tb.id) });
    }
    items.push(
      { separator: true },
      { label: t("ctx.close"), icon: "x", shortcut: "Ctrl+W", onSelect: () => onClose(tb.id) },
      {
        label: t("ctx.closeOthers"),
        onSelect: () => onCloseOthers(tb.id),
        disabled: tabs.length < 2,
      },
      { label: t("ctx.closeAll"), danger: true, onSelect: onCloseAll },
    );
    return items;
  }

  // keep the active tab visible, and let the wheel scroll the tab strip
  useEffect(() => {
    const el = scrollRef.current?.querySelector(".wtab.active") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  return (
    <div className="tabbar">
      <div
        className="tabbar-scroll"
        ref={scrollRef}
        onWheel={(e) => {
          if (scrollRef.current && e.deltaY !== 0) {
            scrollRef.current.scrollLeft += e.deltaY;
          }
        }}
      >
        {tabs.map((tb) => {
          const label =
            tb.kind === "request"
              ? tb.nodeId
                ? nodesById.get(tb.nodeId)?.name ?? reqLabel(tb.req, t("side.newRequestName"))
                : reqLabel(tb.req, t("side.newRequestName"))
              : environments.find((e) => e.id === tb.envId)?.name ?? t("side.newEnvName");
          const unsaved = tb.kind === "request" && (!tb.nodeId || tb.dirty);
          return (
            <div
              key={tb.id}
              className={`wtab ${tb.id === activeTabId ? "active" : ""} ${
                unsaved ? "unsaved" : ""
              }`}
              onClick={() => onSelect(tb.id)}
              onContextMenu={(e) => open(e, tabMenu(tb))}
              title={label}
            >
              {tb.kind === "request" ? (
                <span className={`method-tag m-${tb.req.method.toLowerCase()}`}>
                  {tb.req.method}
                </span>
              ) : (
                <Icon name="braces" size={13} className="wtab-env" />
              )}
              <span className="wtab-label" title={unsaved ? t("tab.unsaved") : label}>
                {label}
              </span>
              <Button
                variant="bare"
                className="wtab-close"
                aria-label={t("actions.clear")}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tb.id);
                }}
              >
                <Icon name="x" size={13} />
              </Button>
            </div>
          );
        })}
      </div>
      <Button variant="bare" className="tabbar-new" onClick={onNew} title={t("menu.newRequest")}>
        <Icon name="plus" size={16} />
      </Button>
    </div>
  );
}
