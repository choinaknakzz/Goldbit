import { describe, expect, it } from "vitest";
import { parseOcrTradeText } from "./ocr-trade-parser";

describe("parseOcrTradeText", () => {
  it("parses a Korean buy fill text", () => {
    const result = parseOcrTradeText(
      "SOXL \uB9E4\uC218 \uCCB4\uACB0 \uC218\uB7C9 12\uC8FC \uCCB4\uACB0\uAC00 224.63 \uC218\uC218\uB8CC 0.41 2026.05.28",
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

  it("parses the compact broker summary screenshot format", () => {
    const result = parseOcrTradeText("6.1 \uAD6C\uB9E4 1\uC8FC \uC8FC\uB2F9 $227.03", {
      defaultDate: "2026-06-02",
      feeRatePercent: 0.15,
    });

    expect(result.trade).toMatchObject({
      type: "BUY",
      orderType: "LOC",
      price: 227.03,
      quantity: 1,
      fee: 0.34,
      reason: "Broker summary OCR",
      tradedAt: "2026-06-01",
    });
    expect(result.confidence).toBe(1);
  });

  it("normalizes compact broker summary prices with a leading OCR artifact", () => {
    const result = parseOcrTradeText("6.1 \uAD6C\uB9E4 1\uC8FC \uC8FC\uB2F9 $8227.03", {
      defaultDate: "2026-06-02",
      feeRatePercent: 0.1,
    });

    expect(result.trade).toMatchObject({
      type: "BUY",
      price: 227.03,
      quantity: 1,
      fee: 0.23,
      tradedAt: "2026-06-01",
    });
    expect(result.notes[0]).toContain("normalized");
  });

  it("parses the broker partial fill screenshot format", () => {
    const result = parseOcrTradeText(
      [
        "\uBD84\uD560 \uCCB4\uACB0 \uB0B4\uC5ED",
        "SOXL",
        "\uC8FC\uBB38\uBC88\uD638 \uCCB4\uACB0\uC21C\uBC88 \uC8FC\uBB38\uC218\uB7C9 \uCCB4\uACB0\uC218\uB7C9 \uC8FC\uBB38\uAC00\uACA9 \uCCB4\uACB0\uAC00\uACA9 \uC8FC\uBB38\uC2DC\uAC04 \uCCB4\uACB0\uC2DC\uAC04",
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
    const result = parseOcrTradeText("SOXL \uCCB4\uACB0 \uC644\uB8CC", {
      defaultDate: "2026-05-29",
    });

    expect(result.trade).toBeNull();
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
