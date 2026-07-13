import type { OrderExecution } from "@prisma/client";
import { markCandidateStatus } from "../storage/candidates.js";
import { findSubmittedExecutions, updateExecution } from "../storage/executions.js";
import { writeLog } from "../storage/logs.js";
import {
  verifyOrderAcceptance,
  verifyOrderAcceptanceByClientOrderId,
  type OrderAcceptanceLookup
} from "../toss/order.js";
import type { OrderRequest } from "../types/index.js";
import { sendTextMessage } from "../telegram/message.js";

export interface OrderReconciliationResult {
  checked: number;
  accepted: number;
  failed: number;
  unresolved: number;
}

const parseOrderRequest = (execution: OrderExecution): OrderRequest | null => {
  if (!execution.requestPayload) return null;
  try {
    return JSON.parse(execution.requestPayload) as OrderRequest;
  } catch {
    return null;
  }
};

const resolveOrder = async (execution: OrderExecution, request: OrderRequest): Promise<OrderAcceptanceLookup | null> => {
  if (execution.brokerOrderId) {
    const acceptance = await verifyOrderAcceptance(execution.brokerOrderId, request, request.accountId, 1, 0);
    return { brokerOrderId: execution.brokerOrderId, acceptance };
  }

  if (!execution.clientOrderId) return null;
  return verifyOrderAcceptanceByClientOrderId(execution.clientOrderId, request, request.accountId, 1, 0);
};

export const reconcileSubmittedOrders = async (): Promise<OrderReconciliationResult> => {
  const submitted = await findSubmittedExecutions();
  const result: OrderReconciliationResult = { checked: submitted.length, accepted: 0, failed: 0, unresolved: 0 };
  const resolvedLines: string[] = [];

  for (const execution of submitted) {
    const request = parseOrderRequest(execution);
    if (!request) {
      result.unresolved += 1;
      continue;
    }

    try {
      const lookup = await resolveOrder(execution, request);
      if (!lookup || !lookup.acceptance.verified) {
        result.unresolved += 1;
        continue;
      }

      if (lookup.acceptance.accepted) {
        await updateExecution(execution.id, {
          status: "SUCCESS",
          brokerOrderId: lookup.brokerOrderId,
          responsePayload: { acceptance: lookup.acceptance },
          errorMessage: null,
          verifiedAt: new Date()
        });
        await markCandidateStatus(execution.candidateId, "EXECUTED", "executedAt").catch(() => undefined);
        result.accepted += 1;
        resolvedLines.push(`- 접수 확인: ${execution.side} ${execution.orderType} ${execution.quantity.toFixed(0)}주`);
      } else {
        await updateExecution(execution.id, {
          status: "FAILED",
          brokerOrderId: lookup.brokerOrderId,
          responsePayload: { acceptance: lookup.acceptance },
          errorMessage: lookup.acceptance.detail,
          verifiedAt: new Date()
        });
        await markCandidateStatus(execution.candidateId, "FAILED").catch(() => undefined);
        result.failed += 1;
        resolvedLines.push(`- 접수 실패: ${execution.side} ${execution.orderType} ${execution.quantity.toFixed(0)}주`);
      }
    } catch (error) {
      result.unresolved += 1;
      await writeLog("WARN", "submitted order reconciliation lookup failed", {
        candidateId: execution.candidateId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (resolvedLines.length > 0) {
    await sendTextMessage(
      [
        "[Goldbit 주문 접수 재확인]",
        "",
        ...resolvedLines,
        "",
        `확인 완료: ${result.accepted + result.failed}건 / 미확정: ${result.unresolved}건`
      ].join("\n")
    );
  }

  if (submitted.length > 0) await writeLog("INFO", "submitted order reconciliation completed", { ...result });
  return result;
};
