import { useRef } from "react";

/**
 * A draggable divider. `vertical` is a vertical bar dragged left/right
 * (reports deltaX); `horizontal` is a horizontal bar dragged up/down
 * (reports deltaY). onStart captures the base size; onMove gives the
 * signed pixel delta from the drag origin.
 */
export default function Resizer({
  orientation,
  onStart,
  onMove,
  className,
}: {
  orientation: "vertical" | "horizontal";
  onStart: () => void;
  onMove: (delta: number) => void;
  className?: string;
}) {
  const active = useRef(false);

  function onDown(e: React.MouseEvent) {
    e.preventDefault();
    active.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    onStart();

    const move = (ev: MouseEvent) => {
      if (!active.current) return;
      onMove(orientation === "vertical" ? ev.clientX - startX : ev.clientY - startY);
    };
    const up = () => {
      active.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.cursor = orientation === "vertical" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div
      className={`resizer resizer-${orientation} ${className ?? ""}`}
      onMouseDown={onDown}
    />
  );
}
