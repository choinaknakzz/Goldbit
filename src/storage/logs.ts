import { prisma } from "./prisma.js";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export const writeLog = async (
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): Promise<void> => {
  const renderedContext = context ? JSON.stringify(context) : undefined;
  const consoleLine = `[${level}] ${message}${renderedContext ? ` ${renderedContext}` : ""}`;

  if (level === "ERROR") {
    console.error(consoleLine);
  } else if (level === "WARN") {
    console.warn(consoleLine);
  } else {
    console.info(consoleLine);
  }

  await prisma.appLog.create({
    data: {
      level,
      message,
      context: renderedContext
    }
  });
};
