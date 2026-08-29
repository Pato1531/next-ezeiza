-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: recibo por clase (clases particulares)
--
-- Contexto: hoy, cobrar una clase particular usa tipo='cuota', que el endpoint
-- registrar-pago BORRA y reemplaza cada vez que se cobra una clase más en el
-- mismo mes (misma lógica que la cuota mensual normal). Esto hace que el
-- recibo ya entregado a un padre deje de existir (404) apenas se cobra la
-- clase siguiente, y que no haya comprobante por clase individual.
--
-- Esta migración agrega una columna clase_id a pagos_alumnos para poder:
--   1) Usar un tipo de pago nuevo ('clase_particular') que NO se reemplaza
--      (se inserta como fila nueva, igual que 'proporcional').
--   2) Vincular cada pago a la clase puntual que paga, para no cobrarla dos
--      veces y para poder mostrar en el recibo la fecha exacta de esa clase.
-- ─────────────────────────────────────────────────────────────────────────────

-- PASO 1 — Verificar estado actual (no modifica nada)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pagos_alumnos'
ORDER BY ordinal_position;

-- PASO 2 — Agregar la columna (idempotente)
ALTER TABLE pagos_alumnos
  ADD COLUMN IF NOT EXISTS clase_id uuid REFERENCES clases(id) ON DELETE SET NULL;

-- Índice para las búsquedas de "¿esta clase ya fue cobrada?" y para el join
-- del recibo con la fecha de la clase.
CREATE INDEX IF NOT EXISTS idx_pagos_alumnos_clase_id
  ON pagos_alumnos(clase_id) WHERE clase_id IS NOT NULL;

-- Evita cobrar la misma clase dos veces por error (doble tap, doble insert).
-- Solo aplica cuando clase_id no es NULL — los pagos normales (cuota,
-- matrícula, etc.) no tienen clase_id y no se ven afectados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_alumnos_alumno_clase_unico
  ON pagos_alumnos(alumno_id, clase_id) WHERE clase_id IS NOT NULL;

-- PASO 3 — Verificación final
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pagos_alumnos' AND column_name = 'clase_id';
