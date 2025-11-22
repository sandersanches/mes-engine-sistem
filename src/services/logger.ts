import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const logger = pino({
  level: process.env.LOG_LEVEL || "debug",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true, // cores no terminal
          translateTime: false, // remove timestamp
          ignore: "pid,hostname,time,level", // remove informações extras
          messageFormat: "{msg}", // exibe só a mensagem
          singleLine: false, // quebra linhas automaticamente
        },
      }
    : undefined,
});

export default logger;
