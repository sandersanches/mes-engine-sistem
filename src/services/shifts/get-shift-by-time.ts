// src/services/shifts/get-shift-by-time.ts
import { Shift } from "@prisma/client";
import { DateTime } from "luxon";

export function getShiftByTime(timestamp: Date, shifts: Shift[]): Shift | null {
  // Converter para America/Sao_Paulo
  const localTime = DateTime.fromJSDate(timestamp).setZone("America/Sao_Paulo");

  for (const shift of shifts) {
    const start = DateTime.fromJSDate(shift.startTime).setZone(
      "America/Sao_Paulo",
    );
    const end = DateTime.fromJSDate(shift.endTime).setZone("America/Sao_Paulo");

    // Criar horários do turno no mesmo dia do timestamp
    const shiftStart = localTime.set({
      hour: start.hour,
      minute: start.minute,
      second: 0,
    });
    let shiftEnd = localTime.set({
      hour: end.hour,
      minute: end.minute,
      second: 0,
    });

    // Se o turno atravessa a meia-noite, soma 1 dia no fim
    if (end < start) {
      shiftEnd = shiftEnd.plus({ days: 1 });
    }

    // Verifica se o timestamp está dentro do turno
    if (localTime >= shiftStart && localTime < shiftEnd) {
      return shift;
    }
  }

  return null;
}
