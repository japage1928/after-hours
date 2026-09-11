import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminEmails, isAdminEmail } from "./admin.ts";

describe("admin allowlist", () => {
  it("defaults to japage628@gmail.com", () => {
    assert.deepEqual(adminEmails({}), ["japage628@gmail.com"]);
    assert.equal(isAdminEmail("japage628@gmail.com", {}), true);
    assert.equal(isAdminEmail("Japage628@Gmail.com", {}), true);
    assert.equal(isAdminEmail("other@example.com", {}), false);
    assert.equal(isAdminEmail(null, {}), false);
  });

  it("honors ADMIN_EMAILS override", () => {
    const env = { ADMIN_EMAILS: " a@x.com , B@Y.com " };
    assert.deepEqual(adminEmails(env), ["a@x.com", "b@y.com"]);
    assert.equal(isAdminEmail("b@y.com", env), true);
    assert.equal(isAdminEmail("japage628@gmail.com", env), false);
  });
});
