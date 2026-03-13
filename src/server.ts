import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createRegistry } from './registry/all-tools.js';
import { buildPlan } from './tools/plan-builder.js';
import { createHSMRuntime, renderSM, renderMermaid } from './tools/hsm-runtime.js';
import { generateScript } from './tools/script-generator.js';
import type { LookupRequest, BuildPlanRequest, RenderStateMachineRequest, GenerateScriptRequest, ExecuteStepRequest } from './types.js';

const registry = createRegistry();

const server = new Server(
  { name: 'agent-sdk-hsm', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ── List Tools ──────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'lookup',
      description: `Search the tool registry (${registry.size()} tools). Find tools by name, category, or tags.`,
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query' },
          category: { type: 'string', description: 'Tool category filter' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag filters' },
          limit: { type: 'number', description: 'Max results', default: 10 },
        },
        required: ['query'],
      },
    },
    {
      name: 'build_plan',
      description: 'Build an execution plan with HSM state machine from a goal and tool list.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          goal: { type: 'string', description: 'What the plan should accomplish' },
          tools: { type: 'array', items: { type: 'string' }, description: 'Tool names to use' },
          constraints: { type: 'array', items: { type: 'string' }, description: 'Constraints' },
        },
        required: ['goal', 'tools'],
      },
    },
    {
      name: 'render_statemachine',
      description: 'Render a plan HSM in .sm, JSON, Mermaid, or DOT format.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          plan: { type: 'object', description: 'Execution plan with HSM' },
          format: { type: 'string', enum: ['sm', 'json', 'mermaid', 'dot'], description: 'Output format' },
        },
        required: ['plan', 'format'],
      },
    },
    {
      name: 'generate_script',
      description: 'Generate a runnable script from an execution plan.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          plan: { type: 'object', description: 'Execution plan' },
          runtime: { type: 'string', enum: ['node', 'python', 'bash'], description: 'Target runtime' },
        },
        required: ['plan', 'runtime'],
      },
    },
    {
      name: 'execute_step',
      description: 'Execute a single step of a plan (dry-run supported).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          planId: { type: 'string', description: 'Plan ID' },
          stepId: { type: 'string', description: 'Step ID' },
          dryRun: { type: 'boolean', description: 'Simulate only', default: true },
        },
        required: ['planId', 'stepId'],
      },
    },
    {
      name: 'list_categories',
      description: 'List all tool categories with counts.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
  ],
}));

// ── Call Tool ────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'lookup': {
        const req = args as unknown as LookupRequest;
        const results = registry.lookup(req);
        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
        };
      }

      case 'build_plan': {
        const req = args as unknown as BuildPlanRequest;
        const plan = buildPlan(req, registry);
        return {
          content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }],
        };
      }

      case 'render_statemachine': {
        const req = args as unknown as RenderStateMachineRequest;
        let output: string;
        switch (req.format) {
          case 'sm':
            output = renderSM(req.plan.hsm);
            break;
          case 'mermaid':
            output = renderMermaid(req.plan.hsm);
            break;
          case 'json':
            output = JSON.stringify(req.plan.hsm, null, 2);
            break;
          case 'dot':
            output = renderDot(req.plan.hsm);
            break;
          default:
            throw new Error(`Unknown format: ${req.format}`);
        }
        return { content: [{ type: 'text', text: output }] };
      }

      case 'generate_script': {
        const req = args as unknown as GenerateScriptRequest;
        const script = generateScript(req);
        return { content: [{ type: 'text', text: script }] };
      }

      case 'execute_step': {
        const req = args as unknown as ExecuteStepRequest;
        // Dry run by default
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              stepId: req.stepId,
              planId: req.planId,
              dryRun: req.dryRun ?? true,
              status: 'simulated',
              message: `Would execute step ${req.stepId} of plan ${req.planId}`,
            }, null, 2),
          }],
        };
      }

      case 'list_categories': {
        const cats = registry.categories();
        const summary = cats.map(cat => {
          const tools = registry.lookup({ query: '', category: cat, limit: 1000 });
          return { category: cat, count: tools.length };
        });
        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── DOT Renderer ────────────────────────────────────────────────────

function renderDot(hsm: import('./types.js').HSMDefinition): string {
  const lines: string[] = [
    `digraph ${hsm.name} {`,
    '  rankdir=TB;',
    '  node [shape=roundedbox, style=filled, fillcolor="#f0f0f0"];',
    '',
  ];

  function walk(state: import('./types.js').HSMState, prefix: string): void {
    const id = prefix ? `${prefix}_${state.name}` : state.name;
    if (state.children && state.children.length > 0) {
      lines.push(`  subgraph cluster_${id} {`);
      lines.push(`    label="${state.name}";`);
      lines.push(`    style=dashed;`);
      for (const child of state.children) {
        walk(child, id);
      }
      lines.push('  }');
    } else {
      lines.push(`  ${id} [label="${state.name}"];`);
    }
    for (const t of state.transitions) {
      const targetId = t.target.replace(/\./g, '_').replace(/\^/g, '');
      lines.push(`  ${id} -> ${targetId} [label="${t.event}"];`);
    }
  }

  for (const state of hsm.states) {
    walk(state, '');
  }

  lines.push('}');
  return lines.join('\n');
}

// ── Start Server ────────────────────────────────────────────────────

export async function startServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`agent-sdk-hsm MCP server running (${registry.size()} tools registered)`);
}
