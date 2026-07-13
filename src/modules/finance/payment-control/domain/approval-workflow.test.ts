import { describe, expect, it } from "vitest";
import {
  canDecideStep,
  freezeSteps,
  isWorkflowApproved,
  restartSteps,
  selectWorkflow,
  type Workflow,
} from "./approval-workflow";

const workflows: Workflow[] = [
  {
    id: "low",
    condition: {
      companyId: "oasis",
      unitId: "om",
      minAmount: 0,
      maxAmount: 100000,
    },
    steps: [{ id: "admin", order: 1, requiredRole: "admin", required: true }],
  },
  {
    id: "high",
    condition: { companyId: "oasis", unitId: "om", minAmount: 100001 },
    steps: [
      { id: "admin-high", order: 1, requiredRole: "admin", required: true },
      { id: "finance", order: 2, requiredRole: "finance", required: true },
    ],
  },
];

describe("configurable approval workflows", () => {
  it("selects the correct workflow", () =>
    expect(
      selectWorkflow(workflows, {
        companyId: "oasis",
        unitId: "om",
        requestType: "supplier",
        priority: "normal",
        amount: 90000,
      }).id,
    ).toBe("low"));
  it("does not mix companies", () =>
    expect(() =>
      selectWorkflow(workflows, {
        companyId: "other",
        unitId: "om",
        requestType: "supplier",
        priority: "normal",
        amount: 90000,
      }),
    ).toThrow("workflow_not_found"));
  it("rejects ambiguous configuration", () =>
    expect(() =>
      selectWorkflow([...workflows, workflows[0]], {
        companyId: "oasis",
        unitId: "om",
        requestType: "supplier",
        priority: "normal",
        amount: 90000,
      }),
    ).toThrow("ambiguous_workflow"));
  it("freezes independent copies", () => {
    const frozen = freezeSteps(workflows[0]);
    workflows[0].steps[0].requiredRole = "changed";
    expect(frozen[0].requiredRole).toBe("admin");
  });
  it("blocks a later sequential step", () =>
    expect(canDecideStep(freezeSteps(workflows[1]), "finance")).toBe(false));
  it("allows the first sequential step", () =>
    expect(canDecideStep(freezeSteps(workflows[1]), "admin-high")).toBe(true));
  it("does not complete before all mandatory steps", () =>
    expect(
      isWorkflowApproved([
        { ...workflows[1].steps[0], status: "approved" },
        { ...workflows[1].steps[1], status: "pending" },
      ]),
    ).toBe(false));
  it("completes after all mandatory steps", () =>
    expect(
      isWorkflowApproved(
        workflows[1].steps.map((step) => ({ ...step, status: "approved" })),
      ),
    ).toBe(true));
  it("restarts every step after correction", () =>
    expect(
      restartSteps(
        workflows[1].steps.map((step) => ({ ...step, status: "approved" })),
      ).every(({ status }) => status === "pending"),
    ).toBe(true));
});
