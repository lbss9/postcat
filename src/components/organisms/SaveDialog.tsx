import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import Icon from "@/components/atoms/Icon";
import type { TreeNode } from "@/types";

/** "Save request to…" picker: an indented list of collections and folders. */
export default function SaveDialog({
  nodes,
  onPick,
  onClose,
}: {
  nodes: TreeNode[];
  onPick: (parentId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, TreeNode[]>();
    for (const n of nodes) {
      const k = n.parentId;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    }
    return m;
  }, [nodes]);

  const containers = (parentId: string | null) =>
    (childrenOf.get(parentId) ?? []).filter((n) => n.kind !== "request");

  function render(parentId: string | null, depth: number): ReactNode {
    return containers(parentId).map((n) => (
      <div key={n.id}>
        <Button
          variant="bare"
          className="save-dest"
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => onPick(n.id)}
        >
          <Icon name={n.kind === "collection" ? "library" : "folder"} size={14} />
          <span>{n.name}</span>
        </Button>
        {render(n.id, depth + 1)}
      </div>
    ));
  }

  const roots = containers(null);
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="save-head">{t("save.title")}</div>
        <div className="save-tree">
          {roots.length === 0 ? (
            <p className="side-empty">{t("save.empty")}</p>
          ) : (
            render(null, 0)
          )}
        </div>
        <div className="save-actions">
          <Button variant="bare" className="varpop-btn" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
