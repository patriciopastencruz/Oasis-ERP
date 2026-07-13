"use client";

import { useRef, useState } from "react";
import { setContextAction } from "@/modules/platform/auth/application/actions";

type BusinessUnit = {
  id: string;
  name: string;
};

export function BusinessUnitSelector({
  companyId,
  unitId,
  units,
}: {
  companyId: string;
  unitId?: string;
  units: BusinessUnit[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedUnit, setSelectedUnit] = useState(
    unitId ?? units[0]?.id ?? "",
  );

  return (
    <form ref={formRef} action={setContextAction} className="mt-5">
      <input type="hidden" name="company_id" value={companyId} />
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
        Unidad de negocio
        <select
          name="unit_id"
          value={selectedUnit}
          onChange={(event) => {
            setSelectedUnit(event.target.value);
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-white/40"
        >
          {units.map((unit) => (
            <option value={unit.id} key={unit.id} className="text-slate-900">
              {unit.name}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
