import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, safeNextPath, verifySessionToken } from "../auth.ts";

const SECRET = "x".repeat(40);

test("valid token verifies and carries the username", async () => {
  const token = await createSessionToken("admin", SECRET);
  const payload = await verifySessionToken(token, SECRET);
  assert.equal(payload?.u, "admin");
});

test("tampered, wrong-secret, expired and empty tokens are rejected", async () => {
  const token = await createSessionToken("admin", SECRET);
  const [body, sig] = token.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ u: "admin", exp: 9999999999 })).toString("base64url");
  assert.equal(await verifySessionToken(`${forgedBody}.${sig}`, SECRET), null);
  assert.equal(await verifySessionToken(`${body}.${sig}x`, SECRET), null);
  assert.equal(await verifySessionToken(token, "y".repeat(40)), null);
  const old = await createSessionToken("admin", SECRET, Date.now() - 8 * 86400_000);
  assert.equal(await verifySessionToken(old, SECRET), null);
  assert.equal(await verifySessionToken(undefined, SECRET), null);
  assert.equal(await verifySessionToken(token, ""), null);
});

test("safeNextPath only allows internal page paths", () => {
  assert.equal(safeNextPath("/l5fcuvo2zq?x=1"), "/l5fcuvo2zq?x=1");
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath("/\\evil.com"), "/");
  assert.equal(safeNextPath("/login"), "/");
  assert.equal(safeNextPath("/api/evaluate"), "/");
  assert.equal(safeNextPath(null), "/");
});
