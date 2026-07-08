export function PinInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="fb-field">
      <label htmlFor={label}>{label}</label>
      <input
        id={label}
        aria-label={label}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="4-digit PIN"
      />
    </div>
  );
}
