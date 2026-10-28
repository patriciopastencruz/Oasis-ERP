/**
 * El cliente pide algo más barato o de menor precio después de recibir las opciones.
 * Los precios enviados son los únicos vigentes: no hay rebajas ni tarifas menores.
 */

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const LOWER_PRICE =
  /\b(?:mas barat[oa]s?|mas economic[oa]s?|menos (?:caro|costos[oa])|mas baj[oa]|menor (?:precio|valor|costo|tarifa)|mejor (?:precio|tarifa)|precio mas bajo|tarifa mas baja|rebaj[ao]s?|descuentos?|oferta)\b|\bbarat[oa]s?\b.*\b(?:que|algo|otra|opcion)\b|\balgo (?:mas )?(?:barat|economic)/;
// Un monto concreto («algo de 20 mil», «tienen por $15.000»).
const PRICE_FIGURE = /\b(?:algo|tienes|tienen|hay|habria|queda|por|en|de|a)\b[^.?!]{0,20}(?:\$\s?\d|\b\d{1,3}(?:\.\d{3})?\s*(?:mil|lucas)\b)/;
// Un monto sin «mil» ni «$» que se entiende en miles («algo de 20», «decía 20», «salía 25»).
const BARE_PRICE =
  /\b(?:algo|tiene|tienes|tienen|hay|habria|decia|dice|salia|sale|vi|publicad[oa]|anunciad[oa]|precio|valor|cuesta|cobran|por|de|a)\s+(?:de\s+|en\s+)?\$?\s?(?:[1-9]\d|\d{2}\.?000)\b(?!\s*(?:personas?|pers|noches?|dias?|horas?|anos|:|\/|-|de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)))/;
// Si trae fechas nuevas es otra cotización, no un reclamo por el precio.
const NEW_DATES =
  /\b\d{1,2}\s*(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b|\b\d{1,2}[\/-]\d{1,2}\b/;

/** ¿Pide algo más barato, de menor precio o a un monto distinto? */
export function asksForLowerPrice(text: string) {
  const t = plain(text);
  if (NEW_DATES.test(t)) return false;
  return LOWER_PRICE.test(t) || PRICE_FIGURE.test(t) || BARE_PRICE.test(t);
}

/** ¿Ya se le enviaron precios en la conversación? */
export function pricesWereQuoted(turns: { role: string; content: string }[]) {
  return turns.some((t) => t.role === "assistant" && /\$\s?\d/.test(t.content));
}

export const LOWER_PRICE_REPLY =
  "Entiendo 😊 Los precios que te envié son los que tenemos disponibles actualmente para esas fechas, y no contamos con una opción a un precio menor. ¿Te acomoda alguna de esas opciones?";
