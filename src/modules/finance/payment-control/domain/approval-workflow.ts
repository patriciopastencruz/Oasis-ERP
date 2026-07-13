export interface WorkflowCondition {
  companyId: string;
  unitId: string;
  requestType?: string;
  priority?: string;
  minAmount: number;
  maxAmount?: number;
}

export interface WorkflowStep {
  id: string;
  order: number;
  requiredRole: string;
  required: boolean;
}

export interface Workflow {
  id: string;
  condition: WorkflowCondition;
  steps: readonly WorkflowStep[];
}

export interface RequestContext {
  companyId: string;
  unitId: string;
  requestType: string;
  priority: string;
  amount: number;
}

export type FrozenStepStatus =
  "pending" | "approved" | "rejected" | "correction_requested" | "skipped";
export interface FrozenStep extends WorkflowStep {
  status: FrozenStepStatus;
}

export function selectWorkflow(
  workflows: readonly Workflow[],
  request: RequestContext,
): Workflow {
  const matches = workflows.filter(
    ({ condition }) =>
      condition.companyId === request.companyId &&
      condition.unitId === request.unitId &&
      (!condition.requestType ||
        condition.requestType === request.requestType) &&
      (!condition.priority || condition.priority === request.priority) &&
      request.amount >= condition.minAmount &&
      (condition.maxAmount === undefined ||
        request.amount <= condition.maxAmount),
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length ? "ambiguous_workflow" : "workflow_not_found",
    );
  return matches[0];
}

export function freezeSteps(workflow: Workflow): FrozenStep[] {
  return workflow.steps.map((step) => ({ ...step, status: "pending" }));
}

export function canDecideStep(
  steps: readonly FrozenStep[],
  stepId: string,
): boolean {
  const step = steps.find(({ id }) => id === stepId);
  return Boolean(
    step &&
    step.status === "pending" &&
    !steps.some(
      (candidate) =>
        candidate.required &&
        candidate.order < step.order &&
        candidate.status !== "approved",
    ),
  );
}

export function isWorkflowApproved(steps: readonly FrozenStep[]): boolean {
  return steps
    .filter(({ required }) => required)
    .every(({ status }) => status === "approved");
}

export function restartSteps(steps: readonly FrozenStep[]): FrozenStep[] {
  return steps.map((step) => ({ ...step, status: "pending" }));
}
