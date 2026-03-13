import type { ToolDef, ExecutionPlan, PlanStep, HSMDefinition, HSMState, BuildPlanRequest } from '../types.js';
import { ToolRegistry } from '../registry/index.js';
import { randomUUID } from 'crypto';

export function buildPlan(req: BuildPlanRequest, registry: ToolRegistry): ExecutionPlan {
  const resolvedTools: ToolDef[] = [];
  for (const name of req.tools) {
    const tool = registry.get(name);
    if (tool) resolvedTools.push(tool);
  }

  const steps: PlanStep[] = resolvedTools.map((tool, i) => ({
    id: `step-${i + 1}`,
    tool: tool.name,
    args: {},
    dependsOn: i > 0 ? [`step-${i}`] : [],
    state: `Session.Processing.Execution.Running.ToolRun`,
    estimatedDuration: tool.estimatedDuration,
    retryPolicy: {
      maxAttempts: tool.sideEffects ? 1 : 3,
      backoffMs: 1000,
      retryOn: ['TIMEOUT', 'NETWORK_ERROR'],
    },
  }));

  const hsm = generateHSM(steps, req.goal);

  return {
    id: randomUUID(),
    name: req.goal,
    description: `Auto-generated plan for: ${req.goal}`,
    steps,
    hsm,
    createdAt: new Date().toISOString(),
    status: 'draft',
  };
}

function generateHSM(steps: PlanStep[], name: string): HSMDefinition {
  const toolRunStates: HSMState[] = steps.map((step, i) => ({
    name: `Step_${i + 1}`,
    enter: `invoke(${step.tool})`,
    transitions: [
      { event: 'success', target: i < steps.length - 1 ? `Step_${i + 2}` : '^Respond' },
      { event: 'error', target: '^Recovery' },
      { event: 'denied', target: '^Permission' },
    ],
  }));

  const states: HSMState[] = [
    {
      name: 'Session',
      initial: 'Idle',
      transitions: [],
      children: [
        {
          name: 'Idle',
          transitions: [{ event: 'start', target: 'Processing' }],
        },
        {
          name: 'Processing',
          initial: 'Execution',
          transitions: [{ event: 'cancel', target: 'Idle' }],
          children: [
            {
              name: 'Execution',
              initial: 'Step_1',
              transitions: [],
              children: [
                ...toolRunStates,
                {
                  name: 'Respond',
                  enter: 'formatOutput($result)',
                  transitions: [{ event: 'done', target: '^Session.Idle' }],
                },
              ],
            },
            {
              name: 'Permission',
              enter: 'promptUser($action)',
              transitions: [
                { event: 'approve', target: '@history' },
                { event: 'deny', target: 'Execution.Respond' },
              ],
            },
            {
              name: 'Recovery',
              enter: 'logError($error)',
              transitions: [
                { event: 'retry', target: '@history' },
                { event: 'fatal', target: '^Session.Idle' },
              ],
            },
          ],
        },
      ],
    },
  ];

  return {
    name: `plan_${name.replace(/\s+/g, '_').toLowerCase()}`,
    version: '1.0.0',
    target: 'both',
    initial: 'Session.Idle',
    states,
  };
}
