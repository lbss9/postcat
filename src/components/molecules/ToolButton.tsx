import Button from "@/components/atoms/Button";
import Icon, { type IconName } from "@/components/atoms/Icon";

/**
 * Small icon-only tool button used in editor toolbars (word wrap, fold all…).
 * `active` renders the accent state for toggles.
 */
export default function ToolButton({
  icon,
  title,
  active = false,
  onClick,
}: {
  icon: IconName;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="bare"
      className={`tool-btn${active ? " active" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon name={icon} size={14} />
    </Button>
  );
}
