import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";

export interface DropdownOption {
  value: string;
  label: string;
  /** optional extra class on the trigger/item (e.g. method color `m-get`) */
  className?: string;
}

interface MenuPos {
  top: number;
  left?: number;
  right?: number;
  minWidth: number;
}

/**
 * PostCat's own dropdown — every select in the app uses this instead of the
 * native <select>, so the styling is consistent. Options can carry a color
 * class (used by the HTTP method picker to tint GET/POST/… ).
 *
 * The menu renders in a portal on <body> with fixed positioning so it is never
 * clipped by a scrolling ancestor (e.g. the request-content panel).
 */
export default function Dropdown({
  value,
  options,
  onChange,
  className,
  buttonClassName,
  menuAlign = "left",
  ariaLabel,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  className?: string;
  buttonClassName?: string;
  menuAlign?: "left" | "right";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  // position the portaled menu under the trigger, tracking scroll/resize
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos(
        menuAlign === "right"
          ? { top: r.bottom + 4, right: window.innerWidth - r.right, minWidth: r.width }
          : { top: r.bottom + 4, left: r.left, minWidth: r.width },
      );
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, menuAlign]);

  // close on outside click / Escape (the menu lives in a portal, so check both)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`dd ${className ?? ""}`} ref={ref}>
      <Button
        variant="bare"
        className={`dd-trigger ${buttonClassName ?? ""} ${current?.className ?? ""}`}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dd-value">{current?.label ?? value}</span>
        <span className={`dd-caret ${open ? "open" : ""}`}>▾</span>
      </Button>
      {open &&
        pos &&
        createPortal(
          <div
            className="dd-menu"
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              right: pos.right,
              minWidth: pos.minWidth,
            }}
          >
            {options.map((o) => (
              <Button
                variant="bare"
                key={o.value}
                className={`dd-item ${o.className ?? ""} ${o.value === value ? "active" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="dd-item-label">{o.label}</span>
                {o.value === value && <span className="dd-check">✓</span>}
              </Button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
