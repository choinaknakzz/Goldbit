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

function normalizeText(rawText: string) {
  return rawText.replace(/\s+/g, " ").trim();
}

function parseNumber(value: string) {
  return Number(value.replace(/,/g, ""));
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
  const match = text.match(
    /(20\d{2})\s*(?:[-./년])\s*(\d{1,2})\s*(?:[-./월])\s*(\d{1,2})/,
  );

  if (!match) return defaultDate;

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractTradeType(text: string): TradeType | null {
  if (/(매도|sell|sold)/i.test(text)) return "SELL";
  if (/(매수|buy|bought|bot)/i.test(text)) return "BUY";
  return null;
}

function extractOrderType(text: string, defaultOrderType: OrderType): OrderType {
  if (/\bMOC\b/i.test(text)) return "MOC";
  if (/\bLOC\b/i.test(text)) return "LOC";
  if (/\bLIMIT\b|지정가/i.test(text)) return "LIMIT";
  return defaultOrderType;
}

function calculateFee(price: number, quantity: number, feeRatePercent = 0) {
  return Number(((price * quantity * feeRatePercent) / 100).toFixed(2));
}

function parseBrokerPartialFill(
  text: string,
  options: OcrTradeParseOptions,
): OcrTradeParseResult | null {
  const isPartialFillScreen =
    /분할\s*체결\s*내역/.test(text) ||
    (/주문수량/.test(text) && /체결수량/.test(text) && /체결가격/.test(text));

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
  const fee = calculateFee(fillPrice, quantity, options.feeRatePercent);

  return {
    trade: {
      type: tradeType,
      orderType: extractOrderType(text, options.defaultOrderType ?? "LOC"),
      price: fillPrice,
      quantity,
      fee,
      reason: "Broker partial fill OCR",
      tradedAt,
      memo: text,
    },
    confidence: notes.length > 0 ? 0.9 : 1,
    notes,
  };
}

export function parseOcrTradeText(
  rawText: string,
  options: OcrTradeParseOptions = {},
): OcrTradeParseResult {
  const text = normalizeText(rawText);
  const brokerPartialFill = parseBrokerPartialFill(text, options);
  if (brokerPartialFill) return brokerPartialFill;

  const notes: string[] = [];
  const defaultDate = options.defaultDate ?? new Date().toISOString().slice(0, 10);
  const tradeType = extractTradeType(text);
  const orderType = extractOrderType(text, options.defaultOrderType ?? "LOC");
  const price = extractNumber(text, [
    /(?:체결가|체결단가|단가|가격|price)\D*([\d,]+(?:\.\d+)?)/i,
    /\$\s*([\d,]+(?:\.\d+)?)/,
  ]);
  const quantity = extractNumber(text, [
    /(?:수량|qty|quantity|shares?)\D*([\d,]+)/i,
    /([\d,]+)\s*(?:주|shares?)/i,
  ]);
  const explicitFee = extractNumber(text, [
    /(?:수수료|fee|commission)\D*([\d,]+(?:\.\d+)?)/i,
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

  const fee = explicitFee ?? calculateFee(price, quantity, options.feeRatePercent);

  return {
    trade: {
      type: tradeType,
      orderType,
      price,
      quantity,
      fee,
      reason: "OCR parsed trade",
      tradedAt,
      memo: rawText,
    },
    confidence,
    notes,
  };
}
