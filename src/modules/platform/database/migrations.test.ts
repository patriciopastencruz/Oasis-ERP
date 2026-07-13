import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const files = [
  "202607110001_platform_core.sql",
  "202607110002_finance_payment_control.sql",
  "202607110003_functions_triggers.sql",
  "202607110004_rls_policies.sql",
  "202607110005_storage.sql",
  "202607110006_configurable_workflows_dashboards.sql",
];
const sql = files
  .map((file) =>
    readFileSync(resolve(root, "supabase/migrations", file), "utf8"),
  )
  .join("\n");

const requiredTables = [
  "companies",
  "business_units",
  "profiles",
  "roles",
  "permissions",
  "role_permissions",
  "user_companies",
  "user_business_units",
  "app_settings",
  "audit_logs",
  "notifications",
  "suppliers",
  "expense_categories",
  "cost_centers",
  "payment_requests",
  "payment_request_attachments",
  "approval_rules",
  "approval_actions",
  "payments",
  "payment_receipts",
  "petty_cash_accounts",
  "petty_cash_movements",
  "approval_workflows",
  "approval_workflow_conditions",
  "approval_workflow_steps",
  "payment_request_approval_instances",
  "payment_request_approval_steps",
  "payment_request_approval_decisions",
];

describe("Stage 2A migration contract", () => {
  it.each(requiredTables)("creates %s", (table) => {
    expect(sql).toMatch(
      new RegExp(`create table public\\.${table}\\s*\\(`, "i"),
    );
  });

  it.each(requiredTables)("enables RLS on %s", (table) => {
    expect(sql).toMatch(
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
  });

  it("does not include open USING true policies", () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("keeps all storage buckets private", () => {
    expect(sql.match(/false, 10485760/g)).toHaveLength(3);
  });

  it("freezes workflows into request instances", () => {
    expect(sql).toContain("instantiate_payment_request_workflow");
    expect(sql).toContain("payment_request_approval_steps");
    expect(sql).toContain("workflow_name_snapshot");
  });

  it("creates secure dashboard contracts", () => {
    expect(sql).toContain("with (security_invoker = true)");
    expect(sql).toContain("executive_payment_summary");
    expect(sql).toContain("monthly_payment_trend");
    expect(sql).toContain("America/Santiago");
  });

  it("fixes search_path on every SECURITY DEFINER function", () => {
    const definitions =
      sql.match(/create or replace function[\s\S]*?\$\$;/gi) ?? [];
    const privileged = definitions.filter((definition) =>
      /security definer/i.test(definition),
    );
    expect(privileged.length).toBeGreaterThan(0);
    expect(
      privileged.every((definition) =>
        /set search_path\s*=\s*''/i.test(definition),
      ),
    ).toBe(true);
  });
});
