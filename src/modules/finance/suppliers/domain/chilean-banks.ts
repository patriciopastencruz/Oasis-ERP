export const chileanBanks = [
  "Banco de Chile",
  "Banco Internacional",
  "Scotiabank Chile",
  "Banco de Crédito e Inversiones (BCI)",
  "BancoEstado",
  "Banco BICE",
  "HSBC Bank Chile",
  "Banco Santander Chile",
  "Banco Itaú Chile",
  "Banco Security",
  "Banco Falabella",
  "Banco Ripley",
  "Banco Consorcio",
  "Banco BTG Pactual Chile",
  "Banco do Brasil",
  "J.P. Morgan Chase Bank",
  "China Construction Bank Chile",
  "Bank of China Chile",
  "Otra institución financiera",
] as const;

export function isChileanBank(value: string) {
  return (chileanBanks as readonly string[]).includes(value);
}
