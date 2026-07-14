import { describe, expect, it } from "vitest";
import { assertSafeIcalUrl } from "./security";

describe("protección SSRF iCal", () => {
  it("rechaza HTTP", async () => {
    await expect(
      assertSafeIcalUrl("http://example.com/calendar.ics"),
    ).rejects.toThrow("HTTPS");
  });
  it("rechaza localhost", async () => {
    await expect(
      assertSafeIcalUrl("https://localhost/calendar.ics"),
    ).rejects.toThrow("Host no permitido");
  });
  it("rechaza IPv4 privada", async () => {
    await expect(
      assertSafeIcalUrl("https://127.0.0.1/calendar.ics"),
    ).rejects.toThrow("Red no permitida");
  });
  it("rechaza credenciales embebidas", async () => {
    await expect(
      assertSafeIcalUrl("https://user:secret@example.com/calendar.ics"),
    ).rejects.toThrow("HTTPS");
  });
});
