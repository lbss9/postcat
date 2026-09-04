import type { ReactNode } from "react";
import Button from "@/components/atoms/Button";

/** One tab in a `.tabs` nav (request sub-tabs, response sub-tabs). */
export default function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="bare" className={`tab ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </Button>
  );
}
