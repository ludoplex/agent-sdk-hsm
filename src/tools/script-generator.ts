import type { ExecutionPlan, GenerateScriptRequest } from '../types.js';

export function generateScript(req: GenerateScriptRequest): string {
  switch (req.runtime) {
    case 'node': return generateNode(req.plan);
    case 'python': return generatePython(req.plan);
    case 'bash': return generateBash(req.plan);
    default: throw new Error(`Unsupported runtime: ${req.runtime}`);
  }
}

function generateNode(plan: ExecutionPlan): string {
  const lines: string[] = [
    `// Auto-generated execution script for: ${plan.name}`,
    `// Plan ID: ${plan.id}`,
    `// Generated: ${new Date().toISOString()}`,
    '',
    `import { createHSMRuntime } from './hsm-runtime.js';`,
    '',
    `const plan = ${JSON.stringify(plan, null, 2)};`,
    '',
    `async function execute() {`,
    `  const runtime = createHSMRuntime(plan);`,
    `  runtime.send({ type: 'start', timestamp: new Date().toISOString() });`,
    '',
  ];

  for (const step of plan.steps) {
    lines.push(`  // ${step.id}: ${step.tool}`);
    lines.push(`  console.log('Executing: ${step.tool}');`);
    lines.push(`  try {`);
    lines.push(`    const result_${step.id.replace('-', '_')} = await tools.${step.tool}(${JSON.stringify(step.args)});`);
    lines.push(`    runtime.send({ type: 'success', payload: result_${step.id.replace('-', '_')}, timestamp: new Date().toISOString() });`);
    lines.push(`  } catch (err) {`);
    lines.push(`    runtime.send({ type: 'error', payload: err, timestamp: new Date().toISOString() });`);
    if (step.retryPolicy.maxAttempts > 1) {
      lines.push(`    // Retry policy: ${step.retryPolicy.maxAttempts} attempts`);
    }
    lines.push(`  }`);
    lines.push('');
  }

  lines.push(`  runtime.send({ type: 'done', timestamp: new Date().toISOString() });`);
  lines.push(`  console.log('Plan completed.');`);
  lines.push(`}`);
  lines.push('');
  lines.push(`execute().catch(console.error);`);

  return lines.join('\n');
}

function generatePython(plan: ExecutionPlan): string {
  const lines: string[] = [
    `# Auto-generated execution script for: ${plan.name}`,
    `# Plan ID: ${plan.id}`,
    `import asyncio`,
    `from datetime import datetime`,
    '',
    `async def execute():`,
  ];

  for (const step of plan.steps) {
    lines.push(`    # ${step.id}: ${step.tool}`);
    lines.push(`    print(f"Executing: ${step.tool}")`);
    lines.push(`    try:`);
    lines.push(`        result = await tools.${step.tool}(${JSON.stringify(step.args)})`);
    lines.push(`    except Exception as e:`);
    lines.push(`        print(f"Error in ${step.tool}: {e}")`);
    lines.push('');
  }

  lines.push(`    print("Plan completed.")`);
  lines.push('');
  lines.push(`asyncio.run(execute())`);

  return lines.join('\n');
}

function generateBash(plan: ExecutionPlan): string {
  const lines: string[] = [
    `#!/usr/bin/env bash`,
    `# Auto-generated execution script for: ${plan.name}`,
    `# Plan ID: ${plan.id}`,
    `set -euo pipefail`,
    '',
  ];

  for (const step of plan.steps) {
    lines.push(`# ${step.id}: ${step.tool}`);
    lines.push(`echo "Executing: ${step.tool}"`);
    lines.push(`# TODO: implement ${step.tool} call`);
    lines.push('');
  }

  lines.push(`echo "Plan completed."`);

  return lines.join('\n');
}
