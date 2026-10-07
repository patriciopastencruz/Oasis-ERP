// Dirección pública que se imprime en los QR. Se deduce del dominio con el
// que el administrador está usando el ERP (el oficial, oasis-erp.cl), para no
// depender de NEXT_PUBLIC_APP_URL, que puede apuntar a un dominio antiguo.
export function surveyBaseUrl(headers: { get(name: string): string | null }) {
  const host =
    headers.get("x-forwarded-host") ?? headers.get("host") ?? "www.oasis-erp.cl";
  const proto = /^(localhost|127\.)/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}

export function surveyUrl(base: string, token: string) {
  return `${base}/encuesta/${token}`;
}
