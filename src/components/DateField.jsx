import DateInput from '../lib/DateInput.jsx';

// Form-field wrapper around DateInput: value/onChange work with plain ISO strings.
export default function DateField({ value, onChange, ariaLabel, disabled, style }) {
  return <DateInput aria-label={ariaLabel} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
    style={{ padding: "7px 9px", border: "1px solid #D1D5DB", borderRadius: 5, fontSize: 12, fontFamily: "'Inter',sans-serif", color: "#1F2937", background: "#fff", ...style }} />;
}
