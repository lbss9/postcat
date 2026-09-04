import Button from "@/components/atoms/Button";

/** On/off switch (`role="switch"`). Purely presentational. */
export default function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <Button
      variant="bare"
      className={`toggle ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span className="toggle-knob" />
    </Button>
  );
}
