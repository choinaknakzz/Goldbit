"use client";

import { type FormEvent, useState } from "react";
import { Check, ImageUp, Loader2, ScanText, X } from "lucide-react";
import { createWorker } from "tesseract.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import type { PendingTrade, TradeInput } from "@/lib/types";

export function OcrTradeReviewCard({
  pendingTrades,
  onAddPendingTrade,
  onConfirmPendingTrade,
  onRejectPendingTrade,
}: {
  pendingTrades: PendingTrade[];
  onAddPendingTrade: (rawText: string) => void;
  onConfirmPendingTrade: (pendingTradeId: string, trade?: TradeInput) => void;
  onRejectPendingTrade: (pendingTradeId: string) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [tradeEdits, setTradeEdits] = useState<Record<string, TradeInput>>({});
  const reviewTrades = pendingTrades.filter(
    (trade) => trade.status === "NEEDS_REVIEW",
  );

  const updateImageFile = (file: File | null) => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    setImageFile(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : "");
    setOcrStatus("");
  };

  const extractTextFromImage = async () => {
    if (!imageFile) return;

    setIsReadingImage(true);
    setOcrStatus("Preparing OCR...");

    try {
      const worker = await createWorker("kor+eng", 1, {
        logger: (event) => {
          if (event.status) {
            const progress =
              event.progress && event.progress > 0
                ? ` ${Math.round(event.progress * 100)}%`
                : "";
            setOcrStatus(`${event.status}${progress}`);
          }
        },
      });
      const result = await worker.recognize(imageFile);
      await worker.terminate();
      setRawText(result.data.text.trim());
      setOcrStatus("OCR complete. Review the text before creating preview.");
    } catch (error) {
      console.error(error);
      setOcrStatus("OCR failed. Paste OCR text manually or try a clearer crop.");
    } finally {
      setIsReadingImage(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedText = rawText.trim();
    if (!normalizedText) return;
    onAddPendingTrade(normalizedText);
    setRawText("");
  };

  const updateTradeEdit = (
    pendingTrade: PendingTrade,
    patch: Partial<TradeInput>,
  ) => {
    if (!pendingTrade.parsedTrade) return;
    setTradeEdits((currentEdits) => ({
      ...currentEdits,
      [pendingTrade.id]: {
        ...pendingTrade.parsedTrade,
        ...currentEdits[pendingTrade.id],
        ...patch,
      },
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>OCR Trade Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <Label>Screenshot</Label>
              <label
                className="mt-1 flex min-h-28 cursor-pointer flex-col justify-center rounded-lg border border-dashed border-amber-300/30 bg-white/[0.03] px-4 py-3 transition hover:border-amber-300/60 hover:bg-amber-300/5"
                htmlFor="ocr-screenshot-upload"
              >
                <input
                  accept="image/*"
                  className="sr-only"
                  id="ocr-screenshot-upload"
                  type="file"
                  onChange={(event) =>
                    updateImageFile(event.target.files?.[0] ?? null)
                  }
                />
                <span className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                  <ImageUp className="h-4 w-4" />
                  Choose screenshot
                </span>
                <span className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {imageFile
                    ? imageFile.name
                    : "Broker fill capture, PNG or JPG"}
                </span>
              </label>
            </div>
            {imagePreviewUrl ? (
              <div className="overflow-hidden rounded-md border border-border bg-black/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="OCR source preview"
                  className="h-28 w-full object-contain"
                  src={imagePreviewUrl}
                />
              </div>
            ) : (
              <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={!imageFile || isReadingImage}
              onClick={extractTextFromImage}
            >
              {isReadingImage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageUp className="h-4 w-4" />
              )}
              Extract Text
            </Button>
            {ocrStatus ? (
              <span className="text-xs text-muted-foreground">{ocrStatus}</span>
            ) : null}
          </div>
          <div>
            <Label>OCR Text</Label>
            <Textarea
              className="min-h-28"
              placeholder="Paste broker screenshot OCR text here."
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={rawText.trim().length === 0}>
            <ScanText className="h-4 w-4" />
            Create Preview
          </Button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Status</TH>
                <TH>Side</TH>
                <TH>Type</TH>
                <TH>Date</TH>
                <TH>Price</TH>
                <TH>Qty</TH>
                <TH>Fee</TH>
                <TH>Confidence</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {reviewTrades.length === 0 ? (
                <TR>
                  <TD colSpan={9} className="text-center text-muted-foreground">
                    No OCR previews waiting for confirmation.
                  </TD>
                </TR>
              ) : null}
              {reviewTrades.map((pendingTrade) => {
                const trade = pendingTrade.parsedTrade
                  ? tradeEdits[pendingTrade.id] ?? pendingTrade.parsedTrade
                  : null;
                const isInferred = pendingTrade.notes.some((note) =>
                  note.toLowerCase().includes("inferred"),
                );
                return (
                  <TR key={pendingTrade.id}>
                    <TD>
                      <Badge variant={trade ? "gold" : "muted"}>
                        {trade ? (isInferred ? "INFERRED" : "READY") : "CHECK"}
                      </Badge>
                    </TD>
                    <TD>
                      {trade ? (
                        <Select
                          className="h-8 min-w-20"
                          value={trade.type}
                          onChange={(event) =>
                            updateTradeEdit(pendingTrade, {
                              type: event.target.value as TradeInput["type"],
                            })
                          }
                        >
                          <option value="BUY">BUY</option>
                          <option value="SELL">SELL</option>
                        </Select>
                      ) : (
                        "-"
                      )}
                    </TD>
                    <TD>
                      {trade ? (
                        <Select
                          className="h-8 min-w-20"
                          value={trade.orderType}
                          onChange={(event) =>
                            updateTradeEdit(pendingTrade, {
                              orderType: event.target
                                .value as TradeInput["orderType"],
                            })
                          }
                        >
                          <option value="LOC">LOC</option>
                          <option value="MOC">MOC</option>
                          <option value="LIMIT">LIMIT</option>
                        </Select>
                      ) : (
                        "-"
                      )}
                    </TD>
                    <TD>
                      {trade ? (
                        <Input
                          className="h-8 min-w-32"
                          type="date"
                          value={trade.tradedAt}
                          onChange={(event) =>
                            updateTradeEdit(pendingTrade, {
                              tradedAt: event.target.value,
                            })
                          }
                        />
                      ) : (
                        "-"
                      )}
                    </TD>
                    <TD>
                      {trade ? (
                        <Input
                          className="h-8 min-w-28"
                          step="0.0001"
                          type="number"
                          value={trade.price}
                          onChange={(event) =>
                            updateTradeEdit(pendingTrade, {
                              price: Number(event.target.value),
                            })
                          }
                        />
                      ) : (
                        "-"
                      )}
                    </TD>
                    <TD>
                      {trade ? (
                        <Input
                          className="h-8 min-w-20"
                          step="1"
                          type="number"
                          value={trade.quantity}
                          onChange={(event) =>
                            updateTradeEdit(pendingTrade, {
                              quantity: Number(event.target.value),
                            })
                          }
                        />
                      ) : (
                        "-"
                      )}
                    </TD>
                    <TD>
                      {trade ? (
                        <Input
                          className="h-8 min-w-24"
                          step="0.01"
                          type="number"
                          value={trade.fee}
                          onChange={(event) =>
                            updateTradeEdit(pendingTrade, {
                              fee: Number(event.target.value),
                            })
                          }
                        />
                      ) : (
                        "-"
                      )}
                    </TD>
                    <TD>{formatNumber(pendingTrade.confidence * 100, 0)}%</TD>
                    <TD>
                      <div className="flex min-w-32 gap-2">
                        <Button
                          className="h-8 px-3"
                          disabled={!trade}
                          onClick={() =>
                            onConfirmPendingTrade(pendingTrade.id, trade ?? undefined)
                          }
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          className="h-8 border-red-300/30 bg-red-300 text-zinc-950 hover:bg-red-200"
                          onClick={() => onRejectPendingTrade(pendingTrade.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>

        {reviewTrades.some((trade) => trade.notes.length > 0) ? (
          <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-muted-foreground">
            {reviewTrades.map((trade) =>
              trade.notes.length > 0 ? (
                <p key={trade.id}>{trade.notes.join(" ")}</p>
              ) : null,
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
