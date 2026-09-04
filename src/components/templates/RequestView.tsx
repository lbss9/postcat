import type { ReactNode } from "react";
import Resizer from "@/components/atoms/Resizer";

/**
 * Request/response arrangement: stacked (response below, sized by height) or
 * two-pane (response on the right, sized by width). The divider between them
 * flips orientation accordingly.
 */
export default function RequestView({
  builder,
  response,
  twoPane,
  responseHeight,
  responseWidth,
  onResizeStart,
  onResizeHeight,
  onResizeWidth,
}: {
  builder: ReactNode;
  response: ReactNode;
  twoPane: boolean;
  responseHeight: number;
  responseWidth: number;
  onResizeStart: () => void;
  onResizeHeight: (delta: number) => void;
  onResizeWidth: (delta: number) => void;
}) {
  return (
    <div className={`req-response ${twoPane ? "two-pane" : ""}`}>
      {builder}

      <Resizer
        orientation={twoPane ? "vertical" : "horizontal"}
        onStart={onResizeStart}
        onMove={twoPane ? onResizeWidth : onResizeHeight}
      />
      <div
        className="res-wrap"
        style={twoPane ? { width: responseWidth } : { height: responseHeight }}
      >
        {response}
      </div>
    </div>
  );
}
