// JSON export of the profiling report (fg-data-profiling "Flexible output
// formats" feature — the report as data for automated systems).

import type { DataProfile } from "./types";

export function profileToJson(profile: DataProfile, pretty = true): string {
  return JSON.stringify(
    {
      overview: profile.summary,
      alerts: profile.alerts,
      types: profile.types,
      variables: {
        numerical: profile.numericProfiles,
        categorical: profile.categoricalProfiles,
        temporal: profile.dateProfiles,
        text: profile.textProfiles,
      },
      histograms: profile.histograms,
      interactions: {
        correlations: profile.correlationMatrix,
        principalComponents: profile.pca.components,
      },
      missingValues: profile.missingAnalysis,
      duplicateRows: {
        count: profile.duplicateCount,
        groups: profile.duplicates,
      },
      timeSeries: profile.timeSeries,
      quality: profile.quality,
      reproduction: profile.reproduction,
    },
    null,
    pretty ? 2 : 0
  );
}
