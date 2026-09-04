import Icon, { type IconName } from "./Icon";

/**
 * The one button of the app. Every clickable button routes through here so the
 * whole UI shares one reset, one focus treatment and one set of variants.
 *
 * variants:
 *   primary   — the main call to action (Send, Save)
 *   secondary — bordered neutral surface (New, Beautify)
 *   ghost     — no chrome until hover
 *   danger    — ghost that turns red on hover (delete / remove)
 *   bare      — only the reset + focus ring; the caller's own className owns
 *               all geometry and color (window controls, menu items, dropdowns…)
 * sizes: sm | md | lg. `iconOnly` makes it square. `bare` ignores size.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "bare";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** leading Lucide icon */
  icon?: IconName;
  iconSize?: number;
  /** square icon button (no text) */
  iconOnly?: boolean;
  /** persistent pressed / selected state */
  active?: boolean;
}

const DEFAULT_ICON: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 };

export default function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconSize,
  iconOnly = false,
  active = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const bare = variant === "bare";
  const cls = [
    "btn",
    `btn-${variant}`,
    bare ? "" : `btn-${size}`,
    iconOnly && !bare ? "btn-icon" : "",
    active ? "is-active" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} size={iconSize ?? DEFAULT_ICON[size]} />}
      {children}
    </button>
  );
}
