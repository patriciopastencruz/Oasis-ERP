import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/modules/platform/auth/application/session";

type Col = [string, string, number];
const definitions: Record<string, { sheet: string; columns: Col[] }> = {
  stock: {
    sheet: "Stock",
    columns: [
      ["Código", "code", 16],
      ["Nombre", "name", 28],
      ["Categoría", "category", 20],
      ["Unidad", "unit", 12],
      ["Stock inicial", "initial", 15],
      ["Entradas", "inputs", 14],
      ["Salidas", "outputs", 14],
      ["Stock actual", "stock", 15],
      ["Precio estándar", "standard", 18],
      ["Última compra", "last", 18],
      ["Precio promedio", "average", 18],
      ["Valor estimado", "value", 18],
      ["Consumo promedio mensual", "consumption", 24],
    ],
  },
  invoices: {
    sheet: "Facturas",
    columns: [
      ["Factura", "invoice", 16],
      ["Proveedor", "supplier", 28],
      ["Fecha compra", "date", 16],
      ["Fecha ingreso", "entered", 20],
      ["Código", "code", 16],
      ["Material", "material", 28],
      ["Cantidad", "quantity", 14],
      ["Precio unitario", "price", 18],
      ["Total", "total", 18],
      ["Usuario", "user", 24],
      ["Archivo", "file", 28],
    ],
  },
  outputs: {
    sheet: "Salidas",
    columns: [
      ["Fecha", "date", 16],
      ["Código", "code", 16],
      ["Material", "material", 28],
      ["Cantidad", "quantity", 14],
      ["Unidad", "unit", 12],
      ["Tipo", "type", 24],
      ["Motivo", "reason", 32],
      ["Usuario", "user", 24],
      ["Stock anterior", "before", 16],
      ["Stock posterior", "after", 16],
    ],
  },
  movements: {
    sheet: "Movimientos",
    columns: [
      ["Fecha", "date", 20],
      ["Código", "code", 16],
      ["Producto", "material", 28],
      ["Movimiento", "type", 24],
      ["Entrada", "input", 14],
      ["Salida", "output", 14],
      ["Stock resultante", "stock", 18],
      ["Documento", "document", 24],
      ["Usuario", "user", 24],
    ],
  },
};
function one<T>(x: T | T[] | null): T | undefined {
  return Array.isArray(x) ? x[0] : x || undefined;
}
export async function GET(req: NextRequest) {
  await requirePermission("inventory.reports.export");
  const type = req.nextUrl.searchParams.get("type") || "stock",
    def = definitions[type] || definitions.stock,
    s = await createSupabaseServerClient(),
    from = req.nextUrl.searchParams.get("from"),
    to = req.nextUrl.searchParams.get("to");
  let rows: Record<string, unknown>[] = [];
  if (type === "stock") {
    const [{ data: m }, { data: mv }] = await Promise.all([
      s
        .from("inventory_materials")
        .select(
          "id,code,name,category,unit_of_measure,initial_stock,current_stock,standard_price,last_purchase_price,average_price",
        ),
      s
        .from("inventory_movements")
        .select(
          "material_id,movement_date,movement_type,quantity_in,quantity_out",
        ),
    ]);
    rows = (m || []).map((x) => {
      const movements = (mv || []).filter(
          (y) =>
            y.material_id === x.id &&
            (!from || y.movement_date >= from) &&
            (!to || y.movement_date <= `${to}T23:59:59`),
        ),
        months = new Set(
          movements
            .filter((y) => Number(y.quantity_out) > 0)
            .map((y) => y.movement_date.slice(0, 7)),
        ).size;
      const inputs = movements.reduce((a, y) => a + Number(y.quantity_in), 0),
        outputs = movements.reduce((a, y) => a + Number(y.quantity_out), 0);
      return {
        code: x.code,
        name: x.name,
        category: x.category,
        unit: x.unit_of_measure,
        initial: Number(x.initial_stock),
        inputs,
        outputs,
        stock: Number(x.current_stock),
        standard: Number(x.standard_price),
        last: Number(x.last_purchase_price || 0),
        average: Number(x.average_price),
        value: Number(x.current_stock) * Number(x.average_price),
        consumption: months ? outputs / months : 0,
      };
    });
  } else if (type === "invoices") {
    const q = s
      .from("inventory_purchase_lines")
      .select(
        "quantity,unit_price,line_total,inventory_materials(code,name),inventory_purchase_invoices(invoice_number,purchase_date,entered_at,attachment_name,suppliers(legal_name),profiles!inventory_purchase_invoices_entered_by_fkey(first_name,last_name))",
      );
    const { data } = await q;
    rows = (data || [])
      .filter((x) => {
        const i = one(x.inventory_purchase_invoices);
        return (
          (!from || String(i?.purchase_date) >= from) &&
          (!to || String(i?.purchase_date) <= to)
        );
      })
      .map((x) => {
        const i = one(x.inventory_purchase_invoices),
          m = one(x.inventory_materials),
          u = one(i?.profiles || null),
          supplier = one(i?.suppliers || null);
        return {
          invoice: i?.invoice_number,
          supplier: supplier?.legal_name,
          date: i?.purchase_date,
          entered: i?.entered_at,
          code: m?.code,
          material: m?.name,
          quantity: Number(x.quantity),
          price: Number(x.unit_price),
          total: Number(x.line_total),
          user: u ? `${u.first_name} ${u.last_name}` : "",
          file: i?.attachment_name,
        };
      });
  } else if (type === "outputs") {
    let q = s
      .from("inventory_outputs")
      .select(
        "output_date,quantity,output_type,reason,stock_before,stock_after,inventory_materials(code,name,unit_of_measure),profiles!inventory_outputs_recorded_by_fkey(first_name,last_name)",
      );
    if (from) q = q.gte("output_date", from);
    if (to) q = q.lte("output_date", to);
    const { data } = await q;
    rows = (data || []).map((x) => {
      const m = one(x.inventory_materials),
        u = one(x.profiles);
      return {
        date: x.output_date,
        code: m?.code,
        material: m?.name,
        quantity: Number(x.quantity),
        unit: m?.unit_of_measure,
        type:
          x.output_type === "loss" ? "Falla o pérdida" : "Consumo operacional",
        reason: x.reason,
        user: u ? `${u.first_name} ${u.last_name}` : "",
        before: Number(x.stock_before),
        after: Number(x.stock_after),
      };
    });
  } else {
    let q = s
      .from("inventory_movements")
      .select(
        "movement_date,movement_type,quantity_in,quantity_out,stock_after,document_reference,inventory_materials(code,name),profiles!inventory_movements_created_by_fkey(first_name,last_name)",
      );
    if (from) q = q.gte("movement_date", from);
    if (to) q = q.lte("movement_date", `${to}T23:59:59`);
    const { data } = await q;
    rows = (data || []).map((x) => {
      const m = one(x.inventory_materials),
        u = one(x.profiles);
      return {
        date: x.movement_date,
        code: m?.code,
        material: m?.name,
        type: x.movement_type,
        input: Number(x.quantity_in),
        output: Number(x.quantity_out),
        stock: Number(x.stock_after),
        document: x.document_reference,
        user: u ? `${u.first_name} ${u.last_name}` : "",
      };
    });
  }
  const wb = new ExcelJS.Workbook(),
    ws = wb.addWorksheet(def.sheet, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
  ws.columns = def.columns.map(([header, key, width]) => ({
    header,
    key,
    width,
  }));
  rows.forEach((x) => ws.addRow(x));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF173F2D" },
  };
  ws.autoFilter = {
    from: "A1",
    to: `${String.fromCharCode(64 + def.columns.length)}1`,
  };
  const bytes = await wb.xlsx.writeBuffer();
  return new Response(bytes as ArrayBuffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename=oasis-inventario-${type}.xlsx`,
    },
  });
}
