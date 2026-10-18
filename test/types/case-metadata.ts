import { apiCases, interactionCases } from '../cases/manifest/index.js';
import type { CaseMetadata } from './testing.js';

// Both independently authored catalogs must be consumable without a normalization layer.
const catalogs: readonly CaseMetadata[] = [...apiCases, ...interactionCases];
for (const entry of catalogs) {
  const requirements: readonly string[] = entry.requirements;
  void requirements;
}
