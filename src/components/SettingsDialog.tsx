import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Button from "./Button";
import Icon from "./Icon";
import { LANGUAGES } from "../i18n";
import { AUTO_ID } from "../lib/useTheme";
import {
  DEFAULT_EDITOR_SIZE,
  DEFAULT_INDENT,
  DEFAULT_MONO,
  DEFAULT_SANS,
  DEFAULT_UI_SIZE,
  type FontOverride,
  type Theme,
} from "../lib/themes";

export type SettingsTab =
  | "general"
  | "appearance"
  | "network"
  | "shortcuts"
  | "data"
  | "about";

const TABS: SettingsTab[] = [
  "general",
  "appearance",
  "network",
  "shortcuts",
  "data",
  "about",
];

const SWATCH_KEYS = ["accent", "bg", "panel", "get", "post", "put", "delete"];

export interface SettingsDialogProps {
  open: boolean;
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  themes: Theme[];
  currentThemeId: string;
  onSelectTheme: (id: string) => void;
  fonts: FontOverride;
  onFonts: (f: FontOverride) => void;
  onOpenThemesFolder: () => void;
  twoPane: boolean;
  onToggleTwoPane: () => void;
}

export default function SettingsDialog(props: SettingsDialogProps) {
  const { open, tab, onTab, onClose } = props;
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2>{t("settings.title")}</h2>
          <Button variant="bare" className="settings-close" onClick={onClose} aria-label="close">
            <Icon name="x" size={16} />
          </Button>
        </div>
        <div className="settings-body">
          <nav className="settings-rail">
            {TABS.map((id) => (
              <Button
                variant="bare"
                key={id}
                className={`settings-tab ${tab === id ? "active" : ""}`}
                onClick={() => onTab(id)}
              >
                {t(`settings.tabs.${id}`)}
              </Button>
            ))}
          </nav>

          <div className="settings-content">
            {tab === "general" && <General {...props} />}
            {tab === "appearance" && <Appearance {...props} />}
            {tab === "about" && <About />}
            {tab !== "general" && tab !== "appearance" && tab !== "about" && (
              <ComingSoon note={t(`settings.${tab}.soon`)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- General --------------------------------- */

function General({ twoPane, onToggleTwoPane }: SettingsDialogProps) {
  const { t } = useTranslation();
  return (
    <Section title={t("settings.general.interface")}>
      <ToggleRow
        label={t("settings.general.twoPane")}
        desc={t("settings.general.twoPaneDesc")}
        checked={twoPane}
        onChange={onToggleTwoPane}
      />
    </Section>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        {desc && <span className="toggle-desc">{desc}</span>}
      </div>
      <Button
        variant="bare"
        className={`toggle ${checked ? "on" : ""}`}
        role="switch"
        aria-checked={checked}
        onClick={onChange}
      >
        <span className="toggle-knob" />
      </Button>
    </div>
  );
}

/* ------------------------------- Appearance -------------------------------- */

function Appearance({
  themes,
  currentThemeId,
  onSelectTheme,
  fonts,
  onFonts,
  onOpenThemesFolder,
}: SettingsDialogProps) {
  const { t, i18n } = useTranslation();

  return (
    <>
      <Section title={t("settings.appearance.theme")}>
        <div className="theme-grid">
          <Button
            variant="bare"
            className={`theme-card ${currentThemeId === AUTO_ID ? "active" : ""}`}
            onClick={() => onSelectTheme(AUTO_ID)}
          >
            <div className="theme-auto-glyph">◐</div>
            <div className="theme-meta">
              <span className="theme-name">{t("settings.appearance.auto")}</span>
              <span className="theme-type">{t("settings.appearance.autoDesc")}</span>
            </div>
          </Button>

          {themes.map((th) => (
            <Button
              variant="bare"
              key={th.id}
              className={`theme-card ${currentThemeId === th.id ? "active" : ""}`}
              onClick={() => onSelectTheme(th.id)}
            >
              <div className="theme-swatches">
                {SWATCH_KEYS.map((k) => (
                  <span
                    key={k}
                    className="swatch"
                    style={{ background: th.colors[k] ?? "transparent" }}
                  />
                ))}
              </div>
              <div className="theme-meta">
                <span className="theme-name">{th.name}</span>
                <span className="theme-type">
                  {th.__source === "user" ? t("settings.appearance.userTheme") : th.type}
                </span>
              </div>
            </Button>
          ))}
        </div>
        <div className="opt-row" style={{ marginTop: 14 }}>
          <Button variant="bare" className="opt-chip" onClick={onOpenThemesFolder}>
            {t("settings.appearance.openFolder")}
          </Button>
        </div>
        <p className="settings-hint">{t("settings.appearance.themeHint")}</p>
      </Section>

      <Section title={t("settings.appearance.language")}>
        <div className="opt-row">
          {LANGUAGES.map((l) => (
            <Button
              variant="bare"
              key={l.code}
              className={`opt-chip ${i18n.language === l.code ? "active" : ""}`}
              onClick={() => i18n.changeLanguage(l.code)}
            >
              {l.name}
            </Button>
          ))}
        </div>
      </Section>

      <Section title={t("settings.appearance.fonts")}>
        <div className="font-grid">
          <div className="font-field">
            <label>{t("settings.appearance.fontSystem")}</label>
            <input
              className="font-input"
              spellCheck={false}
              value={fonts.systemFamily ?? DEFAULT_SANS}
              onChange={(e) =>
                onFonts({ ...fonts, systemFamily: e.target.value || undefined })
              }
            />
          </div>
          <div className="font-field size">
            <label>{t("settings.appearance.fontSize")}</label>
            <input
              className="font-input"
              type="number"
              min={10}
              max={22}
              value={fonts.systemSize ?? DEFAULT_UI_SIZE}
              onChange={(e) =>
                onFonts({ ...fonts, systemSize: parseSize(e.target.value) })
              }
            />
          </div>
        </div>
        <div className="font-grid">
          <div className="font-field">
            <label>{t("settings.appearance.fontEditor")}</label>
            <input
              className="font-input mono"
              spellCheck={false}
              value={fonts.editorFamily ?? DEFAULT_MONO}
              onChange={(e) =>
                onFonts({ ...fonts, editorFamily: e.target.value || undefined })
              }
            />
          </div>
          <div className="font-field size">
            <label>{t("settings.appearance.fontSize")}</label>
            <input
              className="font-input"
              type="number"
              min={10}
              max={22}
              value={fonts.editorSize ?? DEFAULT_EDITOR_SIZE}
              onChange={(e) =>
                onFonts({ ...fonts, editorSize: parseSize(e.target.value) })
              }
            />
          </div>
        </div>
        <div className="indent-field">
          <label>{t("settings.appearance.indent")}</label>
          <div className="indent-controls">
            <input
              className="font-input indent-count"
              type="number"
              min={1}
              max={8}
              value={fonts.indentCount ?? DEFAULT_INDENT}
              onChange={(e) => onFonts({ ...fonts, indentCount: parseIndent(e.target.value) })}
            />
            <div className="indent-seg">
              <Button
                variant="bare"
                className={`seg-btn ${(fonts.indentType ?? "space") === "space" ? "active" : ""}`}
                onClick={() => onFonts({ ...fonts, indentType: "space" })}
              >
                {t("settings.appearance.indentSpace")}
              </Button>
              <Button
                variant="bare"
                className={`seg-btn ${fonts.indentType === "tab" ? "active" : ""}`}
                onClick={() => onFonts({ ...fonts, indentType: "tab" })}
              >
                {t("settings.appearance.indentTab")}
              </Button>
            </div>
          </div>
        </div>
        <div className="font-actions">
          <Button variant="bare" className="opt-chip" onClick={() => onFonts({})}>
            {t("settings.appearance.fontReset")}
          </Button>
          <span className="settings-hint" style={{ margin: 0 }}>
            {t("settings.appearance.fontHint")}
          </span>
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------- About ---------------------------------- */

function About() {
  const { t } = useTranslation();
  return (
    <div className="about">
      <div className="about-glyph">P</div>
      <h3>PostCat</h3>
      <p className="about-ver">{t("settings.about.version", { version: "0.1.0" })}</p>
      <p className="about-desc">{t("settings.about.desc")}</p>
      <div className="about-stack">
        <span>Tauri 2</span>
        <span>Rust · reqwest</span>
        <span>React · TypeScript</span>
        <span>SQLite</span>
      </div>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

function parseSize(v: string): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(22, Math.max(10, Math.round(n)));
}

function parseIndent(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_INDENT;
  return Math.min(8, Math.max(1, Math.round(n)));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      {children}
    </div>
  );
}

function ComingSoon({ note }: { note: string }) {
  const { t } = useTranslation();
  return (
    <div className="coming-soon">
      <span className="cs-badge">{t("settings.soonBadge")}</span>
      <p>{note}</p>
    </div>
  );
}
