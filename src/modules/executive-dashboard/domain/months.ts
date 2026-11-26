/** Claves «AAAA-MM» de los últimos `n` meses, el más antiguo primero. */
export function lastMonthKeys(today: string, n: number) {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    keys.unshift(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return keys;
}
