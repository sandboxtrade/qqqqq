import type { CompanionRepository } from "../storage/repositories/interfaces";

export interface MemoryHealthSnapshot {
  activeMemories: number;
  episodicMemories: number;
  shortTermMemories: number;
  archivedMemories: number;
  activeFacts: number;
  outdatedFacts: number;
  openThreads: number;
}

export async function getMemoryHealth(
  repository: CompanionRepository,
): Promise<MemoryHealthSnapshot> {
  const [activeMemories, historicalMemories, activeFacts, outdatedFacts, openThreads] =
    await Promise.all([
      repository.listMemories({ statuses: ["active"], limit: 1200 }),
      repository.listMemories({
        statuses: ["archived", "outdated"],
        includeArchived: true,
        limit: 1200,
      }),
      repository.listKnowledgeFacts({ statuses: ["active"], limit: 600 }),
      repository.listKnowledgeFacts({ statuses: ["outdated"], limit: 600 }),
      repository.listOpenThreads({ statuses: ["open"], limit: 300 }),
    ]);

  return {
    activeMemories: activeMemories.length,
    episodicMemories: activeMemories.filter((m) => m.kind === "episodic").length,
    shortTermMemories: activeMemories.filter((m) => m.kind === "short_term").length,
    archivedMemories: historicalMemories.filter((m) => m.status === "archived").length,
    activeFacts: activeFacts.length,
    outdatedFacts: outdatedFacts.length,
    openThreads: openThreads.length,
  };
}
