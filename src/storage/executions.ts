import type { OrderExecution } from "@prisma/client";
import type { ExecutionStatus, OrderRequest } from "../types/index.js";
import { prisma } from "./prisma.js";

interface SaveExecutionInput {
  candidateId: string;
  symbol: string;
  side: string;
  orderType: string;
  quantity: number;
  status: ExecutionStatus;
  brokerOrderId?: string;
  requestPayload?: OrderRequest;
  responsePayload?: unknown;
  errorMessage?: string;
}

export const saveExecution = async (input: SaveExecutionInput): Promise<OrderExecution> => {
  return prisma.orderExecution.create({
    data: {
      candidateId: input.candidateId,
      symbol: input.symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: input.quantity,
      status: input.status,
      brokerOrderId: input.brokerOrderId,
      requestPayload: input.requestPayload ? JSON.stringify(input.requestPayload) : undefined,
      responsePayload: input.responsePayload ? JSON.stringify(input.responsePayload) : undefined,
      errorMessage: input.errorMessage
    }
  });
};

export const findSuccessfulExecutionsByBrokerOrderIds = async (
  brokerOrderIds: string[]
): Promise<OrderExecution[]> => {
  const ids = [...new Set(brokerOrderIds.filter(Boolean))];
  if (ids.length === 0) return [];

  return prisma.orderExecution.findMany({
    where: {
      status: {
        in: ["SUCCESS", "SUBMITTED"]
      },
      brokerOrderId: {
        in: ids
      }
    }
  });
};
