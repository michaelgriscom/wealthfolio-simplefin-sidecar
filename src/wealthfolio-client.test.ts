import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { WealthfolioClient } from "./wealthfolio-client";

interface Call {
  url: string;
  init?: RequestInit;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response): Call[] {
  const calls: Call[] = [];
  mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  return calls;
}

afterEach(() => mock.restoreAll());

const BASE = "http://wealthfolio:8088";
const holdings = [{ symbol: "VTI", quantity: "4", currency: "USD", exchangeMic: "XNAS" }];

function headersOf(call: Call): Record<string, string> {
  return call.init?.headers as Record<string, string>;
}

test("login without a password makes no request and snapshots carry no cookie", async () => {
  const calls = mockFetch(() => new Response(null, { status: 200 }));
  const wf = new WealthfolioClient(BASE);
  await wf.login(undefined);
  assert.equal(calls.length, 0);

  await wf.saveSnapshot("wf-1", holdings, { USD: "10" }, "2026-01-15");
  assert.equal(calls.length, 1);
  assert.equal(headersOf(calls[0]).Cookie, undefined);
});

test("login posts the password and the session cookie is sent with snapshots", async () => {
  const calls = mockFetch((url) =>
    url.endsWith("/auth/login")
      ? new Response(null, { headers: { "set-cookie": "wf_session=abc123; Path=/; HttpOnly" } })
      : new Response(null, { status: 200 }),
  );
  const wf = new WealthfolioClient(BASE);
  await wf.login("hunter2");

  assert.equal(calls[0].url, `${BASE}/api/v1/auth/login`);
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { password: "hunter2" });

  await wf.saveSnapshot("wf-1", holdings, {}, "2026-01-15");
  assert.equal(headersOf(calls[1]).Cookie, "wf_session=abc123");
});

test("a rejected login throws with the status", async () => {
  mockFetch(() => new Response("bad password", { status: 401 }));
  await assert.rejects(new WealthfolioClient(BASE).login("wrong"), /login failed \(HTTP 401\)/);
});

test("a login with no cookie throws", async () => {
  mockFetch(() => new Response(null, { status: 200 }));
  await assert.rejects(new WealthfolioClient(BASE).login("pw"), /no session cookie/);
});

test("saveSnapshot posts the snapshot payload as JSON", async () => {
  const calls = mockFetch(() => new Response(null, { status: 200 }));
  const wf = new WealthfolioClient(BASE);
  await wf.saveSnapshot("wf-1", holdings, { USD: "12.5" }, "2026-01-15");

  assert.equal(calls[0].url, `${BASE}/api/v1/snapshots`);
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(headersOf(calls[0])["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    accountId: "wf-1",
    holdings,
    cashBalances: { USD: "12.5" },
    snapshotDate: "2026-01-15",
  });
});

test("an auth failure without a password hints at WF_PASSWORD", async () => {
  mockFetch(() => new Response("unauthorized", { status: 401 }));
  const wf = new WealthfolioClient(BASE);
  await wf.login(undefined);
  await assert.rejects(
    wf.saveSnapshot("wf-1", holdings, {}, "2026-01-15"),
    /saveSnapshot failed for wf-1 \(HTTP 401\)\. Set WF_PASSWORD.* unauthorized/,
  );
});

test("an auth failure with a session omits the WF_PASSWORD hint", async () => {
  mockFetch((url) =>
    url.endsWith("/auth/login")
      ? new Response(null, { headers: { "set-cookie": "s=1" } })
      : new Response("expired", { status: 403 }),
  );
  const wf = new WealthfolioClient(BASE);
  await wf.login("pw");
  await assert.rejects(wf.saveSnapshot("wf-1", holdings, {}, "2026-01-15"), (e: Error) => {
    assert.match(e.message, /HTTP 403/);
    assert.doesNotMatch(e.message, /WF_PASSWORD/);
    return true;
  });
});

test("other errors include the status and response body", async () => {
  mockFetch(() => new Response("account is not in HOLDINGS mode", { status: 422 }));
  await assert.rejects(
    new WealthfolioClient(BASE).saveSnapshot("wf-9", holdings, {}, "2026-01-15"),
    /^Error: saveSnapshot failed for wf-9 \(HTTP 422\)\. account is not in HOLDINGS mode$/,
  );
});
