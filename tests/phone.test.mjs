import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMobilePhone } from "../src/phone.js";

test("phone numbers survive the sign-up, OAuth, and profile validation steps", () => {
  for (const [input, expected] of [
    ["(708) 555-0123", "7085550123"],
    ["708.555.0123", "7085550123"],
    ["+1 (708) 555-0123", "7085550123"],
    ["17085550123", "7085550123"],
    [" +44 20 7946 0123 ", "+442079460123"],
    ["+61 412 345 678", "+61412345678"]
  ]) {
    assert.equal(normalizeMobilePhone(input), expected);
    assert.equal(normalizeMobilePhone(normalizeMobilePhone(input)), expected);
  }
});

test("missing, malformed, and incomplete phone numbers are rejected", () => {
  for (const input of [undefined, null, 7085550123, {}, "", "   ", "123", "call 7085550123", "7085550123 ext 12", "++17085550123", "708+5550123", "0000000000", "+10000000000", "+442079460123456789", "+0123456789"]) {
    assert.equal(normalizeMobilePhone(input), "", JSON.stringify(input));
  }
});
