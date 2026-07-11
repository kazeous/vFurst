import { prisma } from "@vfurst/db";
import { createHmac } from "node:crypto";
import { workerEnv } from "../env.js";

type SePayApiTransaction = {
  id: string;
  account_number: string;
  code: string | null;
  transfer_type: "in" | "out";
  amount_in: number;
  amount_out: number;
  transaction_content: string;
  bank_brand_name: string;
  reference_number: string;
};

type SePayApiResponse = {
  status: string;
  data: SePayApiTransaction[];
  meta?: {
    pagination?: {
      has_more?: boolean;
    };
  };
};

async function replayTransaction(transaction: SePayApiTransaction) {
  if (!workerEnv.NEXT_PUBLIC_APP_URL || !workerEnv.SEPAY_WEBHOOK_SECRET) {
    throw new Error("NEXT_PUBLIC_APP_URL and SEPAY_WEBHOOK_SECRET are required for SePay reconciliation.");
  }

  const payload = JSON.stringify({
    id: transaction.id,
    gateway: transaction.bank_brand_name,
    accountNumber: transaction.account_number,
    code: transaction.code,
    content: transaction.transaction_content,
    transferType: transaction.transfer_type,
    transferAmount: transaction.transfer_type === "in" ? transaction.amount_in : transaction.amount_out,
    referenceCode: transaction.reference_number
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac("sha256", workerEnv.SEPAY_WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex")}`;
  const response = await fetch(new URL("/api/webhooks/sepay", workerEnv.NEXT_PUBLIC_APP_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sepay-signature": signature,
      "x-sepay-timestamp": timestamp
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`SePay reconciliation replay failed with HTTP ${response.status}.`);
  }
}

export async function processReconcileSePay() {
  if (!workerEnv.SEPAY_API_TOKEN || !workerEnv.SEPAY_WEBHOOK_SECRET || !workerEnv.NEXT_PUBLIC_APP_URL) {
    return { skipped: true, reason: "SePay reconciliation environment is incomplete." };
  }

  const cursor = await prisma.sePayReconciliationCursor.findUnique({ where: { id: "sepay" } });
  let page = 1;
  let processed = 0;
  let lastCursor = cursor?.cursor ?? null;

  while (page <= 10) {
    const apiBase = workerEnv.SEPAY_ENV === "sandbox" ? "https://userapi-sandbox.sepay.vn/v2" : "https://userapi.sepay.vn/v2";
    const url = new URL(`${apiBase}/transactions`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "100");
    url.searchParams.set("transaction_date_sort", "asc");
    if (cursor?.cursor) {
      url.searchParams.set("since_id", cursor.cursor);
    }

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${workerEnv.SEPAY_API_TOKEN}`,
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`SePay API v2 reconciliation failed with HTTP ${response.status}.`);
    }

    const body = (await response.json()) as SePayApiResponse;

    for (const transaction of body.data ?? []) {
      await replayTransaction(transaction);
      lastCursor = transaction.id;
      processed += 1;
    }

    if (!body.meta?.pagination?.has_more) {
      break;
    }
    page += 1;
  }

  if (lastCursor) {
    await prisma.sePayReconciliationCursor.upsert({
      where: { id: "sepay" },
      update: { cursor: lastCursor },
      create: { id: "sepay", cursor: lastCursor }
    });
  }

  return { skipped: false, processed, cursor: lastCursor };
}
