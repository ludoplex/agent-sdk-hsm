import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');
const sourceRoot = path.join(repoRoot, 'src');
const defaultManifestPath = path.join(repoRoot, 'analysis', 'source-manifest.json');

const CRITICAL_MISSING_IMPLEMENTATION = [
  {
    area: 'step execution',
    severity: 'critical',
    summary: 'Plan steps are never actually executed.',
    evidence: [
      'src/server.ts:144',
      'src/server.ts:154',
    ],
  },
  {
    area: 'tool runtime',
    severity: 'critical',
    summary: 'The registry stores tool metadata only; there are no executable tool implementations.',
    evidence: [
      'src/types.ts:70',
      'src/registry/index.ts:3',
    ],
  },
  {
    area: 'generated scripts',
    severity: 'critical',
    summary: 'Generated Node and Python scripts call an undefined tools object, and the Bash script is placeholder-only.',
    evidence: [
      'src/tools/script-generator.ts:32',
      'src/tools/script-generator.ts:66',
      'src/tools/script-generator.ts:91',
    ],
  },
  {
    area: 'hsm actions and guards',
    severity: 'critical',
    summary: 'Transition guards and actions are modeled as strings but are never evaluated or executed.',
    evidence: [
      'src/types.ts:6',
      'src/tools/hsm-runtime.ts:50',
      'src/tools/plan-builder.ts:73',
    ],
  },
  {
    area: 'plan persistence',
    severity: 'critical',
    summary: 'Plans and runtime state are in-memory only, so work cannot be resumed across sessions.',
    evidence: [
      'src/tools/hsm-runtime.ts:35',
      'src/server.ts:145',
    ],
  },
];

const REQUIRED_FEATURES = [
  'Bind registry tool definitions to executable implementations with permission gating.',
  'Implement real step execution, retry handling, result passing, and error recovery.',
  'Evaluate HSM guards/actions or replace string placeholders with typed callbacks.',
  'Persist plans, runtime history, and step results so executions can resume safely.',
  'Make generated Node/Python/Bash scripts self-contained and runnable.',
  'Add an SM/HSM parser to complement the existing renderers and declared parser types.',
];

const CICD_STATUS = {
  workflowsPresent: false,
  workflowPaths: [],
  gaps: [
    'No GitHub Actions or other checked-in CI/CD workflows were found under .github/workflows.',
    'No automated build, typecheck, manifest generation, or release validation pipeline is configured in the repository.',
  ],
};

const TEST_COVERAGE_STATUS = {
  testsPresent: false,
  testFilePatternsFound: [],
  configuredTestScript: false,
  gaps: [
    'No test files matching common patterns were found in the repository.',
    'package.json does not define a test script.',
    'Core modules such as ToolRegistry, plan building, HSM runtime transitions, and script generation have no automated coverage.',
  ],
};

function listTypeScriptFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(absolutePath);
    }
  }

  return files;
}

function createLineReader(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  return (lineNumber) => lines[lineNumber - 1] ?? '';
}

function getLocation(sourceFile, node, readLine) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false));
  const line = position.line + 1;
  return {
    file: path.basename(sourceFile.fileName),
    filepath: sourceFile.fileName,
    relativePath: path.relative(repoRoot, sourceFile.fileName).replaceAll(path.sep, '/'),
    line,
    column: position.character + 1,
    lineText: readLine(line),
  };
}

function appendUniqueBindingNames(names, bindingName) {
  if (ts.isIdentifier(bindingName)) {
    names.push(bindingName.text);
    return;
  }

  for (const element of bindingName.elements) {
    appendUniqueBindingNames(names, element.name);
  }
}

function getVariableKind(node) {
  if (!node.parent || !ts.isVariableDeclarationList(node.parent)) {
    return 'variable';
  }

  if ((node.parent.flags & ts.NodeFlags.Const) !== 0) {
    return 'const';
  }

  if ((node.parent.flags & ts.NodeFlags.Let) !== 0) {
    return 'let';
  }

  return 'var';
}

function getFunctionName(node, sourceFile) {
  if ('name' in node && node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  const parent = node.parent;
  if (!parent) {
    return `${ts.SyntaxKind[node.kind]}@${sourceFile.fileName}:${node.pos}`;
  }

  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }

  if (ts.isPropertyAssignment(parent)) {
    return parent.name.getText(sourceFile);
  }

  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return parent.left.getText(sourceFile);
  }

  if (ts.isCallExpression(parent)) {
    return `${parent.expression.getText(sourceFile)}::<callback>`;
  }

  return `${ts.SyntaxKind[node.kind]}@${sourceFile.fileName}:${node.pos}`;
}

function createEntry(category, name, kind, sourceFile, node, readLine) {
  return {
    name,
    kind,
    ...getLocation(sourceFile, node, readLine),
    category,
  };
}

function collectManifest() {
  const files = listTypeScriptFiles(sourceRoot);
  const functions = new Map();
  const variables = new Map();
  const interpreterCalls = new Map();

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const readLine = createLineReader(sourceText);

    function visit(node) {
      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isConstructorDeclaration(node)) {
        const functionName = ts.isConstructorDeclaration(node) ? 'constructor' : getFunctionName(node, sourceFile);
        if (!functions.has(functionName)) {
          functions.set(functionName, createEntry('function', functionName, ts.SyntaxKind[node.kind], sourceFile, node, readLine));
        }
      }

      if (ts.isVariableDeclaration(node)) {
        const bindingNames = [];
        appendUniqueBindingNames(bindingNames, node.name);
        const variableKind = getVariableKind(node);
        for (const bindingName of bindingNames) {
          if (!variables.has(bindingName)) {
            variables.set(bindingName, createEntry('variable', bindingName, variableKind, sourceFile, node, readLine));
          }
        }
      }

      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callName = ts.isCallExpression(node)
          ? node.expression.getText(sourceFile)
          : `new ${node.expression.getText(sourceFile)}`;

        if (!interpreterCalls.has(callName)) {
          interpreterCalls.set(
            callName,
            createEntry(
              'interpreterCall',
              callName,
              ts.isCallExpression(node) ? 'callExpression' : 'newExpression',
              sourceFile,
              node,
              readLine,
            ),
          );
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return {
    manifestVersion: 1,
    rootPath: repoRoot,
    sourceRoot,
    discoveryOrder: 'sorted-relative-path then depth-first AST traversal',
    filesScanned: files.map((filePath) => ({
      file: path.basename(filePath),
      filepath: filePath,
      relativePath: path.relative(repoRoot, filePath).replaceAll(path.sep, '/'),
    })),
    functions: [...functions.values()],
    variables: [...variables.values()],
    interpreterCalls: [...interpreterCalls.values()],
    assessment: {
      criticalMissingImplementation: CRITICAL_MISSING_IMPLEMENTATION,
      neededFeaturesForFullFunctionality: REQUIRED_FEATURES,
      ciCd: CICD_STATUS,
      testCoverage: TEST_COVERAGE_STATUS,
    },
  };
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeManifest(outputPath) {
  const manifest = collectManifest();
  ensureDirectory(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(`Wrote manifest to ${outputPath}\n`);
  process.stdout.write(`Files scanned: ${manifest.filesScanned.length}\n`);
  process.stdout.write(`Functions: ${manifest.functions.length}\n`);
  process.stdout.write(`Variables: ${manifest.variables.length}\n`);
  process.stdout.write(`Interpreter calls: ${manifest.interpreterCalls.length}\n`);
}

function sortVerificationEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.filepath !== right.filepath) {
      return left.filepath.localeCompare(right.filepath);
    }

    if (left.line !== right.line) {
      return left.line - right.line;
    }

    if (left.category !== right.category) {
      return left.category.localeCompare(right.category);
    }

    return left.name.localeCompare(right.name);
  });
}

function verifyManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entries = sortVerificationEntries([
    ...manifest.functions,
    ...manifest.variables,
    ...manifest.interpreterCalls,
  ]);

  let mismatchCount = 0;
  for (const entry of entries) {
    const fileText = fs.readFileSync(entry.filepath, 'utf8');
    const readLine = createLineReader(fileText);
    const actualLine = readLine(entry.line);
    const matches = actualLine === entry.lineText;

    if (!matches) {
      mismatchCount += 1;
    }

    process.stdout.write(
      `${matches ? 'OK' : 'MISMATCH'} ${entry.relativePath}:${entry.line}:${entry.column} [${entry.category}:${entry.kind}:${entry.name}] ${JSON.stringify(actualLine)}\n`,
    );
  }

  if (mismatchCount > 0) {
    process.stderr.write(`Manifest verification failed with ${mismatchCount} mismatched line(s).\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Verified ${entries.length} manifest line reference(s) from ${manifestPath}\n`);
}

function usage() {
  process.stderr.write('Usage: node scripts/source-manifest.mjs <generate|verify> [manifestPath]\n');
  process.exit(1);
}

const [command, providedManifestPath] = process.argv.slice(2);
const manifestPath = providedManifestPath ? path.resolve(repoRoot, providedManifestPath) : defaultManifestPath;

switch (command) {
  case 'generate':
    writeManifest(manifestPath);
    break;
  case 'verify':
    verifyManifest(manifestPath);
    break;
  default:
    usage();
}
