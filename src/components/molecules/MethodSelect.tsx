import Dropdown from "@/components/molecules/Dropdown";
import { METHODS, type Method } from "@/types";

/** HTTP method picker — a Dropdown tinted per method (`.m-get`, `.m-post`, …). */
export default function MethodSelect({
  value,
  onChange,
}: {
  value: Method;
  onChange: (m: Method) => void;
}) {
  return (
    <Dropdown
      className="method-dd"
      value={value}
      buttonClassName={`m-${value.toLowerCase()} mono`}
      ariaLabel="HTTP method"
      options={METHODS.map((m) => ({
        value: m,
        label: m,
        className: `m-${m.toLowerCase()}`,
      }))}
      onChange={(v) => onChange(v as Method)}
    />
  );
}
