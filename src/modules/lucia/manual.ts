/**
 * Manual de uso de Lucía y Oasis Chats para recepción. Es la fuente de la
 * página /chats/manual (dentro de la app del celular) y del PDF que se
 * entrega impreso, para que ambos digan lo mismo. Texto con **negritas**.
 */

export type ManualBlock =
  | { kind: "p"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "tip"; text: string }
  | { kind: "warning"; text: string }
  /** Pantalla de referencia (datos ficticios) en /public/manual, con sus números explicados. */
  | { kind: "image"; src: string; alt: string; notes?: string[] };

export type ManualSection = { id: string; title: string; emoji: string; blocks: ManualBlock[] };

export const MANUAL_TITLE = "Manual de Lucía para recepción";
export const MANUAL_UPDATED = "29 de octubre de 2026";
/** Las pantallas del manual usan datos ficticios (María Pérez, Juan Rojas). */
export const MANUAL_IMAGES_NOTE = "Las imágenes son de referencia, con clientes ficticios.";

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: "lucia",
    emoji: "🤖",
    title: "Qué es Lucía",
    blocks: [
      {
        kind: "p",
        text: "Lucía es la asistente que responde el WhatsApp central de las hostales (**+56 9 2990 4988**). Atiende a los clientes de Cobija, Modulares (Centro) y Atacama las 24 horas.",
      },
      { kind: "p", text: "**Lo que Lucía hace sola:**" },
      {
        kind: "bullets",
        items: [
          "Responde preguntas con la información del manual de cada hostal (ubicación, horarios, estacionamiento, desayuno, políticas).",
          "Revisa la **disponibilidad real del calendario del ERP** y cotiza con los precios vigentes. Siempre pregunta fechas de llegada, salida y cantidad de personas: nunca supone que es «para hoy».",
          "Envía fotos de las habitaciones cuando el cliente las pide.",
          "Si el cliente pide **departamento**, le muestra solo opciones con baño privado. Si no responde, a los 20 minutos le ofrece las opciones más económicas con baño compartido.",
          "Toma los datos de la reserva y **les pide a ustedes confirmar la disponibilidad**.",
          "Cuando ustedes confirman, le envía al cliente el total, el abono y los datos para transferir, y guarda la habitación **30 minutos**.",
        ],
      },
      { kind: "p", text: "**Lo que Lucía NO hace (lo hacen ustedes):**" },
      {
        kind: "bullets",
        items: [
          "Confirmar la disponibilidad de una reserva.",
          "Verificar en el banco que el pago llegó.",
          "Resolver reclamos, cambios de una reserva ya pagada, devoluciones o casos especiales.",
          "Escuchar audios: le pide al cliente que lo escriba y deja el chat para revisión.",
        ],
      },
    ],
  },
  {
    id: "instalar",
    emoji: "📲",
    title: "Instalar Oasis Chats en el celular",
    blocks: [
      { kind: "p", text: "Oasis Chats es la app para atender los chats de Lucía desde el celular. Se instala una sola vez. Link: **oasis-erp.cl/chats**" },
      { kind: "p", text: "**iPhone (Safari):**" },
      {
        kind: "steps",
        items: [
          "Abran **oasis-erp.cl/chats** en Safari.",
          "Toquen **Compartir** (el cuadrado con la flecha hacia arriba).",
          "Elijan **Agregar a pantalla de inicio** y luego **Agregar**.",
        ],
      },
      { kind: "p", text: "**Android (Chrome):**" },
      {
        kind: "steps",
        items: [
          "Abran **oasis-erp.cl/chats** en Chrome.",
          "Toquen el menú **⋮** (arriba a la derecha).",
          "Elijan **Instalar app** o **Agregar a la pantalla principal**.",
        ],
      },
      {
        kind: "tip",
        text: "La primera vez pide su correo y contraseña del ERP; después la sesión queda abierta. Este manual está siempre dentro de la app: botón **?** arriba en la lista de chats.",
      },
    ],
  },
  {
    id: "lista",
    emoji: "💬",
    title: "La lista de chats",
    blocks: [
      { kind: "p", text: "Se ve como WhatsApp: nombre del cliente, último mensaje, hora y hostal. Un punto verde marca los chats que esperan a alguien del equipo." },
      {
        kind: "image",
        src: "/manual/lista.png",
        alt: "Lista de chats de Oasis Chats",
        notes: [
          "**Pestañas:** «Por atender» (con la cantidad pendiente) y «Todos».",
          "**?** abre este manual; el otro botón cierra la sesión.",
          "**Punto verde:** el chat espera a alguien del equipo. Debajo del nombre se ve la hostal y el motivo.",
        ],
      },
      {
        kind: "table",
        head: ["Pestaña", "Qué muestra"],
        rows: [
          ["Por atender", "Solo los chats que necesitan a una persona: Lucía pidió ayuda, hay una reserva por confirmar, llegó un comprobante de pago o el cliente lleva más de 2 minutos sin respuesta."],
          ["Todos", "Todas las conversaciones abiertas."],
        ],
      },
      {
        kind: "bullets",
        items: [
          "Mientras el cliente no elige hostal, el chat lo ven todas las recepcionistas.",
          "Cuando elige hostal, el chat queda para quienes tienen esa hostal asignada en el ERP (y para administración).",
          "La lista se actualiza sola; para forzarlo, cierren y vuelvan a abrir la app.",
        ],
      },
    ],
  },
  {
    id: "chat",
    emoji: "✍️",
    title: "Dentro de un chat",
    blocks: [
      { kind: "p", text: "Burbujas blancas: el cliente. Burbujas verdes: Lucía o el equipo (con el nombre de quien escribió). **✓✓** = entregado." },
      { kind: "p", text: "**Para responder:** escriban abajo en «Escribe un mensaje» y toquen enviar. Sale por el WhatsApp de Lucía en segundos." },
      {
        kind: "image",
        src: "/manual/chat-ayuda.png",
        alt: "Chat con un aviso de Lucía pidiendo ayuda",
        notes: [
          "**Aviso amarillo 🔔:** Lucía pidió ayuda y dice por qué. Cuando terminen, toquen **Resuelto**.",
          "**Estado de Lucía:** indica si Lucía atiende el chat o si está en pausa.",
          "**Escribir y enviar:** el mensaje le llega al cliente por el WhatsApp de Lucía.",
        ],
      },
      { kind: "p", text: "**Avisos arriba del chat:**" },
      {
        kind: "table",
        head: ["Aviso", "Qué hacer"],
        rows: [
          ["🔔 Lucía pidió ayuda (con el motivo)", "Respondan al cliente. Al terminar, toquen **Resuelto**."],
          ["🛏️ Solicitud de reserva por confirmar", "Revisen el calendario y toquen **Sí hay disponibilidad** o **No hay disponibilidad**."],
          ["Esperando pago / Comprobante recibido", "Toquen **Verificar el pago en el ERP** (ver «El camino de una reserva»)."],
        ],
      },
    ],
  },
  {
    id: "reserva",
    emoji: "🛏️",
    title: "El camino de una reserva",
    blocks: [
      {
        kind: "steps",
        items: [
          "**El cliente elige una opción** y da su nombre. Lucía le envía el resumen de la solicitud.",
          "**Ustedes reciben un WhatsApp** «🔔 Nueva solicitud de reserva» con un código de 4 números (por ejemplo 7744) y el link al chat.",
          "**Revisen el calendario** y confirmen: en Oasis Chats con **Sí hay disponibilidad** / **No hay disponibilidad**, o respondiendo ese WhatsApp con **OK 7744** o **NO 7744**. Vale la primera respuesta.",
          "Si hay disponibilidad, **Lucía le envía al cliente** el total, el abono y los datos para transferir, y la habitación queda guardada **30 minutos** (en el calendario aparece como reserva pendiente).",
          "**10 minutos antes de que venza**, Lucía le recuerda al cliente que envíe el comprobante.",
          "**Llega el comprobante:** ustedes reciben un WhatsApp «💸 El cliente envió el comprobante» **con la foto o PDF del comprobante adjunto**.",
          "**Revisen en el banco** que el dinero llegó.",
          "Toquen **Verificar el pago en el ERP** → escriban el monto recibido → **Pago verificado: confirmar reserva**. Lucía le confirma la reserva al cliente.",
        ],
      },
      {
        kind: "image",
        src: "/manual/chat-reserva.png",
        alt: "Chat con una solicitud de reserva por confirmar",
        notes: ["Paso 3: con el calendario revisado, toquen **Sí hay disponibilidad** o **No hay disponibilidad**."],
      },
      {
        kind: "image",
        src: "/manual/aviso-solicitud.png",
        alt: "Aviso de nueva solicitud de reserva por WhatsApp",
        notes: ["También pueden responder el WhatsApp del aviso con **OK** y el código (o **NO** y el código). Vale la primera respuesta."],
      },
      {
        kind: "image",
        src: "/manual/aviso-comprobante.png",
        alt: "Aviso de comprobante recibido con la imagen adjunta",
        notes: ["Paso 6: el aviso trae **la imagen del comprobante**. Con ella revisen en el banco que llegó el monto."],
      },
      {
        kind: "image",
        src: "/manual/pago-verificado.png",
        alt: "Formulario Pago verificado en el ERP",
        notes: [
          "Paso 8: escriban el **monto recibido** (y si quieren el N° de operación).",
          "Toquen **Pago verificado: confirmar reserva**. Lucía le confirma la reserva al cliente.",
        ],
      },
      {
        kind: "warning",
        text: "Registren el pago **una sola vez**: o con «Pago verificado» en el chat, o registrándolo en la reserva del ERP. Si lo hacen en los dos lados, el pago queda duplicado.",
      },
      { kind: "p", text: "**Casos especiales:**" },
      {
        kind: "table",
        head: ["Situación", "Qué pasa / qué hacer"],
        rows: [
          ["Venció el plazo de 30 minutos", "Lucía avisa al cliente que se liberó la habitación y ustedes reciben «⏰ Venció el plazo». Si el cliente aún quiere, Lucía vuelve a consultar."],
          ["El comprobante llega después de vencer el plazo", "Si la habitación sigue libre, se vuelve a guardar sola y llega el aviso 💸 normal. Si ya se ocupó, llega «💸⚠️ comprobante DESPUÉS de vencer el plazo»: verifiquen el pago y ofrézcanle otra habitación o la devolución."],
          ["El cliente quiere pagar en efectivo al llegar", "Lucía le explica que puede, pero la habitación no queda reservada: se confirma al llegar, dentro del horario de recepción."],
          ["El cliente paga al llegar (tarjeta o efectivo)", "Registren el pago en la reserva del ERP: si cubre el abono, la reserva queda confirmada sola y pueden hacer el check-in."],
          ["Reservas de 1 noche", "Se pagan completas (no abono)."],
        ],
      },
      {
        kind: "tip",
        text: "Sin la reserva confirmada no se puede hacer check-in, y sin check-in no se puede hacer check-out. Si un huésped no puede salir, revisen que su reserva esté confirmada.",
      },
    ],
  },
  {
    id: "pausa",
    emoji: "⏸️",
    title: "Lucía y la pausa",
    blocks: [
      {
        kind: "p",
        text: "Cuando una de ustedes responde un chat (desde la app o desde el teléfono de Lucía), **Lucía deja de contestar en ese chat hasta el cierre de recepción** y después retoma sola. En los demás chats sigue atendiendo.",
      },
      {
        kind: "image",
        src: "/manual/chat-pausa.png",
        alt: "Chat con Lucía en pausa y el botón Devolver a Lucía",
        notes: ["Cuando el equipo respondió, abajo aparece la pausa y la hora en que Lucía vuelve. **Devolver a Lucía** la reactiva de inmediato."],
      },
      {
        kind: "table",
        head: ["Hostal", "Cierre lun. a vie.", "Cierre sáb. y dom."],
        rows: [
          ["Cobija", "19:30", "19:30"],
          ["Modulares (Centro)", "23:30", "19:00"],
          ["Atacama", "19:00", "19:00"],
        ],
      },
      {
        kind: "bullets",
        items: [
          "Abajo del chat se ve el estado: «🤖 Lucía atiende este chat» o «⏸️ Lucía está en pausa… vuelve sola a las 19:00».",
          "Si terminaron antes y quieren que Lucía siga, toquen **Devolver a Lucía**.",
          "Si el cliente escribió y nadie le contestó, Lucía le responde apenas termina la pausa.",
          "Si responden con la recepción ya cerrada, la pausa dura solo 1 hora.",
        ],
      },
    ],
  },
  {
    id: "avisos",
    emoji: "📣",
    title: "Avisos que les llegan por WhatsApp",
    blocks: [
      { kind: "p", text: "Les llegan a la encargada de la hostal y a administración, con el cliente, el motivo y un link directo al chat." },
      {
        kind: "table",
        head: ["Aviso", "Significa"],
        rows: [
          ["🔔 Lucía necesita ayuda", "Lucía derivó el caso (reclamo, duda fuera del manual, imagen o audio). Respondan en el chat."],
          ["🔔 Nueva solicitud de reserva", "Confirmen la disponibilidad (OK / NO + código)."],
          ["✅ Disponibilidad confirmada", "Se le enviaron al cliente el monto y los datos de pago."],
          ["⏰ Venció el plazo", "No llegó el pago a tiempo y se anuló la reserva pendiente."],
          ["💸 Comprobante recibido (con la imagen)", "Verifiquen el pago en el banco y confirmen."],
          ["💸⚠️ Comprobante tardío", "Pagó después de vencer y la habitación ya no está libre: resuélvanlo con el cliente."],
          ["🚶 Cliente en camino", "Va directo a la hostal: alguien debe recibirlo."],
          ["🚨 Cliente en la entrada", "Está afuera esperando: atiéndanlo de inmediato."],
        ],
      },
      {
        kind: "p",
        text: "**Aviso al grupo a los 30 minutos:** si un caso derivado o una reserva por confirmar pasa 30 minutos sin respuesta del equipo, Lucía escribe en el grupo del equipo con la hostal, el cliente y el motivo (una sola vez por caso, entre 08:00 y 23:30).",
      },
    ],
  },
  {
    id: "reglas",
    emoji: "✅",
    title: "Reglas importantes",
    blocks: [
      {
        kind: "steps",
        items: [
          "**Respondan siempre desde Oasis Chats o desde el teléfono de Lucía.** Si escriben desde su WhatsApp personal o el número de la hostal, Lucía no se entera y el cliente queda con dos conversaciones.",
          "**Todas las reservas deben estar en el calendario del ERP** (Booking, teléfono, llegadas directas). Si una reserva no está cargada, Lucía puede ofrecer una pieza ocupada.",
          "**Nunca confirmen una reserva sin ver el pago en el banco.**",
          "**Marquen «Resuelto»** al terminar un caso que Lucía derivó, para que salga de «Por atender».",
          "**Registren cada pago una sola vez** (Pago verificado o en la reserva, no en ambos).",
        ],
      },
    ],
  },
  {
    id: "faq",
    emoji: "❓",
    title: "Preguntas frecuentes",
    blocks: [
      { kind: "p", text: "**¿El cliente ve que no soy Lucía?** Ve los mensajes en el mismo chat, sin nombre. Pueden presentarse: «Hola, soy Carla de recepción»." },
      { kind: "p", text: "**¿Qué pasa si no alcanzo a responder?** A los 30 minutos se avisa al grupo. Al cierre de recepción Lucía retoma el chat y contesta lo pendiente." },
      { kind: "p", text: "**No veo un chat que debería ver.** Revisen la pestaña «Todos». Si es de una hostal que no tienen asignada en el ERP, pidan a administración que se la asignen." },
      { kind: "p", text: "**El cliente mandó una foto del comprobante y no la veo en la app.** La imagen llega adjunta en el WhatsApp «💸 comprobante» que reciben la encargada y administración." },
      { kind: "p", text: "**Un huésped no puede hacer check-out.** Lo más común es que la reserva no tenga check-in porque no quedó confirmada. Revisen que el pago esté registrado y la reserva confirmada; después hagan check-in y check-out." },
      { kind: "p", text: "**La app me pide contraseña otra vez.** Entren con su correo y contraseña del ERP; si no la recuerdan, usen «¿Olvidaste tu contraseña?»." },
    ],
  },
];
