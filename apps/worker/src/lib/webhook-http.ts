import { request } from "node:https";
import type { resolveWebhookTarget } from "./webhook-target.js";

type ResolvedWebhookTarget = Awaited<ReturnType<typeof resolveWebhookTarget>>;

const WEBHOOK_TIMEOUT_MS = 10_000;

export function postWebhook(
  target: ResolvedWebhookTarget,
  headers: Record<string, string>,
  body: string,
  requestImpl: typeof request = request
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const requestHandle = requestImpl(
      {
        protocol: "https:",
        hostname: target.address,
        port: target.url.port || 443,
        path: `${target.url.pathname}${target.url.search}`,
        method: "POST",
        servername: target.hostname,
        rejectUnauthorized: true,
        headers: {
          ...headers,
          host: target.url.host,
          "content-length": String(Buffer.byteLength(body))
        }
      },
      (response) => {
        const status = response.statusCode ?? 0;
        response.resume();
        resolve({
          ok: status >= 200 && status < 300,
          status
        });
      }
    );

    requestHandle.setTimeout(WEBHOOK_TIMEOUT_MS, () => {
      requestHandle.destroy(new Error("Webhook delivery timed out."));
    });
    requestHandle.once("error", reject);
    requestHandle.end(body);
  });
}
