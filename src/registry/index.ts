import type { ToolDef, ToolCategory, LookupRequest } from '../types.js';

export class ToolRegistry {
  private tools: Map<string, ToolDef> = new Map();
  private byCategory: Map<ToolCategory, Set<string>> = new Map();
  private byTag: Map<string, Set<string>> = new Map();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);

    // index by category
    if (!this.byCategory.has(tool.category)) {
      this.byCategory.set(tool.category, new Set());
    }
    this.byCategory.get(tool.category)!.add(tool.name);

    // index by tags
    for (const tag of tool.tags) {
      if (!this.byTag.has(tag)) {
        this.byTag.set(tag, new Set());
      }
      this.byTag.get(tag)!.add(tool.name);
    }
  }

  registerAll(tools: ToolDef[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  lookup(req: LookupRequest): ToolDef[] {
    let candidates: ToolDef[];

    if (req.category) {
      const names = this.byCategory.get(req.category);
      candidates = names
        ? [...names].map(n => this.tools.get(n)!).filter(Boolean)
        : [];
    } else {
      candidates = [...this.tools.values()];
    }

    if (req.tags && req.tags.length > 0) {
      candidates = candidates.filter(t =>
        req.tags!.some(tag => t.tags.includes(tag))
      );
    }

    if (req.query) {
      const q = req.query.toLowerCase();
      candidates = candidates.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      );
    }

    // score and sort
    candidates.sort((a, b) => {
      const scoreA = this.relevanceScore(a, req.query);
      const scoreB = this.relevanceScore(b, req.query);
      return scoreB - scoreA;
    });

    return candidates.slice(0, req.limit ?? 10);
  }

  categories(): ToolCategory[] {
    return [...this.byCategory.keys()];
  }

  allTags(): string[] {
    return [...this.byTag.keys()];
  }

  size(): number {
    return this.tools.size;
  }

  all(): ToolDef[] {
    return [...this.tools.values()];
  }

  private relevanceScore(tool: ToolDef, query: string): number {
    if (!query) return 0;
    const q = query.toLowerCase();
    let score = 0;

    if (tool.name.toLowerCase() === q) score += 100;
    else if (tool.name.toLowerCase().includes(q)) score += 50;

    if (tool.description.toLowerCase().includes(q)) score += 25;

    for (const tag of tool.tags) {
      if (tag.toLowerCase() === q) score += 40;
      else if (tag.toLowerCase().includes(q)) score += 15;
    }

    return score;
  }
}
