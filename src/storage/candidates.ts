import type { OrderCandidate } from "@prisma/client";
import type { CandidateDraft, CandidateStatus } from "../types/index.js";
import { prisma } from "./prisma.js";

export const saveCandidate = async (candidate: CandidateDraft): Promise<OrderCandidate> => {
  return prisma.orderCandidate.upsert({
    where: { id: candidate.id },
    create: {
      id: candidate.id,
      symbol: candidate.symbol,
      side: candidate.side,
      orderType: candidate.orderType,
      quantity: candidate.quantity,
      estimatedPrice: candidate.estimatedPrice,
      estimatedAmount: candidate.estimatedAmount,
      status: candidate.status,
      rawData: candidate.rawData ? JSON.stringify(candidate.rawData) : undefined,
      createdAt: candidate.createdAt,
      expiresAt: candidate.expiresAt
    },
    update: {
      symbol: candidate.symbol,
      side: candidate.side,
      orderType: candidate.orderType,
      quantity: candidate.quantity,
      estimatedPrice: candidate.estimatedPrice,
      estimatedAmount: candidate.estimatedAmount,
      rawData: candidate.rawData ? JSON.stringify(candidate.rawData) : undefined,
      expiresAt: candidate.expiresAt
    }
  });
};

export const findCandidate = async (id: string): Promise<OrderCandidate | null> => {
  return prisma.orderCandidate.findUnique({ where: { id } });
};

export const markCandidateStatus = async (
  id: string,
  status: CandidateStatus,
  dateField?: "approvedAt" | "canceledAt" | "executedAt"
): Promise<OrderCandidate> => {
  return prisma.orderCandidate.update({
    where: { id },
    data: {
      status,
      ...(dateField ? { [dateField]: new Date() } : {})
    }
  });
};
