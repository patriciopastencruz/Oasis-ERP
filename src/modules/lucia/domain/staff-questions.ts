/**
 * Preguntas a recepción para revisar los datos que usa Lucía (habitaciones,
 * precios y manuales del ERP). Las G se responden por cada hostal; las demás
 * son de una hostal fija. Las respuestas se guardan en lucia_staff_answers.
 */
export type StaffQuestion = {
  code: string;
  /** Hostal a la que pertenece; null = se responde por cada hostal. */
  hostel: "HOB" | "HOC" | "HU" | null;
  question: string;
  /** Lo que dice hoy el ERP, para que basten con responder «Correcto». */
  current: string;
};

export const STAFF_QUESTIONS: StaffQuestion[] = [
  { code: "G1", hostel: null, question: "¿Los precios del ERP incluyen IVA? Si el cliente pide factura, ¿se cobra el precio más 19%?", current: "Cobija dice «la factura considera IVA sobre el precio»; Modulares dice «precio + IVA»; Atacama no lo aclara." },
  { code: "G2", hostel: null, question: "Niños: ¿desde qué edad pagan y cuentan como persona? ¿Hay cuna o cama extra?", current: "Cobija y Atacama dicen «Niños: sí», sin edades. Modulares no dice nada." },
  { code: "G3", hostel: null, question: "¿Hay reservas que entran por otro lado (Booking, Airbnb, teléfono, llegadas sin reserva)? ¿Se cargan en el ERP en el momento?", current: "Lucía solo ve el calendario del ERP. Si una reserva no está cargada, ofrecerá esa habitación como libre." },
  { code: "G4", hostel: null, question: "Si una solicitud llega fuera del horario de recepción (por ejemplo a las 23:00), ¿quién confirma la disponibilidad? ¿Está bien que el cliente espere hasta la mañana?", current: "Lucía le dice al cliente que está confirmando con recepción. El plazo de 1 hora para pagar corre desde que recepción confirma." },
  { code: "G5", hostel: null, question: "Grupos que necesitan más de una habitación: ¿quién les hace la cotización y en cuánto tiempo responde?", current: "Lucía solo puede pedir una habitación por solicitud; los grupos los deriva al equipo." },
  { code: "G6", hostel: null, question: "¿Se puede pagar con tarjeta?", current: "Solo el manual de Modulares menciona tarjeta. Cobija y Atacama dicen efectivo y transferencia." },

  { code: "B1", hostel: "HOB", question: "Los mini deptos C1 a C4 admiten 3 personas ($36.000) y C5 a C8 solo 2. Todos dicen «1 cama matrimonial». ¿Dónde duerme la tercera persona? ¿Cuáles tienen sofá cama?", current: "El manual dice «algunos con sofá en el acceso», sin decir cuáles ni si sirve para dormir." },
  { code: "B2", hostel: "HOB", question: "La habitación simple individual (HAB2, HAB5) cuesta $24.000, lo mismo que una simple matrimonial para 1 persona. ¿Es correcto?", current: "Individual $24.000 · matrimonial $24.000 (1 persona) / $29.000 (2 personas)." },
  { code: "B3", hostel: "HOB", question: "Para 2 personas, la simple de 2 camas cuesta $30.000 y la simple matrimonial $29.000. ¿La diferencia de $1.000 es intencional?", current: "HAB4 (2 camas) $30.000 · HAB1, 3, 6 y 7 (matrimonial) $29.000." },
  { code: "B4", hostel: "HOB", question: "¿El desayuno está incluido en todas las habitaciones y ya va dentro del precio?", current: "El manual dice «Desayuno incluido, de 08:00 a 10:00»." },
  { code: "B5", hostel: "HOB", question: "Estacionamiento: ¿es gratis? ¿Cómo se reserva un cupo?", current: "«Sí, para 9 a 10 vehículos; hay que consultar disponibilidad». No dice precio." },
  { code: "B6", hostel: "HOB", question: "Cancelación: si avisa con menos de 48 horas «se cobran 2 días». Si el cliente solo pagó 1 noche o el 50%, ¿qué se le cobra? Si avisa a tiempo, ¿se devuelve todo?", current: "«Avisar con al menos 48 horas; si no, se cobran 2 días. Reembolsos en 2 días hábiles»." },
  { code: "B7", hostel: "HOB", question: "Llegadas después de las 19:30: ¿quién envía las instrucciones de ingreso autónomo y con cuánta anticipación?", current: "«Deben coordinarse con anticipación y pagar la reserva antes»." },
  { code: "B8", hostel: "HOB", question: "¿Se puede ingresar antes de las 14:00? ¿Tiene costo?", current: "El manual solo dice que extender la salida es pagar una noche más." },

  { code: "C1", hostel: "HOC", question: "Los Modulares 2, 3, 5, 6 y 7 dicen «Modular con baño privado» y los 8 y 9 «Modular matrimonial con baño privado». ¿Qué cama tienen el 2, 3, 5, 6 y 7? ¿En qué se diferencian del 8 y 9?", current: "El manual dice que todos tienen cama matrimonial (salvo el Modular 4). Todos cuestan lo mismo: $27.000 (1 persona) / $32.000 (2)." },
  { code: "C2", hostel: "HOC", question: "¿Los modulares tienen cocina, frigobar o microondas? ¿Sus huéspedes pueden usar la cocina común?", current: "«Cocina solo en el espacio común de los baños compartidos»." },
  { code: "C3", hostel: "HOC", question: "Pieza 18 (mini modular, 12 m²): ¿qué cama tiene? ¿Tiene cocina o frigobar?", current: "«Mini modular con baño privado (12 m²)», para 2 personas, $24.000 / $28.000." },
  { code: "C4", hostel: "HOC", question: "Piezas 13 y 16 (1 cama de 1,5 plazas): ¿puede dormir una pareja o es solo para 1 persona?", current: "En el ERP admiten 1 persona, $22.000." },
  { code: "C5", hostel: "HOC", question: "En el ERP no existe la Pieza 17 y el Departamento 10 está inactivo. ¿La Pieza 17 existe? ¿El Departamento 10 volverá a arrendarse y a qué precio?", current: "Departamento 10 fuera de servicio, $30.000, sin descripción." },
  { code: "C6", hostel: "HOC", question: "Estacionamiento: los $2.000, ¿son por noche o por toda la estadía? ¿Cuántos cupos hay?", current: "«$2.000, avisando con anticipación»." },
  { code: "C7", hostel: "HOC", question: "Cancelación con menos de 48 horas o si el cliente no llega: ¿qué pasa con el abono?", current: "Solo dice que con 48 horas de aviso se devuelve el 80% del abono." },
  { code: "C8", hostel: "HOC", question: "Descuento por más de 7 noches: ¿de cuánto es? ¿Lucía puede decir el monto o siempre lo confirma recepción?", current: "«Pueden tener descuento: lo confirma recepción»." },
  { code: "C9", hostel: "HOC", question: "Fines de semana la recepción cierra a las 19:00. ¿Cómo entra quien llega después?", current: "«Llegadas fuera del horario: deben pagar por anticipado». No dice cómo ingresan." },
  { code: "C10", hostel: "HOC", question: "¿Se aceptan niños y mascotas?", current: "El manual no lo dice." },

  { code: "A1", hostel: "HU", question: "Las Piezas 1 y 4 dicen lo mismo («2 camas, baño compartido y cocina compartida»), pero tienen precios distintos. ¿En qué se diferencian?", current: "Pieza 1: $22.000 (1 persona) / $28.000 (2) · Pieza 4: $25.000 / $30.000." },
  { code: "A2", hostel: "HU", question: "Las Piezas 5, 7 y 8 dicen lo mismo («1 cama matrimonial, baño privado y cocina compartida»), pero tienen precios distintos. ¿En qué se diferencian? Si son iguales, ¿cuál es el precio correcto?", current: "1 persona: $26.000 / $28.000 / $30.000 · 2 personas: $30.000 / $32.000 / $32.000." },
  { code: "A3", hostel: "HU", question: "Las piezas de «2 camas» (1 y 4): ¿de qué tamaño son las camas?", current: "Solo dice «2 camas»." },
  { code: "A4", hostel: "HU", question: "La Pieza 6 está fuera de servicio. ¿Cuándo vuelve?", current: "Lucía no la ofrece mientras siga fuera de servicio." },
  { code: "A5", hostel: "HU", question: "¿Se puede llegar un domingo? ¿La persona de apoyo fuera de horario puede recibir llegadas y entregar llaves?", current: "«Recepción: lunes a sábado de 14:00 a 19:00. Fuera de ese horario hay una persona de apoyo»." },
  { code: "A6", hostel: "HU", question: "Ingreso anticipado y salida tardía: ¿cuánto cuestan?", current: "«Con costo adicional», sin montos." },
  { code: "A7", hostel: "HU", question: "¿Cuál es la política de cancelación? ¿Se devuelve el abono?", current: "El manual no tiene política de cancelación." },
  { code: "A8", hostel: "HU", question: "¿Aceptan pasaporte para extranjeros?", current: "«Documento: carnet de identidad»." },
  { code: "A9", hostel: "HU", question: "¿Con qué nombre conocen los clientes esta hostal? ¿Algunos la buscan como «Hostal Uruguay»?", current: "Lucía la llama «Hostal Atacama Oasis»; en el ERP figura como «Hostal Uruguay»." },
];

/** Preguntas que se responden para una hostal: las generales más las suyas. */
export function questionsForHostel(code: string): StaffQuestion[] {
  return STAFF_QUESTIONS.filter((q) => q.hostel === null || q.hostel === code);
}
