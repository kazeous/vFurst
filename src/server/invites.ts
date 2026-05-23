import "server-only";
import { randomBytes } from "node:crypto";

export function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function createInviteExpiration() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  return expiresAt;
}
