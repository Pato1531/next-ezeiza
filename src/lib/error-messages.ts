// src/lib/error-messages.ts
// Traduce errores técnicos de Supabase/red a mensajes legibles para el usuario.
// Usar en cualquier catch o json.error antes de mostrar al usuario.

export function mensajeError(raw: string | null | undefined): string {
  if (!raw) return 'Ocurrió un error inesperado. Intentá de nuevo.'

  const e = raw.toLowerCase()

  // Conectividad / red
  if (e.includes('failed to fetch') || e.includes('networkerror') || e.includes('network request'))
    return 'No hay conexión. Verificá tu internet e intentá de nuevo.'

  if (e.includes('timeout') || e.includes('timed out'))
    return 'La operación tardó demasiado. Intentá de nuevo.'

  // Auth
  if (e.includes('jwt') || e.includes('token') || e.includes('session'))
    return 'Tu sesión expiró. Recargá la página para volver a ingresar.'

  if (e.includes('invalid login') || e.includes('invalid credentials') || e.includes('email not confirmed'))
    return 'Email o contraseña incorrectos.'

  if (e.includes('user already registered') || e.includes('already exists'))
    return 'Ya existe una cuenta con ese email.'

  // Permisos
  if (e.includes('403') || e.includes('not authorized') || e.includes('insufficient'))
    return 'No tenés permiso para realizar esta acción.'

  if (e.includes('row-level security') || e.includes('rls') || e.includes('policy'))
    return 'No tenés acceso a este registro.'

  // DB — duplicados
  if (e.includes('duplicate') || e.includes('unique') || e.includes('23505'))
    return 'Ya existe un registro con esos datos. Revisá si ya fue cargado.'

  // DB — referencia
  if (e.includes('foreign key') || e.includes('23503'))
    return 'No se puede eliminar porque tiene registros relacionados.'

  // DB — columna o tabla inexistente (migración pendiente)
  if (e.includes('column') && e.includes('does not exist'))
    return 'El sistema necesita una actualización de base de datos. Contactá al administrador.'

  if (e.includes('relation') && e.includes('does not exist'))
    return 'El sistema necesita una actualización de base de datos. Contactá al administrador.'

  // DB — valor inválido
  if (e.includes('invalid input syntax') || e.includes('22p02'))
    return 'Uno de los valores ingresados no es válido.'

  if (e.includes('not null') || e.includes('23502'))
    return 'Falta completar un campo obligatorio.'

  // Servidor
  if (e.includes('500') || e.includes('internal server'))
    return 'Error interno del servidor. Intentá de nuevo en unos segundos.'

  if (e.includes('503') || e.includes('service unavailable'))
    return 'El servicio no está disponible en este momento. Intentá más tarde.'

  // Rate limit
  if (e.includes('429') || e.includes('too many') || e.includes('rate limit'))
    return 'Demasiadas solicitudes seguidas. Esperá unos segundos e intentá de nuevo.'

  // Fallback: devolver el error original si no matchea nada
  // pero sin jerga técnica de DB
  const limpio = raw
    .replace(/\b(supabase|postgres|postgresql|sql|rls|jwt|http)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return limpio.length > 5 ? limpio : 'Ocurrió un error inesperado. Intentá de nuevo.'
}
