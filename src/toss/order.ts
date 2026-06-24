import type { OrderRequest, OrderResult } from "../types/index.js";
import { getDefaultAccountSeq } from "./account.js";
import { createTossClient } from "./client.js";

interface ApiResponse<T> {
  result: T;
}

interface OrderResponse {
  orderId: string;
  clientOrderId?: string | null;
}

interface OrderLookupResponse {
  orders: TossOrder[];
}

interface TossOrder {
  orderId: string;
  symbol?: string;
  status?: string | null;
  orderStatus?: string | null;
  state?: string | null;
  orderState?: string | null;
  rejectReason?: string | null;
  rejectionReason?: string | null;
  cancelReason?: string | null;
  execution?: {
    filledQuantity?: string | null;
    averageFilledPrice?: string | null;
    filledAt?: string | null;
  } | null;
}

export interface OrderAcceptance {
  accepted: boolean;
  verified: boolean;
  orderStatus: string;
  detail: string;
  raw?: unknown;
}

const sleep = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const getKstDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number): Date => {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
};

const orderStatusText = (order: TossOrder, statusGroup: "OPEN" | "CLOSED"): string => {
  return [
    order.status,
    order.orderStatus,
    order.state,
    order.orderState,
    order.rejectReason,
    order.rejectionReason,
    order.cancelReason,
    statusGroup
  ]
    .filter(Boolean)
    .join(" ");
};

const hasFilledExecution = (order: TossOrder): boolean => {
  return Boolean(order.execution?.filledAt || Number(order.execution?.filledQuantity ?? 0) > 0);
};

const classifyOrder = (order: TossOrder, statusGroup: "OPEN" | "CLOSED"): OrderAcceptance => {
  const statusText = orderStatusText(order, statusGroup);
  const upper = statusText.toUpperCase();

  if (/(REJECT|REJECTED|CANCEL|CANCELED|CANCELLED|EXPIRE|EXPIRED|DENIED|FAIL|FAILED)/.test(upper)) {
    return {
      accepted: false,
      verified: true,
      orderStatus: statusText,
      detail: "주문이 거부/취소/만료 상태로 조회되었습니다.",
      raw: order
    };
  }

  if (statusGroup === "OPEN") {
    return {
      accepted: true,
      verified: true,
      orderStatus: statusText,
      detail: "주문이 OPEN 목록에서 접수 상태로 확인되었습니다.",
      raw: order
    };
  }

  if (hasFilledExecution(order)) {
    return {
      accepted: true,
      verified: true,
      orderStatus: statusText,
      detail: "주문이 CLOSED 목록에서 체결 상태로 확인되었습니다.",
      raw: order
    };
  }

  return {
    accepted: false,
    verified: true,
    orderStatus: statusText,
    detail: "주문이 CLOSED 목록에 있으나 체결 내역이 없어 접수 실패로 판단했습니다.",
    raw: order
  };
};

const findOrderById = async (
  accountSeq: string,
  orderId: string,
  symbol: string,
  statusGroup: "OPEN" | "CLOSED"
): Promise<TossOrder | null> => {
  const client = await createTossClient(accountSeq);
  const today = new Date();
  const response = await client.get<ApiResponse<OrderLookupResponse>>("/api/v1/orders", {
    params: {
      status: statusGroup,
      symbol,
      from: getKstDate(addDays(today, -1)),
      to: getKstDate(today),
      limit: 100
    }
  });

  return response.data.result.orders.find((order) => order.orderId === orderId) ?? null;
};

export const verifyOrderAcceptance = async (
  orderId: string,
  orderRequest: OrderRequest,
  accountSeq = orderRequest.accountId,
  attempts = 6,
  delayMs = 2_000
): Promise<OrderAcceptance> => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    for (const statusGroup of ["OPEN", "CLOSED"] as const) {
      const order = await findOrderById(accountSeq, orderId, orderRequest.symbol, statusGroup);
      if (order) {
        return classifyOrder(order, statusGroup);
      }
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  return {
    accepted: false,
    verified: false,
    orderStatus: "NOT_FOUND",
    detail: "주문 요청 후 토스 주문 목록에서 orderId를 확인하지 못했습니다."
  };
};

export const placeOrder = async (orderRequest: OrderRequest): Promise<OrderResult> => {
  const accountSeq = orderRequest.accountId || (await getDefaultAccountSeq());
  const client = await createTossClient(accountSeq);
  const quantity = Math.floor(orderRequest.quantity);

  if (quantity < 1) {
    throw new Error("Toss order quantity must be at least 1 whole share.");
  }

  if (orderRequest.orderType === "MOC") {
    throw new Error("MOC order is not enabled. Confirm Toss Securities support before live ordering.");
  }

  if ((orderRequest.orderType === "LOC" || orderRequest.orderType === "LIMIT") && !orderRequest.limitPrice) {
    throw new Error(`${orderRequest.orderType} order requires limitPrice.`);
  }

  const payload = {
    clientOrderId: orderRequest.clientOrderId,
    symbol: orderRequest.symbol,
    side: orderRequest.side,
    orderType: orderRequest.orderType === "MARKET" ? "MARKET" : "LIMIT",
    ...(orderRequest.orderType === "LOC" ? { timeInForce: "CLS" } : {}),
    ...(orderRequest.orderType === "LIMIT" ? { timeInForce: "DAY" } : {}),
    quantity: String(quantity),
    ...(orderRequest.limitPrice ? { price: String(orderRequest.limitPrice) } : {})
  };

  const response = await client.post<ApiResponse<OrderResponse>>("/api/v1/orders", payload);

  return {
    brokerOrderId: response.data.result.orderId,
    accountId: accountSeq,
    status: "SUBMITTED",
    raw: response.data
  };
};
