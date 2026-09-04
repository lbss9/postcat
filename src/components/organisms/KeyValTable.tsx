import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import Icon from "@/components/atoms/Icon";
import VarInput from "@/components/molecules/VarInput";
import { emptyRow, type KeyVal } from "@/types";

/**
 * Editable key/value rows (params, headers, urlencoded body). A blank trailing
 * row is kept so the user can always type the next entry; `fixed` turns it
 * into a read-only-key table (path variables).
 */
export default function KeyValTable({
  rows,
  onChange,
  keyPlaceholder,
  fixed,
  vars,
  onSetVar,
  envName,
}: {
  rows: KeyVal[];
  onChange: (rows: KeyVal[]) => void;
  keyPlaceholder: string;
  /** fixed rows (e.g. path variables): key read-only, no auto-append, no delete */
  fixed?: boolean;
  vars?: Record<string, string>;
  onSetVar?: (name: string, value: string) => void;
  envName?: string | null;
}) {
  const { t } = useTranslation();
  function update(id: string, patch: Partial<KeyVal>) {
    let next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    if (!fixed) {
      const last = next[next.length - 1];
      if (last && (last.key || last.value)) next = [...next, emptyRow()];
    }
    onChange(next);
  }
  function remove(id: string) {
    const next = rows.filter((r) => r.id !== id);
    onChange(next.length ? next : [emptyRow()]);
  }

  return (
    <div className="kv-table">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const isBlankLast = !fixed && isLast && !row.key && !row.value;
        return (
          <div className={`kv-row ${row.enabled ? "" : "disabled"}`} key={row.id}>
            <input
              type="checkbox"
              className="kv-check"
              checked={row.enabled}
              disabled={isBlankLast}
              onChange={(e) => update(row.id, { enabled: e.target.checked })}
            />
            <input
              className="kv-input kv-key"
              placeholder={keyPlaceholder}
              value={row.key}
              spellCheck={false}
              readOnly={fixed}
              onChange={(e) => update(row.id, { key: e.target.value })}
            />
            <VarInput
              compact
              value={row.value}
              placeholder={t("kv.value")}
              onChange={(value) => update(row.id, { value })}
              vars={vars}
              onSetVar={onSetVar}
              envName={envName}
            />
            {fixed ? (
              <span className="kv-lock" title={t("params.pathLocked")}>
                :
              </span>
            ) : (
              <Button
                variant="bare"
                className="kv-del"
                title={t("actions.remove")}
                tabIndex={-1}
                onClick={() => remove(row.id)}
                style={{ visibility: isBlankLast ? "hidden" : "visible" }}
              >
                <Icon name="x" size={13} />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
