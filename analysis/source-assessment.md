# Source Assessment

## Critical missing implementation

1. **Plan steps are not executed.** The `execute_step` tool returns a simulated payload instead of invoking any plan logic (`/home/runner/work/agent-sdk-hsm/agent-sdk-hsm/src/server.ts:144`).
2. **Tool implementations are missing.** The registry stores metadata only, so plans can describe tools but cannot run them (`/home/runner/work/agent-sdk-hsm/agent-sdk-hsm/src/types.ts:70`, `/home/runner/work/agent-sdk-hsm/agent-sdk-hsm/src/registry/index.ts:3`).
3. **Generated scripts are not runnable end to end.** The generated Node.js and Python scripts call `tools.*` even though no such runtime object is created, and the Bash generator still emits TODO placeholders (`/home/runner/work/agent-sdk-hsm/agent-sdk-hsm/src/tools/script-generator.ts:32`, `:66`, `:91`).
4. **HSM guards and actions are declarative only.** Transition guards and actions are kept as strings but are never interpreted by the runtime, so permission, recovery, and output behaviors are not actually enforced (`/home/runner/work/agent-sdk-hsm/agent-sdk-hsm/src/types.ts:3`, `/home/runner/work/agent-sdk-hsm/agent-sdk-hsm/src/tools/hsm-runtime.ts:42`).
5. **Plan/runtime state is not persisted.** Plans and runtime history live in memory only, which prevents resuming or auditing executions across sessions (`/home/runner/work/agent-sdk-hsm/agent-sdk-hsm/src/tools/hsm-runtime.ts:35`).

## Needed features for full functionality

- Bind `ToolDef` entries to executable implementations.
- Execute plan steps for real, with permission checks, retries, and result propagation between steps.
- Replace string-only HSM guards/actions with executable logic or a safe evaluator.
- Persist execution plans, state history, and step results.
- Make generated Node, Python, and Bash scripts self-contained and executable.
- Implement the SM/HSM parser types already declared in `src/types.ts`.

## CI/CD status

- No CI/CD workflows are checked in under `.github/workflows/`.
- There is no automated pipeline for `npm run typecheck`, `npm run build`, or manifest generation/verification.
- There is no release, packaging, or deployment automation in the repository itself.

## Test coverage status

- No test files or test configuration are present in the repository.
- `package.json` has no `test` script.
- Core behavior that needs coverage includes registry lookup, plan building, HSM transitions, table/render output, and script generation.
