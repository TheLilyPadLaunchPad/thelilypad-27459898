import assert from "node:assert/strict";
import { test } from "node:test";
import { requirePublicEnvironment } from "./requirePublicEnvironment";

test("publishing requires a nonempty backend URL", () => {
  assert.throws(() => requirePublicEnvironment({ VITE_SUPABASE_PUBLISHABLE_KEY: "public-test-key" }), /VITE_SUPABASE_URL/);
});

test("publishing requires a nonempty publishable key", () => {
  assert.throws(() => requirePublicEnvironment({ VITE_SUPABASE_URL: "https://example.test", VITE_SUPABASE_PUBLISHABLE_KEY: " " }), /VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test("valid public connection settings permit publishing", () => {
  assert.doesNotThrow(() => requirePublicEnvironment({ VITE_SUPABASE_URL: "https://example.test", VITE_SUPABASE_PUBLISHABLE_KEY: "public-test-key" }));
});