import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDatabaseConfigured, resolveDatabaseUrl } from "./database-url.ts";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL", () => {
    assert.equal(
      resolveDatabaseUrl({
        DATABASE_URL: "postgres://db",
        POSTGRES_URL: "postgres://supabase",
      }),
      "postgres://db",
    );
  });

  it("falls back to Supabase / Vercel Marketplace names", () => {
    assert.equal(
      resolveDatabaseUrl({ POSTGRES_URL: " postgres://pooler " }),
      "postgres://pooler",
    );
    assert.equal(
      resolveDatabaseUrl({ POSTGRES_PRISMA_URL: "postgres://prisma" }),
      "postgres://prisma",
    );
    assert.equal(
      resolveDatabaseUrl({ POSTGRES_URL_NON_POOLING: "postgres://direct" }),
      "postgres://direct",
    );
  });

  it("treats empty as unset", () => {
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: "  " }), undefined);
    assert.equal(isDatabaseConfigured({}), false);
    assert.equal(isDatabaseConfigured({ POSTGRES_URL: "postgres://x" }), true);
  });
});
