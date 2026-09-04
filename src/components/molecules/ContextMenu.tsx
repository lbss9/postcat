import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Button from "@/components/atoms/Button";
import Icon, { type IconName } from "@/components/atoms/Icon";

/** A single actionable row, or a divider between groups. */
export type ContextMenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      icon?: IconName;
      /** hint shown right-aligned, e.g. "Ctrl+W" */
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };

/** What a target hands to the provider when it is right-clicked. */
export type MenuBuilder = () => ContextMenuItem[];

interface OpenState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface ContextMenuApi {
  /**
   * Open the custom menu at the cursor. Prevents the native WebView2 menu and
   * stops the event bubbling so an ancestor's default menu doesn't override it.
   */
  open: (e: ReactMouseEvent, items: ContextMenuItem[] | MenuBuilder) => void;
}

const Ctx = createContext<ContextMenuApi | null>(null);

/** Attach `onContextMenu={(e) => open(e, items)}` to any element. */
export function useContextMenu(): ContextMenuApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useContextMenu must be used inside <ContextMenuProvider>");
  return api;
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const open = useCallback((e: ReactMouseEvent, items: ContextMenuItem[] | MenuBuilder) => {
    e.preventDefault();
    e.stopPropagation();
    const list = typeof items === "function" ? items() : items;
    if (list.length === 0) return;
    setState({ x: e.clientX, y: e.clientY, items: list });
  }, []);

  const close = useCallback(() => setState(null), []);

  // Kill the native menu everywhere; a target that wants ours calls open() and
  // stops propagation, so this only fires for un-handled right-clicks.
  useEffect(() => {
    const onNative = (e: globalThis.MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onNative);
    return () => document.removeEventListener("contextmenu", onNative);
  }, []);

  // close on any outside interaction
  useEffect(() => {
    if (!state) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScroll = () => close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("blur", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("blur", onScroll);
    };
  }, [state, close]);

  // flip the menu so it never overflows the window
  useLayoutEffect(() => {
    if (!state || !menuRef.current) return;
    const el = menuRef.current;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    let x = state.x;
    let y = state.y;
    if (x + width + pad > window.innerWidth) x = Math.max(pad, window.innerWidth - width - pad);
    if (y + height + pad > window.innerHeight) y = Math.max(pad, window.innerHeight - height - pad);
    if (x !== state.x || y !== state.y) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }, [state]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {state &&
        createPortal(
          <div
            className="ctx-menu"
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", left: state.x, top: state.y }}
          >
            {state.items.map((it, i) =>
              "separator" in it && it.separator ? (
                <div className="ctx-sep" key={`sep-${i}`} role="separator" />
              ) : (
                <Button
                  variant="bare"
                  key={it.label}
                  className={`ctx-item ${it.danger ? "danger" : ""}`}
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    close();
                    it.onSelect();
                  }}
                >
                  <span className="ctx-icon">{it.icon && <Icon name={it.icon} size={14} />}</span>
                  <span className="ctx-label">{it.label}</span>
                  {it.shortcut && <span className="ctx-shortcut">{it.shortcut}</span>}
                </Button>
              ),
            )}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
