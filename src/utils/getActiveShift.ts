//src\utils\getActiveShift.ts
import { Shift } from "@prisma/client";

/**
 * Retorna o turno ativo baseado no horário (sem considerar a data real, apenas hora/minuto).
 * Suporta turnos que atravessam a meia-noite.
 */
export function getActiveShift(timestamp: Date, shifts: Shift[]): Shift | null {
  // Converte o timestamp para o horário local de São Paulo
  const local = new Date(
    timestamp.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const minutesNow = local.getHours() * 60 + local.getMinutes();

  for (const shift of shifts) {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);

    const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
    const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes();

    // Caso 1: turno normal (não cruza meia-noite)
    if (startMinutes < endMinutes) {
      if (minutesNow >= startMinutes && minutesNow < endMinutes) {
        return shift;
      }
    } else {
      // Caso 2: turno cruza a meia-noite (ex: 22h → 06h)
      if (minutesNow >= startMinutes || minutesNow < endMinutes) {
        return shift;
      }
    }
  }

  return null;
}
