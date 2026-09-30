"use client";

import { useState } from "react";

const formatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function ClpInput({
  name,
  defaultValue,
  disabled = false,
  className = "",
  allowEmpty = false,
}: {
  name: string;
  defaultValue: number | string;
  disabled?: boolean;
  className?: string;
  /** Campo opcional: vacío se envía vacío en vez de $0. */
  allowEmpty?: boolean;
}) {
  const [value, setValue] = useState(() =>
    allowEmpty && (defaultValue === "" || Number(defaultValue) <= 0)
      ? ""
      : String(Math.max(0, Number(defaultValue) || 0)),
  );
  const [editing, setEditing] = useState(false);
  return (
    <div className="relative mt-1">
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        inputMode="numeric"
        value={editing ? value : allowEmpty && value === "" ? "" : formatter.format(Number(value) || 0)}
        placeholder={allowEmpty ? "—" : undefined}
        disabled={disabled}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          setValue(allowEmpty && !digits ? "" : String(Number(digits || 0)));
        }}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        className={`w-full ${className}`}
        aria-label="Tarifa en pesos chilenos"
      />
    </div>
  );
}
