import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};
