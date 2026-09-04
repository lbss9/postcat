import Toggle from "@/components/atoms/Toggle";

/** Settings row: label + optional description on the left, a switch on the right. */
export default function ToggleRow({
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
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
