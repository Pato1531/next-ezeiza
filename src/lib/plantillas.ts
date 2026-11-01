// Plantillas de mensajes de WhatsApp.
// Cada plantilla tiene un texto por defecto. El instituto puede editarlo desde
// Personalizaciones (director y secretaria). Las variables van entre llaves: {nombre}.

import { marca } from './brand'

export type PlantillaKey =
  | 'bienvenida'
  | 'comprobante'
  | 'recibo'
  | 'cuota_recordatorio'
  | 'cobranza_deudor'
  | 'cuota_vencida'
  | 'cobranza_consulta'
  | 'ausencias'
  | 'boletin'
  | 'consulta_lista_espera'
  | 'cumpleanos'

export interface PlantillaDef {
  key: PlantillaKey
  titulo: string
  descripcion: string
  vars: string[]
  texto: string
}

export const PLANTILLAS: PlantillaDef[] = [
  {
    key: 'cobranza_consulta',
    titulo: 'Cobranza: consulta al día',
    descripcion: 'Se envía a alumnos que van al día con la cuota del mes',
    vars: ['contacto', 'instituto'],
    texto: 'Hola {contacto}, ¿cómo estás? 😄\nTe escribimos desde *{instituto}* para consultarte si pudiste realizar el pago de la cuota de este mes.\n📌 En caso de ya haberlo abonado, podés ignorar este mensaje. 📲 Si aún no, estamos a disposición por cualquier consulta.\nMuchas gracias 🙌',
  },
  {
    key: 'cuota_vencida',
    titulo: 'Cobranza: cuota vencida',
    descripcion: 'Se envía a alumnos con la cuota del mes vencida',
    vars: ['contacto', 'instituto'],
    texto: 'Hola {contacto}, ¿cómo estás? 😄\nTe escribimos desde *{instituto}* ya que la cuota del mes se encuentra vencida.\n📌 A partir de ahora se aplica el recargo correspondiente, según política del instituto.\n📲 Cualquier consulta o si necesitás ayuda con el pago, estamos a disposición.\nMuchas gracias 🙌',
  },
  {
    key: 'cobranza_deudor',
    titulo: 'Cobranza: cuota no registrada',
    descripcion: 'Se envía cuando la cuota del mes no figura como pagada',
    vars: ['contacto', 'periodo', 'alumno', 'instituto'],
    texto: 'Hola {contacto} 👋, te escribimos desde *{instituto}*. Notamos que la cuota de *{periodo}* de *{alumno}* aún no fue registrada.\n📌 Si ya realizaste el pago, por favor ignorá este mensaje. Cualquier consulta estamos disponibles. ¡Muchas gracias! 🙌',
  },
  {
    key: 'cuota_recordatorio',
    titulo: 'Cuota pendiente',
    descripcion: 'Recordatorio de cuota pendiente desde la ficha del alumno',
    vars: ['contacto', 'periodo', 'alumno', 'monto_linea', 'curso', 'instituto'],
    texto: 'Hola {contacto}! 👋 Te escribimos de *{instituto}*.\n\nTe recordamos que la cuota de *{periodo}* de *{alumno}* se encuentra pendiente de pago.\n{monto_linea}📚 Curso: *{curso}*\n\nPodés abonar en el instituto o por transferencia. Ante cualquier consulta estamos a disposición. ¡Muchas gracias! 🙏',
  },
  {
    key: 'recibo',
    titulo: 'Recibo de pago',
    descripcion: 'Se envía junto con el link del recibo al registrar un pago',
    vars: ['contacto', 'alumno', 'periodo', 'monto', 'fecha', 'metodo', 'link', 'instituto'],
    texto: '✅ *Recibo de pago — {instituto}*\n\nHola {contacto}! Confirmamos el pago de *{periodo}* de *{alumno}*.\n\n💰 Monto: *${monto}*\n📅 Fecha: {fecha}\n💳 Método: {metodo}\n\n📄 Tu recibo: {link}\n\n¡Gracias! 🙌',
  },
  {
    key: 'bienvenida',
    titulo: 'Bienvenida',
    descripcion: 'Se envía al inscribir un alumno nuevo',
    vars: ['alumno', 'nivel', 'link', 'instituto'],
    texto: '¡Bienvenido/a a *{instituto}*! 🎉\n\nConfirmamos la inscripción de *{alumno}* — Nivel *{nivel}*.\n\n📄 Tu comprobante de inscripción: {link}\n\nCualquier consulta, estamos a disposición. ¡Gracias! 🙌',
  },
  {
    key: 'comprobante',
    titulo: 'Comprobante de inscripción',
    descripcion: 'Reenvío del comprobante a un alumno ya inscripto',
    vars: ['contacto', 'alumno', 'link', 'instituto'],
    texto: 'Hola {contacto}! 👋 Te escribimos de *{instituto}*.\n\n📄 Aquí tenés el comprobante de inscripción de *{alumno}*: {link}\n\nCualquier consulta, estamos a disposición. ¡Gracias! 🙌',
  },
  {
    key: 'ausencias',
    titulo: 'Ausencias consecutivas',
    descripcion: 'Aviso a la familia por faltas seguidas del alumno',
    vars: ['nombre', 'ausencias_texto', 'curso', 'instituto'],
    texto: 'Hola {nombre}, te contactamos desde {instituto} porque registramos {ausencias_texto} en el curso {curso}. Queremos saber cómo estás. ¡Esperamos verte pronto!',
  },
  {
    key: 'boletin',
    titulo: 'Boletín de calificaciones',
    descripcion: 'Envío del link del boletín publicado',
    vars: ['contacto', 'alumno', 'periodo', 'link', 'instituto'],
    texto: 'Hola {contacto}! 👋\n\nTe enviamos el boletín de calificaciones de {alumno} correspondiente al período {periodo}.\n\nPodés verlo aquí 👇\n{link}\n\n⏳ El link vence en 48 horas.\n\nCualquier duda o inquietud, estamos a disposición.\n\nLa Administración — {instituto}',
  },
  {
    key: 'consulta_lista_espera',
    titulo: 'Consulta de lista de espera',
    descripcion: 'Respuesta a un interesado de la lista de espera',
    vars: ['nombre', 'instituto'],
    texto: 'Hola {nombre}, te contactamos desde {instituto}. Tenemos disponibilidad para el curso que consultaste. ¿Podemos coordinar?',
  },
  {
    key: 'cumpleanos',
    titulo: 'Cumpleaños',
    descripcion: 'Saludo de cumpleaños a alumnos o colaboradores',
    vars: ['nombre', 'instituto'],
    texto: '🎉 ¡Feliz cumpleaños, {nombre}! 🎂\n\nEsperamos que tengas un día maravilloso, rodeada de cariño y momentos felices.\n¡Que disfrutes mucho tu día!\n\nCon cariño,\n\nEl equipo de {instituto} 🥳',
  },
]

export const PLANTILLA_KEYS = PLANTILLAS.map(p => p.key)

export function plantillaDef(key: PlantillaKey) {
  return PLANTILLAS.find(p => p.key === key)!
}

// Devuelve el texto listo para enviar. Usa la versión del instituto si existe, si no el default.
// {instituto} se completa solo con el nombre del instituto.
export function renderPlantilla(key: PlantillaKey, vars: Record<string, string | number> = {}): string {
  const def = plantillaDef(key)
  const { nombre, plantillas } = marca()
  const personalizada = plantillas?.[key]
  const base = typeof personalizada === 'string' && personalizada.trim() ? personalizada : def.texto
  const valores: Record<string, string | number> = { instituto: nombre, ...vars }
  return base.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? String(valores[k]) : m))
}
