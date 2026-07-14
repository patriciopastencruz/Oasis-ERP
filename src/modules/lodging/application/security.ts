import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

function privateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const x = ip.toLowerCase();
  return (
    x === "::1" ||
    x === "::" ||
    x.startsWith("fc") ||
    x.startsWith("fd") ||
    x.startsWith("fe8") ||
    x.startsWith("fe9") ||
    x.startsWith("fea") ||
    x.startsWith("feb")
  );
}

export async function assertSafeIcalUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("La URL debe usar HTTPS.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local"))
    throw new Error("Host no permitido.");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((x) => privateIp(x.address)))
    throw new Error("Red no permitida.");
  return url;
}

export async function fetchIcal(raw: string) {
  let url = await assertSafeIcalUrl(raw);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "text/calendar,text/plain;q=.8" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === 3)
        throw new Error("Redirección iCal inválida");
      url = await assertSafeIcalUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > 2_000_000) throw new Error("Calendario demasiado grande");
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error("Calendario demasiado grande");
    return text;
  }
  throw new Error("No fue posible leer el calendario");
}
