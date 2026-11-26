"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setContextAction } from "@/modules/platform/auth/application/actions";

const ADMIN_OPTION = "__administracion_general__";

type BusinessUnit = {
  id: string;
  name: string;
};

export function BusinessUnitSelector({
  companyId,
  unitId,
  units,
  showAdminOption,
  adminHref = "/admin/approvals",
}: {
  companyId: string;
  unitId?: string;
  units: BusinessUnit[];
  showAdminOption?: boolean;
  /** Pantalla a la que lleva «Administración General» (el resumen ejecutivo si la persona lo ve). */
  adminHref?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  // Lo que muestra el selector sale de la pantalla en que se está (Administración General) o de la unidad elegida.
  const pathOption = showAdminOption && (pathname?.startsWith("/admin") || pathname?.startsWith("/inicio")) ? ADMIN_OPTION : null;
  // La elección vale mientras no se cambie de pantalla.
  const [picked, setPicked] = useState<{ value: string; path: string | null } | null>(null);
  const pickedValue = picked && picked.path === pathname ? picked.value : null;
  const selectedUnit = pickedValue ?? pathOption ?? unitId ?? units[0]?.id ?? "";

  return (
    <form ref={formRef} action={setContextAction} className="mt-5">
      <input type="hidden" name="company_id" value={companyId} />
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
        Unidad de negocio
        <select
          name="unit_id"
          value={selectedUnit}
          onChange={(event) => {
            const value = event.target.value;
            setPicked({ value, path: pathname });
            if (value === ADMIN_OPTION) {
              router.push(adminHref);
              return;
            }
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-white/40"
        >
          {showAdminOption && (
            <option value={ADMIN_OPTION} className="text-slate-900">
              Administración General
            </option>
          )}
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
