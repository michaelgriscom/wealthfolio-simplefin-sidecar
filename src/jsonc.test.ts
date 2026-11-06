import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonc } from "./jsonc";

test("plain JSON parses unchanged", () => {
  assert.deepEqual(parseJsonc('{"a": [1, 2, {"b": null}], "c": "x"}'), {
    a: [1, 2, { b: null }],
    c: "x",
  });
});

test("line and block comments are stripped", () => {
  const text = `{
    // the access URL
    "a": 1, /* inline */ "b": 2
    /* multi
       line */
  }`;
  assert.deepEqual(parseJsonc(text), { a: 1, b: 2 });
});

test("comment markers inside strings are kept (access URLs contain //)", () => {
  const text = `{
    "simplefinAccessUrl": "https://user:pass@bridge.simplefin.org/simplefin", // real comment
    "note": "/* not a comment */"
  }`;
  assert.deepEqual(parseJsonc(text), {
    simplefinAccessUrl: "https://user:pass@bridge.simplefin.org/simplefin",
    note: "/* not a comment */",
  });
});

test("escaped quotes don't end a string early", () => {
  assert.deepEqual(parseJsonc(String.raw`{"a": "say \"// hi\", ok", "b": "\\"}`), {
    a: 'say "// hi", ok',
    b: "\\",
  });
});

test("trailing commas in objects and arrays are dropped", () => {
  assert.deepEqual(parseJsonc('{"a": [1, 2,], "b": {"c": 3,},}'), { a: [1, 2], b: { c: 3 } });
});

test("commenting out the last mapping entry leaves a parseable file", () => {
  const text = `{
    "mapping": {
      "wf-1": ["sf-1", "sf-2"],
      // "wf-2": ["sf-3"],
    },
  }`;
  assert.deepEqual(parseJsonc(text), { mapping: { "wf-1": ["sf-1", "sf-2"] } });
});

test("commas inside strings that look trailing are kept", () => {
  assert.deepEqual(parseJsonc('{"a": "x, }", "b": ", ]"}'), { a: "x, }", b: ", ]" });
});

test("line numbers survive comment stripping so parse errors point at the right line", () => {
  const text = '{\n  // comment\n  /* block\n  */\n  "a": oops\n}';
  assert.throws(() => parseJsonc(text), (e: Error) => {
    assert.ok(e instanceof SyntaxError);
    // Node reports "line 5" for the bad token; tolerate engines that report only a position.
    if (/line \d+/.test(e.message)) assert.match(e.message, /line 5/);
    return true;
  });
});

test("genuinely invalid JSON still throws", () => {
  assert.throws(() => parseJsonc('{"a": }'), SyntaxError);
  assert.throws(() => parseJsonc('{"a": 1 /* unterminated'), SyntaxError);
});
