import { describe, expect, it } from "vitest";
import { isTrackedMutation } from "./pending-guard";

describe("isTrackedMutation", () => {
  it("sigue las acciones de servidor de Next", () => {
    expect(isTrackedMutation("/lodging", { method: "POST", headers: { "Next-Action": "abc" } })).toBe(true);
  });
  it("sigue las subidas directas a Supabase Storage", () => {
    expect(isTrackedMutation("https://x.supabase.co/storage/v1/object/receipts/a.jpg", { method: "POST" })).toBe(true);
  });
  it("ignora lecturas y otras peticiones", () => {
    expect(isTrackedMutation("/lodging", { method: "GET", headers: { "Next-Action": "abc" } })).toBe(false);
    expect(isTrackedMutation("/api/algo", { method: "POST" })).toBe(false);
    expect(isTrackedMutation("https://x.supabase.co/storage/v1/object/receipts/a.jpg")).toBe(false);
  });
});
