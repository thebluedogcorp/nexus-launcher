// v4.4.0 — Reusable property-inspector controls for Theme Studio.
// Small, composable inputs that bind to the theme draft via the setDraft
// callback. All are keyboard-accessible and styled with the existing
// design tokens so they theme themselves live.

import type { ReactNode } from "react";

interface ControlRowProps { label: string; hint?: string; children: ReactNode; }

export function ControlRow({ label, hint, children }: ControlRowProps) {
  return (
    <div className="ts-row">
      <div className="ts-row-label">
        <span className="t">{label}</span>
        {hint && <span className="d">{hint}</span>}
      </div>
      <div className="ts-row-control">{children}</div>
    </div>
  );
}

interface SliderProps {
  value: number;
  min: number; max: number; step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}

export function Slider({ value, min, max, step = 1, onChange, suffix }: SliderProps) {
  return (
    <div className="ts-slider">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="ts-slider-val">{value}{suffix ?? ""}</span>
    </div>
  );
}

interface NumberFieldProps {
  value: number;
  onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
  suffix?: string;
}

export function NumberField({ value, onChange, min, max, step = 1, suffix }: NumberFieldProps) {
  return (
    <div className="ts-num">
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(Number(e.target.value))} />
      {suffix && <span className="ts-num-suffix">{suffix}</span>}
    </div>
  );
}

interface ColorInputProps {
  value: string;
  onChange: (v: string) => void;
  allowAlpha?: boolean;
}

export function ColorInput({ value, onChange }: ColorInputProps) {
  // For rgba() values, the native color picker can't represent alpha; we
  // still show the hex swatch when possible + a text field for the raw value.
  const isHex = /^#[0-9a-fA-F]{3,8}$/.test(value);
  return (
    <div className="ts-color">
      {isHex && (
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          aria-label="Color picker" className="ts-color-swatch" />
      )}
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="ts-color-text" spellCheck={false} />
    </div>
  );
}

interface SelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function Select<T extends string>({ value, options, onChange }: SelectProps<T>) {
  return (
    <select className="ts-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="ts-segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? "ts-seg active" : "ts-seg"}
          onClick={() => onChange(o.value)} title={o.label}>
          {o.icon ?? o.label}
        </button>
      ))}
    </div>
  );
}

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle({ value, onChange }: ToggleProps) {
  return (
    <button className={value ? "ts-toggle on" : "ts-toggle"} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span className="knob" />
    </button>
  );
}

interface TextFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function TextField({ value, onChange, placeholder }: TextFieldProps) {
  return (
    <input type="text" className="ts-text" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} spellCheck={false} />
  );
}
