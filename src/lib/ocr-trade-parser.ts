import type { OrderType, TradeInput, TradeType } from "@/lib/types";

export interface OcrTradeParseOptions {
  defaultDate?: string;
  defaultOrderType?: OrderType;
  feeRatePercent?: number;
}

export interface OcrTradeParseResult {
  trade: TradeInput | null;
  confidence: number;
  notes: string[];
}

const KOREAN = {
  buy: "\\uB9E4\\uC218|\\uAD6C\\uB9E4|\\uB9E4\\uC785",
  sell: "\\uB9E4\\uB3C4|\\uD310\\uB9E4",
  share: "\\uC8FC",
  perShare: "\\uC8FC\\uB2F9",
  quantity: "\\uC218\\uB7C9",
  fillPrice: "\\uCCB4\\uACB0\\uAC00|\\uCCB4\\uACB0\\uB2E8\\uAC00",
  price: "\\uAC00\\uACA9|\\uB2E8\\uAC00",
  fee: "\\uC218\\uC218\\uB8CC",
  partialFill: "\\uBD84\\uD560\\s*\\uCCB4\\uACB0\\s*\\uB0B4\\uC5ED",
  orderQuantity: "\\uC8FC\\uBB38\\uC218\\uB7C9",
  fillQuantity: "\\uCCB4\\uACB0\\uC218\\uB7C9",
  orderPrice: "\\uC8FC\\uBB38\\uAC00\\uACA9",
};

function normalizeText(rawText: string) {
  return rawText.replace(/\s+/g, " ").trim();
}

function parseNumber(value: string) {
  return Number(value.replace(/,/g, ""));
}

function normalizeSoxlPrice(value: number) {
  if (value <= 1000) return value;

  const [integerPart, decimalPart] = value.toString().split(".");
  for (let index = 1; index < integerPart.length; index += 1) {
    const candidate = Number(
      `${integerPart.slice(index)}${decimalPart ? `.${decimalPart}` : ""}`,
    );
    if (Number.isFinite(candidate) && candidate > 0 && candidate <= 1000) {
      return candidate;
    }
  }

  return value;
}

function getDefaultYear(defaultDate: string) {
  return defaultDate.slice(0, 4) || new Date().getFullYear().toString();
}

function extractNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = parseNumber(match[1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  return null;
}

function extractDate(text: string, defaultDate: string) {
  const fullDateMatch = text.match(
    /(20\d{2})\s*(?:[-./\uB144])\s*(\d{1,2})\s*(?:[-./\uC6D4])\s*(\d{1,2})/,
  );

  if (fullDateMatch) {
    const [, year, month, day] = fullDateMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const shortDateMatch = text.match(/(?:^|\s)(\d{1,2})\s*[./]\s*(\d{1,2})(?:\s|$)/);
  if (shortDateMatch) {
    const [, month, day] = shortDateMatch;
    return `${getDefaultYear(defaultDate)}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return defaultDate;
}

function extractTradeType(text: string): TradeType | null {
  if (new RegExp(`(${KOREAN.sell}|sell|sold)`, "i").test(text)) return "SELL";
  if (new RegExp(`(${KOREAN.buy}|buy|bought|bot)`, "i").test(text)) return "BUY";
  return null;
}

function extractOrderType(text: string, defaultOrderType: OrderType): OrderType {
  if (/\bMOC\b/i.test(text)) return "MOC";
  if (/\bLOC\b/i.test(text)) return "LOC";
  if (new RegExp("\\bLIMIT\\b|\\uC9C0\\uC815\\uAC00", "i").test(text)) {
    return "LIMIT";
  }
  return defaultOrderType;
}

function calculateFee(price: number, quantity: number, feeRatePercent = 0) {
  return Number(((price * quantity * feeRatePercent) / 100).toFixed(2));
}

function createTrade(
  trade: Omit<TradeInput, "fee">,
  feeRatePercent: number | undefined,
  explicitFee?: number | null,
): TradeInput {
  return {
    ...trade,
    fee: explicitFee ?? calculateFee(trade.price, trade.quantity, feeRatePercent),
  };
}

function parseBrokerSummaryFill(
  text: string,
  options: OcrTradeParseOptions,
): OcrTradeParseResult | null {
  const tradeType = extractTradeType(text);
  const quantity = extractNumber(text, [
    new RegExp(`(?:${KOREAN.buy}|${KOREAN.sell})\\D*([\\d,]+)\\s*${KOREAN.share}`, "i"),
    new RegExp(`([\\d,]+)\\s*${KOREAN.share}`, "i"),
    /(?:qty|quantity|shares?)\D*([\d,]+)/i,
  ]);
  const rawPrice = extractNumber(text, [
    new RegExp(`${KOREAN.perShare}\\D*\\$?\\s*([\\d,]+(?:\\.\\d+)?)`, "i"),
    /\$\s*([\d,]+(?:\.\d+)?)/,
    /(?:price)\D*([\d,]+(?:\.\d+)?)/i,
  ]);
  const price = rawPrice ? normalizeSoxlPrice(rawPrice) : null;

  if (!tradeType || !quantity || !price) return null;

  const defaultDate = options.defaultDate ?? new Date().toISOString().slice(0, 10);
  const tradedAt = extractDate(text, defaultDate);
  const notes =
    rawPrice && rawPrice !== price
      ? [`Price normalized from ${rawPrice} to ${price}.`]
      : [];

  return {
    trade: createTrade(
      {
        type: tradeType,
        orderType: extractOrderType(text, options.defaultOrderType ?? "LOC"),
        price,
        quantity,
        reason: "Broker summary OCR",
        tradedAt,
        memo: text,
      },
      options.feeRatePercent,
    ),
    confidence: 1,
    notes,
  };
}

function parseBrokerPartialFill(
  text: string,
  options: OcrTradeParseOptions,
): OcrTradeParseResult | null {
  const isPartialFillScreen =
    new RegExp(KOREAN.partialFill).test(text) ||
    (new RegExp(KOREAN.orderQuantity).test(text) &&
      new RegExp(KOREAN.fillQuantity).test(text) &&
      new RegExp(KOREAN.fillPrice).test(text));

  if (!isPartialFillScreen) return null;

  const notes: string[] = [];
  const priceMatches = [...text.matchAll(/\b(\d{2,4}\.\d{2,4})\b/g)];
  const orderPrice = priceMatches[0]?.[1] ? parseNumber(priceMatches[0][1]) : null;
  const fillPrice = priceMatches.at(-1)?.[1]
    ? parseNumber(priceMatches.at(-1)?.[1] ?? "")
    : null;

  let quantity: number | null = null;
  if (priceMatches[0]?.index !== undefined) {
    const beforePrices = text.slice(0, priceMatches[0].index);
    const integerMatches = [
      ...beforePrices.matchAll(/\b(\d{1,3}(?:,\d{3})*|\d+)\b/g),
    ].map((match) => parseNumber(match[1]));
    quantity = integerMatches.at(-1) ?? null;
  }

  let tradeType = extractTradeType(text);
  if (!tradeType && orderPrice && fillPrice) {
    tradeType = orderPrice >= fillPrice ? "BUY" : "SELL";
    notes.push(
      `Side inferred as ${tradeType} from order price ${orderPrice} and fill price ${fillPrice}.`,
    );
  }

  if (!fillPrice) notes.push("Filled price was not found.");
  if (!quantity) notes.push("Filled quantity was not found.");

  if (!tradeType || !fillPrice || !quantity) {
    return {
      trade: null,
      confidence: 0.5,
      notes,
    };
  }

  const tradedAt = extractDate(
    text,
    options.defaultDate ?? new Date().toISOString().slice(0, 10),
  );

  return {
    trade: createTrade(
      {
        type: tradeType,
        orderType: extractOrderType(text, options.defaultOrderType ?? "LOC"),
        price: fillPrice,
        quantity,
        reason: "Broker partial fill OCR",
        tradedAt,
        memo: text,
      },
      options.feeRatePercent,
    ),
    confidence: notes.length > 0 ? 0.9 : 1,
    notes,
  };
}

export function parseOcrTradeText(
  rawText: string,
  options: OcrTradeParseOptions = {},
): OcrTradeParseResult {
  const text = normalizeText(rawText);
  const brokerSummaryFill = parseBrokerSummaryFill(text, options);
  if (brokerSummaryFill) return brokerSummaryFill;

  const brokerPartialFill = parseBrokerPartialFill(text, options);
  if (brokerPartialFill) return brokerPartialFill;

  const notes: string[] = [];
  const defaultDate = options.defaultDate ?? new Date().toISOString().slice(0, 10);
  const tradeType = extractTradeType(text);
  const orderType = extractOrderType(text, options.defaultOrderType ?? "LOC");
  const price = extractNumber(text, [
    new RegExp(`(?:${KOREAN.fillPrice}|${KOREAN.price}|price)\\D*([\\d,]+(?:\\.\\d+)?)`, "i"),
    /\$\s*([\d,]+(?:\.\d+)?)/,
  ]);
  const quantity = extractNumber(text, [
    new RegExp(`(?:${KOREAN.quantity}|qty|quantity|shares?)\\D*([\\d,]+)`, "i"),
    new RegExp(`([\\d,]+)\\s*(?:${KOREAN.share}|shares?)`, "i"),
  ]);
  const explicitFee = extractNumber(text, [
    new RegExp(`(?:${KOREAN.fee}|fee|commission)\\D*([\\d,]+(?:\\.\\d+)?)`, "i"),
  ]);
  const tradedAt = extractDate(text, defaultDate);

  if (!tradeType) notes.push("Buy/sell side was not found.");
  if (!price) notes.push("Filled price was not found.");
  if (!quantity) notes.push("Filled quantity was not found.");
  if (!explicitFee && options.feeRatePercent === undefined) {
    notes.push("Fee was not found, so it was set to 0.");
  }

  const matchedFields = [tradeType, price, quantity, tradedAt].filter(Boolean).length;
  const confidence = Number((matchedFields / 4).toFixed(2));

  if (!tradeType || !price || !quantity) {
    return {
      trade: null,
      confidence,
      notes,
    };
  }

  return {
    trade: createTrade(
      {
        type: tradeType,
        orderType,
        price,
        quantity,
        reason: "OCR parsed trade",
        tradedAt,
        memo: rawText,
      },
      options.feeRatePercent,
      explicitFee,
    ),
    confidence,
    notes,
  };
}
