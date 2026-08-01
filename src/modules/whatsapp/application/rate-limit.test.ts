import { describe, expect, it } from "vitest";
import { SupabaseWindowRateLimiter } from "./rate-limit";

function createFakeAdmin(count: number) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: { count: number }) => unknown) =>
    resolve({ count });
  return {
    from: () => builder,
    calls,
  };
}

describe("SupabaseWindowRateLimiter", () => {
  it("no limita cuando el conteo está bajo el umbral", async () => {
    const admin = createFakeAdmin(5);
    const limiter = new SupabaseWindowRateLimiter();
    const result = await limiter.check({
      admin: admin as never,
      conversationId: "conversation-1",
      limit: 20,
      windowSeconds: 300,
    });
    expect(result).toEqual({ limited: false, count: 5 });
  });

  it("limita cuando el conteo supera el umbral", async () => {
    const admin = createFakeAdmin(21);
    const limiter = new SupabaseWindowRateLimiter();
    const result = await limiter.check({
      admin: admin as never,
      conversationId: "conversation-1",
      limit: 20,
      windowSeconds: 300,
    });
    expect(result).toEqual({ limited: true, count: 21 });
  });

  it("filtra por conversation_id, dirección inbound y la ventana de tiempo", async () => {
    const admin = createFakeAdmin(0);
    const limiter = new SupabaseWindowRateLimiter();
    await limiter.check({
      admin: admin as never,
      conversationId: "conversation-1",
      limit: 20,
      windowSeconds: 300,
    });
    const eqCalls = admin.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({
      method: "eq",
      args: ["conversation_id", "conversation-1"],
    });
    expect(eqCalls).toContainEqual({ method: "eq", args: ["direction", "inbound"] });
    expect(admin.calls.some((c) => c.method === "gte")).toBe(true);
  });
});
