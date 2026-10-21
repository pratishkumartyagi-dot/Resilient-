// Dataset comparison (fg-data-profiling "Compare datasets" feature).
//
// Compares two profiles column by column so the differences between a raw
// extract and a cleaned version (or between two study cohorts) are explicit.

import type {
  ColumnComparison,
  DataProfile,
  DatasetComparison,
  DatasetSummary,
} from "./types";

export function summariseDataset(profile: DataProfile, name?: string): DatasetSummary {
  const typeCounts: Record<string, number> = {};
  for (const column of profile.types) {
    typeCounts[column.type] = (typeCounts[column.type] || 0) + 1;
  }
  return {
    name: name || profile.name,
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    memoryFootprint: profile.reproduction.configuration.memoryFootprint || "—",
    completeness: profile.quality.completeness,
    duplicates: profile.duplicateCount,
    typeCounts,
  };
}

export function compareProfiles(
  left: DataProfile,
  right: DataProfile,
  leftName?: string,
  rightName?: string
): DatasetComparison {
  const leftTypes = new Map(left.types.map((t) => [t.name, t]));
  const rightTypes = new Map(right.types.map((t) => [t.name, t]));
  const leftMissing = new Map(
    left.missingAnalysis.perColumn.map((c) => [c.column, c.missingPct])
  );
  const rightMissing = new Map(
    right.missingAnalysis.perColumn.map((c) => [c.column, c.missingPct])
  );

  const allNames = Array.from(
    new Set([...leftTypes.keys(), ...rightTypes.keys()])
  );

  const columnComparisons: ColumnComparison[] = allNames.map((name) => {
    const l = leftTypes.get(name);
    const r = rightTypes.get(name);
    let status: ColumnComparison["status"] = "same";
    if (!l) status = "only_right";
    else if (!r) status = "only_left";
    else if (
      l.type !== r.type ||
      Math.abs((leftMissing.get(name) ?? 0) - (rightMissing.get(name) ?? 0)) > 0.5 ||
      Math.abs(l.distinct - r.distinct) > Math.max(1, l.distinct * 0.1)
    ) {
      status = "changed";
    }
    return {
      name,
      leftType: l?.type ?? ("Empty" as const),
      rightType: r?.type ?? ("Empty" as const),
      leftDistinct: l?.distinct ?? 0,
      rightDistinct: r?.distinct ?? 0,
      leftMissingPct: leftMissing.get(name) ?? 0,
      rightMissingPct: rightMissing.get(name) ?? 0,
      status,
    };
  });

  return {
    left: summariseDataset(left, leftName),
    right: summariseDataset(right, rightName),
    columnComparisons,
    sharedColumns: columnComparisons.filter((c) => c.status !== "only_left" && c.status !== "only_right").length,
    onlyLeft: columnComparisons.filter((c) => c.status === "only_left").map((c) => c.name),
    onlyRight: columnComparisons.filter((c) => c.status === "only_right").map((c) => c.name),
    changedColumns: columnComparisons.filter((c) => c.status === "changed").map((c) => c.name),
  };
}
