import type { HSMDefinition, HSMState, HSMContext, HSMEvent, HSMRuntime, ExecutionPlan } from '../types.js';

function findState(states: HSMState[], path: string[]): HSMState | undefined {
  if (path.length === 0) return undefined;
  const target = states.find(s => s.name === path[0]);
  if (!target || path.length === 1) return target;
  return findState(target.children ?? [], path.slice(1));
}

function resolveInitial(state: HSMState): string[] {
  const path = [state.name];
  if (state.initial && state.children) {
    const child = state.children.find(s => s.name === state.initial);
    if (child) path.push(...resolveInitial(child));
  }
  return path;
}

function getActiveHierarchy(states: HSMState[], qualified: string): string[] {
  const parts = qualified.split('.');
  const result: string[] = [];
  let current = states;
  for (const part of parts) {
    result.push(part);
    const found = current.find(s => s.name === part);
    if (!found || !found.children) break;
    current = found.children;
  }
  return result;
}

export function createHSMRuntime(plan: ExecutionPlan): HSMRuntime {
  const hsm = plan.hsm;

  const context: HSMContext = {
    currentState: hsm.initial,
    history: new Map(),
    variables: {},
    plan,
  };

  function send(event: HSMEvent): HSMContext {
    const parts = context.currentState.split('.');
    // Walk up the hierarchy looking for a handler
    for (let depth = parts.length; depth > 0; depth--) {
      const statePath = parts.slice(0, depth);
      const state = findState(hsm.states, statePath);
      if (!state) continue;

      const transition = state.transitions.find(t => t.event === event.type);
      if (!transition) continue;

      let target = transition.target;

      // Handle ^ parent reference
      if (target.startsWith('^')) {
        const ref = target.slice(1);
        target = ref;
      }

      // Handle @history
      if (target === '@history') {
        const parentPath = statePath.slice(0, -1).join('.');
        const lastChild = context.history.get(parentPath);
        if (lastChild) {
          target = lastChild;
        } else {
          continue;
        }
      }

      // Save history for current composite state
      const parentPath = parts.slice(0, -1).join('.');
      if (parentPath) {
        context.history.set(parentPath, context.currentState);
      }

      // Resolve target - could be relative or fully qualified
      if (!target.includes('.')) {
        // Relative - resolve from parent
        const parentParts = statePath.slice(0, -1);
        if (parentParts.length > 0) {
          target = [...parentParts, target].join('.');
        }
      }

      // Enter initial substates
      const targetParts = target.split('.');
      const targetState = findState(hsm.states, targetParts);
      if (targetState && targetState.initial && targetState.children) {
        const initialPath = resolveInitial(targetState);
        target = [...targetParts.slice(0, -1), ...initialPath].join('.');
      }

      context.currentState = target;
      return context;
    }

    // No handler found - stay in current state
    return context;
  }

  function matches(pattern: string): boolean {
    return context.currentState.startsWith(pattern) || context.currentState === pattern;
  }

  function getActiveStates(): string[] {
    return getActiveHierarchy(hsm.states, context.currentState);
  }

  return { context, send, matches, getActiveStates };
}

// ── SM Format Renderer ──────────────────────────────────────────────

export function renderSM(hsm: HSMDefinition, indent: number = 0): string {
  const lines: string[] = [];
  const pad = (n: number) => '  '.repeat(n);

  lines.push(`${pad(indent)}@hsm ${hsm.name}`);
  lines.push(`${pad(indent + 1)}@version ${hsm.version}`);
  lines.push(`${pad(indent + 1)}@target ${hsm.target}`);
  lines.push(`${pad(indent + 1)}@initial ${hsm.initial}`);
  lines.push('');

  function renderState(state: HSMState, depth: number): void {
    lines.push(`${pad(depth)}state ${state.name} {`);

    if (state.initial) lines.push(`${pad(depth + 1)}@initial ${state.initial}`);
    if (state.history) lines.push(`${pad(depth + 1)}@history ${state.history}`);
    if (state.enter) lines.push(`${pad(depth + 1)}enter: ${state.enter}`);
    if (state.exit) lines.push(`${pad(depth + 1)}exit: ${state.exit}`);

    if (state.transitions.length > 0) lines.push('');
    for (const t of state.transitions) {
      let line = `${pad(depth + 1)}on ${t.event}`;
      if (t.guard) line += ` [${t.guard}]`;
      line += ` -> ${t.target}`;
      if (t.action) line += ` / ${t.action}`;
      lines.push(line);
    }

    if (state.children && state.children.length > 0) {
      lines.push('');
      for (const child of state.children) {
        renderState(child, depth + 1);
      }
    }

    lines.push(`${pad(depth)}}`);
    lines.push('');
  }

  for (const state of hsm.states) {
    renderState(state, indent + 1);
  }

  lines.push(`${pad(indent)}@end`);
  return lines.join('\n');
}

// ── Mermaid Renderer ────────────────────────────────────────────────

export function renderMermaid(hsm: HSMDefinition): string {
  const lines: string[] = ['stateDiagram-v2'];

  function renderState(state: HSMState, prefix: string): void {
    const id = prefix ? `${prefix}_${state.name}` : state.name;

    if (state.children && state.children.length > 0) {
      lines.push(`  state ${id} {`);
      if (state.initial) {
        lines.push(`    [*] --> ${id}_${state.initial}`);
      }
      for (const child of state.children) {
        renderState(child, id);
      }
      lines.push('  }');
    }

    for (const t of state.transitions) {
      const targetId = t.target.replace(/\./g, '_').replace(/\^/g, '');
      lines.push(`  ${id} --> ${targetId} : ${t.event}`);
    }
  }

  lines.push(`  [*] --> ${hsm.initial.replace(/\./g, '_')}`);
  for (const state of hsm.states) {
    renderState(state, '');
  }

  return lines.join('\n');
}
