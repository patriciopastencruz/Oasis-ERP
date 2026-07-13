import { Panel } from "@/components/ui/page";
type Row = {
  id: string;
  company_id: string;
  business_unit_id: string | null;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  companies?: { trade_name: string } | { trade_name: string }[];
  business_units?: { name: string } | { name: string }[];
};
type Item = { id: string; name: string; company_id?: string };
export function CatalogAdmin({
  rows,
  companies,
  units,
  saveAction,
  toggleAction,
  editId,
}: {
  rows: Row[];
  companies: Item[];
  units: Item[];
  saveAction: (form: FormData) => void | Promise<void>;
  toggleAction: (form: FormData) => void | Promise<void>;
  editId?: string;
}) {
  const edit = rows.find((x) => x.id === editId);
  const input = "mt-1 w-full rounded-xl border p-2.5 text-sm";
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr>
                <th className="pb-3">Código</th>
                <th>Nombre</th>
                <th>Unidad</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const unit = Array.isArray(r.business_units)
                  ? r.business_units[0]
                  : r.business_units;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="py-4 font-semibold">{r.code}</td>
                    <td>
                      <b>{r.name}</b>
                      {r.description && (
                        <small className="block text-slate-500">
                          {r.description}
                        </small>
                      )}
                    </td>
                    <td>{unit?.name ?? "Todas las unidades"}</td>
                    <td>{r.active ? "Activo" : "Inactivo"}</td>
                    <td>
                      <div className="flex gap-3">
                        <a
                          href={`?edit=${r.id}`}
                          className="font-semibold text-[#277a55]"
                        >
                          Editar
                        </a>
                        <form action={toggleAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={String(!r.active)}
                          />
                          <button
                            className="font-semibold text-slate-600"
                            data-confirm={r.active ? "Desactivar" : "Activar"}
                          >
                            {r.active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p className="py-12 text-center text-sm text-slate-500">
            No existen registros para los filtros seleccionados.
          </p>
        )}
      </Panel>
      <Panel>
        <h2 className="mb-4 font-semibold">
          {edit ? "Editar registro" : "Crear registro"}
        </h2>
        <form action={saveAction} className="space-y-3">
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <input
            type="hidden"
            name="company_id"
            value={edit?.company_id ?? companies[0]?.id}
          />
          <label className="block text-sm">
            Unidad opcional
            <select
              name="business_unit_id"
              defaultValue={edit?.business_unit_id ?? ""}
              className={input}
            >
              <option value="">Todas las unidades</option>
              {units.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Código
            <input
              name="code"
              defaultValue={edit?.code}
              className={input}
              required
            />
          </label>
          <label className="block text-sm">
            Nombre
            <input
              name="name"
              defaultValue={edit?.name}
              className={input}
              required
            />
          </label>
          <label className="block text-sm">
            Descripción
            <textarea
              name="description"
              defaultValue={edit?.description ?? ""}
              className={`${input} min-h-20`}
            />
          </label>
          <button className="w-full rounded-xl bg-[#173f2d] px-4 py-3 font-semibold text-white">
            Guardar
          </button>
        </form>
      </Panel>
    </div>
  );
}
