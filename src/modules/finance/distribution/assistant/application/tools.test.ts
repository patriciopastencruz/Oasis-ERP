import { describe, expect, it, vi } from "vitest";
import { runAvisar, runCotizar, runCrear, type DistToolContext, type DistToolState } from "./tools";

const customer = { id: "c1", name: "Minimarket Sol", address: "Calle 1, Calama", hasCredit: false, creditAvailable: false };
const quoteData = {
  lines: [{ product_id: "p1", product_code: "ICE-2KG", name: "Hielo cubo 2 kg", quantity: 10, unit_price: 450, line_total: 4500 }],
  total: 4500,
  rule_error: null as string | null,
};

function context(over: Partial<DistToolContext> & { rpc?: (name: string, args: unknown) => unknown } = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const rpc = over.rpc ?? ((name: string) => {
    if (name === "dist_wa_quote_order") return { data: quoteData, error: null };
    if (name === "dist_wa_create_order") return { data: { order_number: "DA-2026-000001", total: 4500 }, error: null };
    return { data: null, error: null };
  });
  const admin = {
    rpc: vi.fn(async (name: string, args: unknown) => {
      calls.push({ name, args });
      return rpc(name, args);
    }),
    from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ data: [] }) }) }) }),
  };
  const ctx: DistToolContext = {
    admin: admin as never,
    unitId: "u1",
    conversationId: "conv1",
    customers: [customer],
    customerText: "necesito 10 bolsas de hielo de 2 kg para mañana",
    todayIso: "2026-10-26",
    simulate: false,
    ...over,
  };
  const state: DistToolState = { quote: null, created: null, flagged: false };
  return { ctx, state, calls };
}

const order = {
  delivery_date: "2026-10-27",
  fecha_dicha_por_el_cliente: "para mañana",
  customer_id: "c1",
  payment_method: "cash",
  lines: [{ product_code: "ICE-2KG", quantity: 10 }],
};

describe("herramientas del asistente de pedidos", () => {
  it("cotiza con el total del sistema y arma el resumen exacto", async () => {
    const { ctx, state } = context();
    const r = await runCotizar(ctx, state, order);
    expect(r.isError).toBe(false);
    expect(state.quote?.total).toBe(4500);
    expect(state.quote?.summary).toContain("10 × Hielo cubo 2 kg");
    expect(state.quote?.summary).toContain("Total: $4.500");
    expect(state.quote?.summary).toContain("Calle 1, Calama");
    expect(state.quote?.summary).toContain("efectivo");
  });

  it("no cotiza sin la forma de pago ni con crédito que no tiene", async () => {
    const { ctx, state } = context();
    expect((await runCotizar(ctx, state, { ...order, payment_method: undefined })).content).toMatch(/forma de pago/);
    expect((await runCotizar(ctx, state, { ...order, payment_method: "credit" })).content).toMatch(/crédito/);
  });

  it("no cotiza ni crea para un número no registrado", async () => {
    const { ctx, state } = context({ customers: [] });
    expect((await runCotizar(ctx, state, order)).isError).toBe(true);
    expect((await runCrear(ctx, state, { ...order, cliente_confirmo: true })).content).toMatch(/no registrado/i);
  });

  it("exige que el día salga de lo que dijo el cliente", async () => {
    const { ctx, state } = context();
    const invented = await runCotizar(ctx, state, { ...order, fecha_dicha_por_el_cliente: "el sábado por la tarde" });
    expect(invented.isError).toBe(true);
    const wrongDay = await runCotizar(
      { ...ctx, customerText: "para mañana" },
      state,
      { ...order, delivery_date: "2026-10-30" },
    );
    expect(wrongDay.content).toMatch(/no coincide/);
  });

  it("no crea el pedido sin la confirmación del cliente", async () => {
    const { ctx, state, calls } = context();
    const r = await runCrear(ctx, state, { ...order, cliente_confirmo: false });
    expect(r.isError).toBe(true);
    expect(calls.some((c) => c.name === "dist_wa_create_order")).toBe(false);
  });

  it("crea el pedido confirmado y devuelve el número", async () => {
    const { ctx, state, calls } = context();
    const r = await runCrear(ctx, state, { ...order, cliente_confirmo: true });
    expect(r.isError).toBe(false);
    expect(state.created).toMatchObject({ orderNumber: "DA-2026-000001", total: 4500, simulated: false });
    const create = calls.find((c) => c.name === "dist_wa_create_order")!;
    expect((create.args as { payload: { simulate: boolean } }).payload.simulate).toBe(false);
  });

  it("en el simulador reconoce la simulación y no cuenta como pedido real", async () => {
    const { ctx, state } = context({
      simulate: true,
      rpc: (name) =>
        name === "dist_wa_quote_order"
          ? { data: quoteData, error: null }
          : { data: null, error: { message: "SIMULACION_OK|DA-2026-009999|4500|f" } },
    });
    const r = await runCrear(ctx, state, { ...order, cliente_confirmo: true });
    expect(r.isError).toBe(false);
    expect(state.created).toMatchObject({ orderNumber: "DA-2026-009999", simulated: true });
  });

  it("no ofrece crédito a quien no lo tiene", async () => {
    const { ctx, state } = context();
    const r = await runCrear(ctx, state, { ...order, payment_method: "credit", cliente_confirmo: true });
    expect(r.content).toMatch(/crédito/);
    expect(r.isError).toBe(true);
  });

  it("traduce los errores de las reglas del sistema", async () => {
    const { ctx, state } = context({
      rpc: () => ({ data: { ...quoteData, rule_error: "No hay reparto ese dia de la semana" }, error: null }),
    });
    const r = await runCotizar(ctx, state, order);
    expect(r.isError).toBe(true);
    expect(r.content).toBe("No hay reparto ese dia de la semana");
  });

  it("avisar al encargado marca la conversación", async () => {
    const { ctx, state, calls } = context();
    const r = await runAvisar(ctx, state, { motivo: "Cliente nuevo", resumen: "10 bolsas de hielo" });
    expect(r.isError).toBe(false);
    expect(state.flagged).toBe(true);
    expect(calls[0].name).toBe("dist_wa_flag_conversation");
  });
});
