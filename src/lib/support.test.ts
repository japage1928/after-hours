import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_NOTE_MAX,
  CreateSupportTicketSchema,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_IDS,
  nextSupportStatus,
  parseAdminUpdateTicket,
  parseCreateSupportTicket,
  supportCategoryLabel,
} from "./support.ts";
import { safeNextPath } from "./booth-mode.ts";

describe("support categories", () => {
  it("covers login, billing, remix, mashup, and other", () => {
    assert.deepEqual([...SUPPORT_CATEGORY_IDS], [
      "login",
      "billing",
      "remix",
      "mashup",
      "other",
    ]);
    assert.equal(SUPPORT_CATEGORIES.remix.label, "Remix failed");
    assert.match(SUPPORT_CATEGORIES.remix.hint, /AI DJ/);
    assert.equal(SUPPORT_CATEGORIES.mashup.label, "Mashup failed");
    assert.match(SUPPORT_CATEGORIES.mashup.hint, /Beats × lyrics/);
    assert.equal(supportCategoryLabel("billing"), "Billing");
    assert.equal(supportCategoryLabel("unknown"), "unknown");
  });
});

describe("create ticket validation", () => {
  it("accepts a short category + message", () => {
    const parsed = parseCreateSupportTicket({
      category: "remix",
      message: "  The AI DJ remix stalled after the drop.  ",
    });
    assert.equal(parsed.category, "remix");
    assert.equal(parsed.message, "The AI DJ remix stalled after the drop.");
  });

  it("ignores client-supplied email and user id", () => {
    const parsed = parseCreateSupportTicket({
      category: "other",
      message: "Something went wrong in the booth.",
      email: "attacker@example.com",
      userId: "someone-else",
    });
    assert.equal(parsed.category, "other");
    assert.equal("email" in parsed, false);
    assert.equal("userId" in parsed, false);
  });

  it("rejects unknown categories and empty messages", () => {
    assert.throws(() =>
      parseCreateSupportTicket({
        category: "intercom",
        message: "Hello there support team",
      }),
    );
    assert.throws(() =>
      parseCreateSupportTicket({ category: "other", message: "too short" }),
    );
    const result = CreateSupportTicketSchema.safeParse({
      category: "login",
      message: "x".repeat(MESSAGE_MIN - 1),
    });
    assert.equal(result.success, false);
  });

  it("rejects oversized messages", () => {
    assert.throws(() =>
      parseCreateSupportTicket({
        category: "other",
        message: "x".repeat(MESSAGE_MAX + 1),
      }),
    );
  });
});

describe("status transitions", () => {
  it("lets admins resolve and reopen", () => {
    assert.equal(nextSupportStatus("open", "resolved"), "resolved");
    assert.equal(nextSupportStatus("resolved", "open"), "open");
    assert.equal(nextSupportStatus("open", "open"), "open");
    assert.equal(nextSupportStatus("resolved", undefined), "resolved");
  });

  it("rejects any status that is not open or resolved", () => {
    assert.throws(() =>
      nextSupportStatus("open", "closed" as never),
    );
  });
});

describe("admin ticket patch", () => {
  it("requires a status or an admin note", () => {
    assert.throws(() => parseAdminUpdateTicket({ ticketId: "tkt_1" }));
    const withStatus = parseAdminUpdateTicket({
      ticketId: "tkt_1",
      status: "resolved",
    });
    assert.equal(withStatus.status, "resolved");
    const withNote = parseAdminUpdateTicket({
      ticketId: "tkt_1",
      adminNote: "Looked at ACE-Step logs.",
    });
    assert.equal(withNote.adminNote, "Looked at ACE-Step logs.");
  });

  it("caps the admin note", () => {
    assert.throws(() =>
      parseAdminUpdateTicket({
        ticketId: "tkt_1",
        adminNote: "x".repeat(ADMIN_NOTE_MAX + 1),
      }),
    );
  });
});

describe("post-login redirect", () => {
  it("allows /support after sign-in", () => {
    assert.equal(safeNextPath("/support"), "/support");
    assert.equal(safeNextPath("/settings?tab=support"), "/support");
  });
});
