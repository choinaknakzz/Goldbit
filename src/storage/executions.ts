import type { OrderExecution } from "@prisma/client";
import type { ExecutionStatus, OrderRequest } from "../types/index.js";
import { prisma } from "./prisma.js";

interface SaveExecutionInput {
  candidateId: string;
  clientOrderId?: string;
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
      clientOrderId: input.clientOrderId,
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

interface UpdateExecutionInput {
  status?: ExecutionStatus;
  brokerOrderId?: string;
  responsePayload?: unknown;
  errorMessage?: string | null;
  verifiedAt?: Date;
}

export const updateExecution = async (id: string, input: UpdateExecutionInput): Promise<OrderExecution> => {
  const existing = input.responsePayload
    ? await prisma.orderExecution.findUnique({ where: { id }, select: { responsePayload: true } })
    : null;
  let responsePayload: string | undefined;
  if (input.responsePayload) {
    let previous: Record<string, unknown> = {};
    try {
      previous = existing?.responsePayload ? (JSON.parse(existing.responsePayload) as Record<string, unknown>) : {};
    } catch {
      previous = {};
    }
    responsePayload = JSON.stringify({ ...previous, ...(input.responsePayload as Record<string, unknown>) });
  }

  return prisma.orderExecution.update({
    where: { id },
    data: {
      status: input.status,
      brokerOrderId: input.brokerOrderId,
      responsePayload,
      errorMessage: input.errorMessage,
      verifiedAt: input.verifiedAt
    }
  });
};

export const findSubmittedExecutions = async (): Promise<OrderExecution[]> => {
  return prisma.orderExecution.findMany({
    where: { status: "SUBMITTED" },
    orderBy: { createdAt: "asc" }
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
