"use client";

import React from "react";

export interface Prisma2020Counts {
  /** Records returned by the database searches before any screening. */
  identified: number;
  /** Records removed because they were duplicates. */
  duplicatesRemoved: number;
  /** Records removed by the automated relevance filter. */
  automationRemoved: number;
  /** Records removed for any other pre-screening reason. */
  otherRemoved: number;
  /** Records screened (unique records entering screening). */
  screened: number;
  /** Records excluded during screening. */
  screenedExcluded: number;
  /** Reports sought for retrieval. */
  soughtForRetrieval: number;
  /** Reports that could not be retrieved. */
  notRetrieved: number;
  /** Reports assessed for eligibility. */
  assessedForEligibility: number;
  /** Exclusion reasons with counts, used for the eligibility box. */
  eligibilityExcluded: Record<string, number>;
  /** Studies finally included. */
  included: number;
  /** Per-database breakdown of the records identified. */
  perDatabase?: Record<string, number>;
}

export const EMPTY_PRISMA_COUNTS: Prisma2020Counts = {
  identified: 0,
  duplicatesRemoved: 0,
  automationRemoved: 0,
  otherRemoved: 0,
  screened: 0,
  screenedExcluded: 0,
  soughtForRetrieval: 0,
  notRetrieved: 0,
  assessedForEligibility: 0,
  eligibilityExcluded: {},
  included: 0,
  perDatabase: {},
};

function Stage({
  title,
  count,
  detail,
  tone = "blue",
}: {
  title: string;
  count: number;
  detail?: React.ReactNode;
  tone?: "blue" | "purple" | "green";
}) {
  const tones: Record<string, string> = {
    blue: "bg-blue-950/60 border-blue-800 text-blue-100",
    purple: "bg-purple-950/50 border-purple-800 text-purple-100",
    green: "bg-green-950/50 border-green-800 text-green-100",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${tones[tone]}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
          {title}
        </span>
        <span className="text-lg font-bold tabular-nums">n = {count}</span>
      </div>
      {detail ? <div className="mt-1 text-[11px] opacity-75">{detail}</div> : null}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center py-0.5" aria-hidden="true">
      <span className="text-blue-600 text-lg leading-none">↓</span>
    </div>
  );
}

function ExclusionBox({
  title,
  count,
  reasons,
}: {
  title: string;
  count: number;
  reasons?: Record<string, number>;
}) {
  return (
    <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-red-100">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
          {title}
        </span>
        <span className="text-sm font-bold tabular-nums">n = {count}</span>
      </div>
      {reasons && Object.keys(reasons).length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px] opacity-80">
          {Object.entries(reasons).map(([reason, n]) => (
            <li key={reason}>
              {reason} (n = {n})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Prisma2020Diagram({
  counts,
}: {
  counts: Prisma2020Counts;
}) {
  const perDatabase = counts.perDatabase || {};
  const databaseEntries = Object.entries(perDatabase).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const exclusionReasons: Record<string, number> = {
    ...(counts.automationRemoved > 0
      ? { "Removed by automated relevance filter": counts.automationRemoved }
      : {}),
    ...(counts.otherRemoved > 0
      ? { "Removed for other reasons": counts.otherRemoved }
      : {}),
  };

  const eligibilityReasons: Record<string, number> = { ...counts.eligibilityExcluded };

  return (
    <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">
          PRISMA 2020 Flow Diagram
        </h3>
        <span className="text-[10px] text-blue-400">
          Records identified → screened → included
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        <div className="space-y-0.5">
          <Stage
            title="Identification"
            count={counts.identified}
            tone="blue"
            detail={
              databaseEntries.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {databaseEntries.map(([db, n]) => (
                    <span
                      key={db}
                      className="bg-blue-900/60 text-blue-200 px-1.5 py-0.5 rounded text-[10px]"
                    >
                      {db}: {n}
                    </span>
                  ))}
                </div>
              ) : undefined
            }
          />
          <Arrow />
          <Stage
            title="Screening"
            count={counts.screened}
            tone="blue"
            detail={`${counts.screenedExcluded} record(s) excluded during screening`}
          />
          <Arrow />
          <Stage
            title="Reports sought for retrieval"
            count={counts.soughtForRetrieval}
            tone="blue"
            detail={`${counts.notRetrieved} report(s) not retrieved`}
          />
          <Arrow />
          <Stage
            title="Reports assessed for eligibility"
            count={counts.assessedForEligibility}
            tone="purple"
          />
          <Arrow />
          <Stage
            title="Studies included in review"
            count={counts.included}
            tone="green"
          />
        </div>

        <div className="space-y-3">
          <ExclusionBox
            title="Records removed before screening"
            count={counts.duplicatesRemoved}
            reasons={{ Duplicates: counts.duplicatesRemoved }}
          />
          {Object.keys(exclusionReasons).length > 0 && (
            <ExclusionBox
              title="Automated removals"
              count={counts.automationRemoved + counts.otherRemoved}
              reasons={exclusionReasons}
            />
          )}
          <ExclusionBox
            title="Records excluded at screening"
            count={counts.screenedExcluded}
          />
          <ExclusionBox
            title="Reports excluded with reasons"
            count={Object.values(eligibilityReasons).reduce((a, b) => a + b, 0)}
            reasons={eligibilityReasons}
          />
        </div>
      </div>
    </div>
  );
}
