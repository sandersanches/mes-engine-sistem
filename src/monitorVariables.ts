import { getLastValueFromInflux } from "./services/metrics/influxProcessService";
import logger from "./services/logger";
import { ProcessVariableStore } from "./stores/processVariableStore";
import { ProcessVariableAletLogStore } from "./stores/processVariableAlertLogStore";
import { ProcessVariableStateStore } from "./stores/processVariableStateStore";

export async function monitorVariables() {
  logger.debug("--- Iniciando Monitoramento de Variáveis de Processo ---");

  // const variables = await prisma.processVariable.findMany({
  //   where: { deletedAt: null },
  //   include: { currentState: { include: { alertLog: true } } },
  // });

  const processVariables = await ProcessVariableStore.getAll();

  for (const variable of processVariables) {
    try {
      const lastData = await getLastValueFromInflux({
        measurement: variable.measurement,
        field: variable.field,
        deviceId: variable.deviceId,
      });
      console.log("variable:", variable.deviceId);
      console.log("lastData:", lastData);

      if (!lastData) continue;

      const currentValue = lastData.value;
      const currentTime = new Date(lastData.time);

      // Atualiza o lastValue na tabela principal
      await ProcessVariableStore.update({
        id: variable.id,
        lastvalue: currentValue,
        updatedAt: currentTime,
      });

      let isOutOfLimits = false;
      let limitType: "MIN" | "MAX" | null = null;

      // Verificação de limites
      if (
        variable.isMaxLimitMonitoring &&
        variable.maxValueLimit !== null &&
        currentValue > variable.maxValueLimit
      ) {
        isOutOfLimits = true;
        limitType = "MAX";
      } else if (
        variable.isMinLimitMonitoring &&
        variable.minValueLimit !== null &&
        currentValue < variable.minValueLimit
      ) {
        isOutOfLimits = true;
        limitType = "MIN";
      }

      if (isOutOfLimits && limitType) {
        if (
          !variable.ProcessVariableState ||
          (variable.ProcessVariableState &&
            variable.ProcessVariableState.ProcessVariableAlertLog.limitType !==
              limitType)
        ) {
          // 🚀 CRIAR NOVO ALERTA
          const newLog = await ProcessVariableAletLogStore.create({
            processVariableId: variable.id,
            startTime: currentTime,
            endTime: currentTime,
            peakValue: currentValue,
            limitType: limitType,
          });

          if (!variable.ProcessVariableState) {
            await ProcessVariableStateStore.create({
              processVariableId: variable.id,
              alertLogId: newLog.id,
            });
          } else {
            await ProcessVariableStateStore.update({
              id: variable.ProcessVariableState.id,
              alertLogId: newLog.id,
            });
          }

          logger.warn(
            `⚠️ Alerta INICIADO: ${variable.name} (${currentValue}${variable.unit})`,
          );
        } else if (
          limitType ===
          variable.ProcessVariableState.ProcessVariableAlertLog.limitType
        ) {
          // 🔄 ATUALIZAR ALERTA EXISTENTE
          const log = variable.ProcessVariableState.ProcessVariableAlertLog;

          let newPeak = log.peakValue;

          if (limitType === "MAX")
            newPeak = Math.max(log.peakValue, currentValue);
          if (limitType === "MIN")
            newPeak = Math.min(log.peakValue, currentValue);

          await ProcessVariableAletLogStore.update({
            id: log.id,
            endTime: currentTime,
            peakValue: newPeak,
          });

          logger.debug(
            `🔄 Alerta MANTIDO: ${variable.name} atingindo ${currentValue}${variable.unit}`,
          );
        }
      } else {
        // ✅ VOLTOU AO NORMAL (DENTRO DOS LIMITES)
        if (variable.ProcessVariableState) {
          // Apenas apaga o estado. O AlertLog já teve o endTime atualizado no último ciclo "ruim"
          await ProcessVariableStateStore.delete({
            id: variable.ProcessVariableState.id,
          });

          logger.info(`✅ Variável NORMALIZADA: ${variable.name}`);
        }
      }
    } catch (err) {
      logger.error({ err }, `Erro ao processar variável ${variable.name}`);
    }
  }
}
