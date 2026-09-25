// Lowest-available-number allocation for candidacy positions.
//
// Candidate numbers are election-specific positions (see TS-17). Deleting a
// candidacy frees its number and MUST NOT compact the remaining ones, so the
// next registration reuses the smallest free position instead of appending
// MAX + 1. An election with zero candidacies restarts at 1.

export function lowestAvailablePosition(usedPositions: number[]): number {
  const used = new Set(usedPositions);
  let candidate = 1;
  while (used.has(candidate)) candidate++;
  return candidate;
}
