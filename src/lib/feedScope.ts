import type { VisitMarker } from "../types/domain";

export type FeedScope = "only" | "share";

export function markerMatchesScope(m: VisitMarker, scope: FeedScope): boolean {
  const visibility = m.visibility ?? "private";
  const owner = m.owner ?? "local";
  if (scope === "only") return owner === "local";
  return visibility === "shared";
}
