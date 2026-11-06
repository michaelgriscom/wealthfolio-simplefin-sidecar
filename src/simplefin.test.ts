import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { claimToken, fetchAccounts, isAccessUrl, parseAccessUrl } from "./simplefin";

interface Call {
  url: string;
  init?: RequestInit;
}

/** Replace global fetch for one test; returns the recorded calls. */
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

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const token = (url: string) => Buffer.from(url).toString("base64");

describe("parseAccessUrl", () => {
  test("moves the credentials into a Basic auth header and keeps the path", () => {
    assert.deepEqual(parseAccessUrl("https://user:secret@bridge.simplefin.org/simplefin"), {
      baseUrl: "https://bridge.simplefin.org/simplefin",
      authHeader: basic("user", "secret"),
    });
  });

  test("percent-encoded credentials are decoded", () => {
    const { authHeader } = parseAccessUrl("https://us%40er:p%3As%2Fs@bridge.simplefin.org/simplefin");
    assert.equal(authHeader, basic("us@er", "p:s/s"));
  });

  test("surrounding whitespace and a trailing slash are dropped", () => {
    const { baseUrl } = parseAccessUrl("  https://u:p@bridge.simplefin.org/simplefin/ \n");
    assert.equal(baseUrl, "https://bridge.simplefin.org/simplefin");
  });

  test("a non-URL is rejected", () => {
    assert.throws(() => parseAccessUrl("not a url"));
  });
});

describe("isAccessUrl", () => {
  test("accepts http(s) URLs regardless of case and leading whitespace", () => {
    assert.equal(isAccessUrl("https://u:p@host/simplefin"), true);
    assert.equal(isAccessUrl("  HTTP://host"), true);
  });

  test("rejects setup tokens (base64) and other schemes", () => {
    assert.equal(isAccessUrl(token("https://bridge.simplefin.org/simplefin/claim/abc")), false);
    assert.equal(isAccessUrl("ftp://host"), false);
  });
});

describe("claimToken", () => {
  const claimUrl = "https://bridge.simplefin.org/simplefin/claim/abc123";

  test("POSTs to the decoded claim URL and returns the trimmed access URL", async () => {
    const calls = mockFetch(() => new Response("https://u:p@bridge.simplefin.org/simplefin\n"));
    const accessUrl = await claimToken(`  ${token(claimUrl)}\n`);
    assert.equal(accessUrl, "https://u:p@bridge.simplefin.org/simplefin");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, claimUrl);
    assert.equal(calls[0].init?.method, "POST");
  });

  test("a token that isn't base64 fails without a network call", async () => {
    const calls = mockFetch(() => new Response(""));
    await assert.rejects(claimToken("not*base64!"), /not base64/);
    assert.equal(calls.length, 0);
  });

  test("a token that doesn't decode to a URL fails without a network call", async () => {
    const calls = mockFetch(() => new Response(""));
    await assert.rejects(claimToken(token("hello world")), /not a claim URL/);
    assert.equal(calls.length, 0);
  });

  test("an HTTP error says the token may be used and includes the body", async () => {
    mockFetch(() => new Response("Forbidden: already claimed", { status: 403 }));
    await assert.rejects(
      claimToken(token(claimUrl)),
      /HTTP 403\).*already have been used.*Forbidden: already claimed/,
    );
  });

  test("a 200 response that isn't an access URL is rejected", async () => {
    mockFetch(() => new Response("<html>oops</html>"));
    await assert.rejects(claimToken(token(claimUrl)), /did not return an access URL/);
  });
});

describe("fetchAccounts", () => {
  const accessUrl = "https://user:secret@bridge.simplefin.org/simplefin";

  test("GETs /accounts with Basic auth and start-date pinned to now", async () => {
    const payload = { errors: [], accounts: [{ id: "a1", name: "Brokerage", balance: "1" }] };
    const calls = mockFetch(() => Response.json(payload));

    const before = Math.floor(Date.now() / 1000);
    const res = await fetchAccounts(accessUrl);
    const after = Math.floor(Date.now() / 1000);

    assert.deepEqual(res, payload);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname, "https://bridge.simplefin.org/simplefin/accounts");
    assert.equal(url.username, "", "credentials must not be sent in the URL");
    const startDate = Number(url.searchParams.get("start-date"));
    assert.ok(startDate >= before && startDate <= after, `start-date ${startDate} not ~now`);
    assert.deepEqual(calls[0].init?.headers, { Authorization: basic("user", "secret") });
  });

  test("an HTTP error includes the status and body", async () => {
    mockFetch(() => new Response("Payment required", { status: 402 }));
    await assert.rejects(fetchAccounts(accessUrl), /SimpleFIN request failed \(HTTP 402\)\. Payment required/);
  });
});
