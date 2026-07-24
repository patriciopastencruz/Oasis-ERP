"use client";
import { useEffect, useRef, useState } from "react";
import { inputClass } from "./module-nav";

type Customer = { id: string; code: string; name: string };

function label(customer: Customer) {
  return `${customer.code} · ${customer.name}`;
}

export function CustomerCombobox({
  customers,
  value,
  onChange,
  placeholder = "Escribe para buscar cliente…",
  required,
}: {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const selected = customers.find((x) => x.id === value);
  const [query, setQuery] = useState(selected ? label(selected) : "");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected ? label(selected) : "");
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  });

  const term = query.trim().toLowerCase();
  const matches = term
    ? customers
        .filter(
          (x) =>
            x.name.toLowerCase().includes(term) ||
            x.code.toLowerCase().includes(term),
        )
        .slice(0, 30)
    : customers.slice(0, 30);

  function select(customer: Customer) {
    onChange(customer.id);
    setQuery(label(customer));
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        className={inputClass}
        value={query}
        placeholder={placeholder}
        required={required}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length === 1) {
            e.preventDefault();
            select(matches[0]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#d3dbe3] bg-white shadow-lg">
          {matches.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--oasis-soft)]"
                onClick={() => select(x)}
              >
                <span className="font-mono text-xs text-[#5b6d82]">
                  {x.code}
                </span>{" "}
                {x.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && term && matches.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-[#d3dbe3] bg-white p-3 text-sm text-[#5b6d82] shadow-lg">
          Sin coincidencias.
        </div>
      )}
    </div>
  );
}
