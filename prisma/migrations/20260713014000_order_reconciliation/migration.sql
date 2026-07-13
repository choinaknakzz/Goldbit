PRAGMA foreign_keys=OFF;

CREATE TABLE "new_OrderExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "clientOrderId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "brokerOrderId" TEXT,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" DATETIME
);

INSERT INTO "new_OrderExecution" (
    "id", "candidateId", "symbol", "side", "orderType", "quantity", "status",
    "brokerOrderId", "requestPayload", "responsePayload", "errorMessage", "createdAt", "updatedAt"
)
SELECT
    "id", "candidateId", "symbol", "side", "orderType", "quantity", "status",
    "brokerOrderId", "requestPayload", "responsePayload", "errorMessage", "createdAt", "createdAt"
FROM "OrderExecution";

DROP TABLE "OrderExecution";
ALTER TABLE "new_OrderExecution" RENAME TO "OrderExecution";

CREATE INDEX "OrderExecution_status_idx" ON "OrderExecution"("status");
CREATE INDEX "OrderExecution_brokerOrderId_idx" ON "OrderExecution"("brokerOrderId");
CREATE INDEX "OrderExecution_clientOrderId_idx" ON "OrderExecution"("clientOrderId");

PRAGMA foreign_keys=ON;
