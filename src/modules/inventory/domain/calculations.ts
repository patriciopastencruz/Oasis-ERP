export function purchaseAverage(
  currentValue: number,
  currentQuantity: number,
  purchaseQuantity: number,
  unitPrice: number,
) {
  if (
    currentQuantity < 0 ||
    currentValue < 0 ||
    purchaseQuantity <= 0 ||
    unitPrice < 0
  )
    throw new Error("Valores de compra inválidos");
  return (
    Math.round(
      ((currentValue + purchaseQuantity * unitPrice) /
        (currentQuantity + purchaseQuantity)) *
        100,
    ) / 100
  );
}
export function resultingStock(current: number, output: number) {
  if (output <= 0) throw new Error("La cantidad debe ser positiva");
  if (output > current)
    throw new Error(`No existe stock suficiente. Stock disponible: ${current}`);
  return current - output;
}
export function monthlyConsumption(total: number, months: number) {
  return months > 0 ? total / months : 0;
}
