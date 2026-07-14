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
}: {
  name: string;
  defaultValue: number | string;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(() =>
    String(Math.max(0, Number(defaultValue) || 0)),
  );
  const [editing, setEditing] = useState(false);
  return (
    <div className="relative mt-1">
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        inputMode="numeric"
        value={editing ? value : formatter.format(Number(value) || 0)}
        disabled={disabled}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          setValue(String(Number(digits || 0)));
        }}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        className={`w-full ${className}`}
        aria-label="Tarifa en pesos chilenos"
      />
    </div>
  );
}
