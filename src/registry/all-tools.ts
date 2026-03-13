import { ToolRegistry } from './index.js';
import { filesystemTools } from './tools-filesystem.js';
import { gitTools } from './tools-git.js';
import { networkTools } from './tools-network.js';
import { buildTools } from './tools-build.js';
import { testTools, lintTools } from './tools-test.js';
import { deployTools, dbTools, cryptoTools, shellTools, transformTools, monitoringTools, aiTools } from './tools-misc.js';

export function createRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.registerAll(filesystemTools);
  registry.registerAll(gitTools);
  registry.registerAll(networkTools);
  registry.registerAll(buildTools);
  registry.registerAll(testTools);
  registry.registerAll(lintTools);
  registry.registerAll(deployTools);
  registry.registerAll(dbTools);
  registry.registerAll(cryptoTools);
  registry.registerAll(shellTools);
  registry.registerAll(transformTools);
  registry.registerAll(monitoringTools);
  registry.registerAll(aiTools);

  return registry;
}
