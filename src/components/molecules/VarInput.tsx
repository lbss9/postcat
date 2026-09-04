import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Wrap every {{var}} in a solid pill. The braces keep their width (so the
 * caret in the transparent input below stays aligned) but are rendered
 * invisible, so the pill reads as a clean solid chip of just the name.
 * Variables not defined in the active scope get a muted "undefined" pill.
 */
function renderHighlight(text: string, vars?: Record<string, string>): string {
  return escapeHtml(text).replace(/\{\{\s*[\w.-]+\s*\}\}/g, (m) => {
    const name = m.replace(/[{}]/g, "").trim();
    const i = m.indexOf(name);
    const open = m.slice(0, i);
    const close = m.slice(i + name.length);
    const undef = vars && !(name in vars) ? " undef" : "";
    return `<span class="var-pill${undef}"><span class="vb">${open}</span>${name}<span class="vb">${close}</span></span>`;
  });
}

interface EditState {
  name: string;
  top: number;
  left: number;
}

/**
 * Single-line input that shows {{variables}} as solid pills. Clicking a pill
 * opens a small popover to edit that variable's value in the active environment.
 * The highlight layer sits behind a transparent-text input; the pill uses
 * box-shadow (not padding) so the caret stays aligned.
 */
export default function VarInput({
  value,
  onChange,
  onEnter,
  placeholder,
  vars,
  onSetVar,
  envName,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  vars?: Record<string, string>;
  onSetVar?: (name: string, value: string) => void;
  envName?: string | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const mirror = useRef<HTMLDivElement>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!edit) return;
    const close = () => setEdit(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [edit]);

  function onPillClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (!el.classList.contains("var-pill")) return;
    e.stopPropagation();
    const m = el.textContent?.match(/\{\{\s*([\w.-]+)\s*\}\}/);
    if (!m) return;
    const rect = el.getBoundingClientRect();
    setDraft(vars?.[m[1]] ?? "");
    setEdit({ name: m[1], top: rect.bottom + 6, left: rect.left });
  }

  function commit() {
    if (edit) onSetVar?.(edit.name, draft);
    setEdit(null);
  }

  const known = edit ? vars && edit.name in vars : false;

  return (
    <div className={`varinput ${compact ? "compact" : ""}`}>
      <input
        className="varinput-real"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      />
      {/* highlight layer sits ON TOP; it's click-through except for pills */}
      <div
        className="varinput-hl"
        ref={mirror}
        onClick={onPillClick}
        dangerouslySetInnerHTML={{ __html: renderHighlight(value, vars) }}
      />

      {edit && (
        <div
          className="varpop"
          style={{ top: edit.top, left: edit.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="varpop-name">{`{{${edit.name}}}`}</div>
          <input
            className="varpop-input mono"
            autoFocus
            value={draft}
            placeholder={t("side.varValue")}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEdit(null);
            }}
          />
          <div className="varpop-hint">
            {known
              ? t("side.varPopTarget", { env: envName ?? "—" })
              : t("side.varPopNew", { env: envName ?? "—" })}
          </div>
          <div className="varpop-actions">
            <Button variant="bare" className="varpop-btn" onClick={() => setEdit(null)}>
              {t("actions.cancel")}
            </Button>
            <Button variant="bare" className="varpop-btn primary" onClick={commit}>
              {t("actions.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
