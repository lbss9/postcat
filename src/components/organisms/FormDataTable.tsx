import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import Icon from "@/components/atoms/Icon";
import Dropdown from "@/components/molecules/Dropdown";
import VarInput from "@/components/molecules/VarInput";
import { emptyFormField, type FormField } from "@/types";
import { baseName, pickFile } from "@/utils/file";

/** multipart/form-data rows: each field is either text or a file picked from disk. */
export default function FormDataTable({
  rows,
  onChange,
  vars,
  onSetVar,
  envName,
}: {
  rows: FormField[];
  onChange: (rows: FormField[]) => void;
  vars?: Record<string, string>;
  onSetVar?: (name: string, value: string) => void;
  envName?: string | null;
}) {
  const { t } = useTranslation();
  function update(id: string, patch: Partial<FormField>) {
    let next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    const last = next[next.length - 1];
    if (last && (last.key || last.value)) next = [...next, emptyFormField()];
    onChange(next);
  }
  function remove(id: string) {
    const next = rows.filter((r) => r.id !== id);
    onChange(next.length ? next : [emptyFormField()]);
  }

  return (
    <div className="fd-table">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const blank = isLast && !row.key && !row.value;
        return (
          <div className={`fd-row ${row.enabled ? "" : "disabled"}`} key={row.id}>
            <input
              type="checkbox"
              className="kv-check"
              checked={row.enabled}
              disabled={blank}
              onChange={(e) => update(row.id, { enabled: e.target.checked })}
            />
            <input
              className="kv-input mono"
              placeholder={t("side.varKey")}
              value={row.key}
              spellCheck={false}
              onChange={(e) => update(row.id, { key: e.target.value })}
            />
            <Dropdown
              className="fd-type-dd"
              value={row.type}
              options={[
                { value: "text", label: t("body.fdText") },
                { value: "file", label: t("body.fdFile") },
              ]}
              onChange={(v) => update(row.id, { type: v as "text" | "file", value: "" })}
            />
            {row.type === "text" ? (
              <VarInput
                compact
                value={row.value}
                placeholder={t("side.varValue")}
                onChange={(value) => update(row.id, { value })}
                vars={vars}
                onSetVar={onSetVar}
                envName={envName}
              />
            ) : (
              <Button
                variant="bare"
                className="fd-file"
                title={row.value}
                onClick={() => pickFile((p) => update(row.id, { value: p }))}
              >
                {row.value ? baseName(row.value) : t("body.selectFile")}
              </Button>
            )}
            <Button
              variant="bare"
              className="kv-del"
              tabIndex={-1}
              style={{ visibility: blank ? "hidden" : "visible" }}
              onClick={() => remove(row.id)}
            >
              <Icon name="x" size={13} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
