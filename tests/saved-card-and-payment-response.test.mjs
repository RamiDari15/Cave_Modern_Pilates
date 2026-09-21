import assert from "node:assert/strict";
import test from "node:test";

import { membershipPaymentFailure, normalizeSavedCardsFromClient } from "../server/api.mjs";

test("saved cards come from masked Mindbody client profile data", () => {
  const cards = normalizeSavedCardsFromClient({
    ClientCompleteInfo: {
      Client: {
        ClientCreditCard: {
          CardNumber: "************4242",
          CardType: "Visa",
          ExpMonth: "12",
          ExpYear: "2099",
          CardHolder: "Private Name"
        }
      }
    }
  });

  assert.deepEqual(cards, [{ lastFour: "4242", cardType: "Visa", expMonth: "12", expYear: "2099" }]);
  assert.doesNotMatch(JSON.stringify(cards), /Private Name|\*{4}/);
});

test("duplicate and malformed card records are not offered at checkout", () => {
  const cards = normalizeSavedCardsFromClient({
    CreditCards: [{ LastFour: "4242" }, { LastFour: "4242" }, { LastFour: "42" }]
  });
  assert.deepEqual(cards, [{ lastFour: "4242", cardType: "", expMonth: "", expYear: "" }]);
});

test("Mindbody payment challenges and declines cannot be reported as successful memberships", () => {
  assert.deepEqual(membershipPaymentFailure({ PaymentProcessingFailures: [{
    Message: "Verification required",
    AuthenticationRedirectUrl: "https://bank.example.test/verify"
  }] }), {
    authenticationUrl: "https://bank.example.test/verify",
    message: "Verification required"
  });
  assert.deepEqual(membershipPaymentFailure({ PaymentProcessingFailures: [{ Message: "Card declined" }] }), {
    authenticationUrl: "",
    message: "Card declined"
  });
  assert.equal(membershipPaymentFailure({ ContractId: 1 }), null);
});
