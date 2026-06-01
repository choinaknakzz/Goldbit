import { describe, expect, it } from "vitest";
import { parseOcrTradeText } from "./ocr-trade-parser";

describe("parseOcrTradeText", () => {
  it("parses a Korean buy fill text", () => {
    const result = parseOcrTradeText(
      "SOXL 매수 체결 수량 12주 체결가 224.63 수수료 0.41 2026.05.28",
    );

    expect(result.trade).toMatchObject({
      type: "BUY",
      orderType: "LOC",
      price: 224.63,
      quantity: 12,
      fee: 0.41,
      tradedAt: "2026-05-28",
    });
    expect(result.confidence).toBe(1);
  });

  it("parses the broker partial fill screenshot format", () => {
    const result = parseOcrTradeText(
      [
        "분할 체결 내역",
        "SOXL",
        "주문번호 체결순번 주문수량 체결수량 주문가격 체결가격 주문시간 체결시간",
        "3,306,757 1 1 1 251.5900 224.3400 17:32:15 05:00:01",
      ].join(" "),
      { defaultDate: "2026-05-29", feeRatePercent: 0.15 },
    );

    expect(result.trade).toMatchObject({
      type: "BUY",
      orderType: "LOC",
      price: 224.34,
      quantity: 1,
      fee: 0.34,
      reason: "Broker partial fill OCR",
      tradedAt: "2026-05-29",
    });
    expect(result.confidence).toBe(0.9);
  });

  it("parses an English sell fill text and calculates fee from settings", () => {
    const result = parseOcrTradeText(
      "SOXL SELL LIMIT price $230.50 quantity 3 shares 2026-05-29",
      { feeRatePercent: 0.15 },
    );

    expect(result.trade).toMatchObject({
      type: "SELL",
      orderType: "LIMIT",
      price: 230.5,
      quantity: 3,
      fee: 1.04,
      tradedAt: "2026-05-29",
    });
  });

  it("returns notes when required fields are missing", () => {
    const result = parseOcrTradeText("SOXL 체결 완료", {
      defaultDate: "2026-05-29",
    });

    expect(result.trade).toBeNull();
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
