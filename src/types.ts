// ── HSM State Machine Types ──────────────────────────────────────────

export interface HSMTransition {
  event: string;
  target: string;          // can use ^ for parent, @ for history
  guard?: string;          // condition expression
  action?: string;         // side effect on transition
}

export interface HSMState {
  name: string;
  initial?: string;        // initial child state for composite states
  children?: HSMState[];   // nested states (makes it hierarchical)
  enter?: string;          // entry action
  exit?: string;           // exit action
  transitions: HSMTransition[];
  history?: 'shallow' | 'deep';
}

export interface HSMDefinition {
  name: string;
  version: string;
  target: 'cli' | 'desktop' | 'both';
  initial: string;         // fully qualified initial state e.g. "Session.Idle"
  states: HSMState[];
}

// ── Tool Registry Types ─────────────────────────────────────────────

export type ToolCategory =
  | 'filesystem'
  | 'git'
  | 'network'
  | 'database'
  | 'build'
  | 'test'
  | 'lint'
  | 'format'
  | 'deploy'
  | 'container'
  | 'cloud'
  | 'auth'
  | 'crypto'
  | 'monitoring'
  | 'search'
  | 'transform'
  | 'generate'
  | 'validate'
  | 'package'
  | 'debug'
  | 'shell'
  | 'editor'
  | 'browser'
  | 'email'
  | 'calendar'
  | 'ai'
  | 'media'
  | 'pdf'
  | 'spreadsheet'
  | 'archive';

export interface ToolParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  category: ToolCategory;
  params: ToolParam[];
  returns: string;
  sideEffects: boolean;
  requiresPermission: boolean;
  estimatedDuration: 'instant' | 'fast' | 'medium' | 'slow';
  tags: string[];
}

// ── Execution Plan Types ────────────────────────────────────────────

export interface PlanStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  dependsOn: string[];     // ids of steps this depends on
  state: string;           // HSM state this step maps to
  estimatedDuration: 'instant' | 'fast' | 'medium' | 'slow';
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  retryOn: string[];       // error types to retry on
}

export interface ExecutionPlan {
  id: string;
  name: string;
  description: string;
  steps: PlanStep[];
  hsm: HSMDefinition;      // state machine governing execution
  createdAt: string;
  status: PlanStatus;
}

export type PlanStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ── Step Execution Types ────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'skipped';
  output: unknown;
  error?: string;
  durationMs: number;
  attempts: number;
  stateTransition: {
    from: string;
    to: string;
    event: string;
  };
}

// ── HSM Runtime Types ───────────────────────────────────────────────

export interface HSMContext {
  currentState: string;     // fully qualified e.g. "Session.Processing.Execution.Running.ToolRun"
  history: Map<string, string>;  // composite state -> last active child
  variables: Record<string, unknown>;
  plan: ExecutionPlan;
}

export interface HSMEvent {
  type: string;
  payload?: unknown;
  timestamp: string;
}

export interface HSMRuntime {
  context: HSMContext;
  send: (event: HSMEvent) => HSMContext;
  matches: (statePattern: string) => boolean;
  getActiveStates: () => string[];  // all active states in hierarchy
}

// ── SM File Parser Types ────────────────────────────────────────────

export interface SMToken {
  type: 'keyword' | 'identifier' | 'symbol' | 'string' | 'number' | 'comment';
  value: string;
  line: number;
  col: number;
}

export interface SMParseResult {
  success: boolean;
  hsm?: HSMDefinition;
  errors: SMParseError[];
}

export interface SMParseError {
  message: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
}

// ── MCP Tool Schemas ────────────────────────────────────────────────

export interface LookupRequest {
  query: string;
  category?: ToolCategory;
  tags?: string[];
  limit?: number;
}

export interface BuildPlanRequest {
  goal: string;
  tools: string[];
  constraints?: string[];
}

export interface RenderStateMachineRequest {
  plan: ExecutionPlan;
  format: 'sm' | 'hsm' | 'json' | 'dot';
}

export interface GenerateScriptRequest {
  plan: ExecutionPlan;
  runtime: 'node' | 'python' | 'bash';
}

export interface ExecuteStepRequest {
  planId: string;
  stepId: string;
  dryRun?: boolean;
}
