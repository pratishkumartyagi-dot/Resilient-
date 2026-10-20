"use client";

import React, { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Copy,
  FileWarning,
  Hash,
  Info,
  ListTree,
  Type,
} from "lucide-react";
import type {
  DataProfile,
  DatasetComparison,
  HistogramBin,
  ProfileAlert,
} from "@/lib/data-profiling";
import { ALERT_LABELS } from "@/lib/data-profiling";

function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return Number(value.toFixed(digits)).toLocaleString();
}

function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

const SEVERITY_STYLES: Record<string, { row: string; badge: string }> = {
  error: { row: "bg-red-950/40", badge: "bg-red-900/70 text-red-200" },
  warning: { row: "bg-amber-950/30", badge: "bg-amber-900/60 text-amber-200" },
  info: { row: "", badge: "bg-blue-900/60 text-blue-200" },
};

const TYPE_STYLES: Record<string, string> = {
  Numeric: "bg-emerald-900/50 text-emerald-200",
  Integer: "bg-emerald-900/50 text-emerald-200",
  Date: "bg-purple-900/50 text-purple-200",
  Text: "bg-orange-900/50 text-orange-200",
  Categorical: "bg-blue-900/50 text-blue-200",
  Boolean: "bg-teal-900/50 text-teal-200",
  ID: "bg-slate-700 text-slate-200",
  Constant: "bg-red-900/50 text-red-200",
  Empty: "bg-red-900/50 text-red-200",
  URL: "bg-cyan-900/50 text-cyan-200",
  Email: "bg-cyan-900/50 text-cyan-200",
};

function Panel({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 border border-blue-800 rounded-lg bg-blue-950/40 p-4">
      <h4 className="text-sm font-semibold text-blue-100 mb-1 flex items-center gap-2">
        {icon}
        {title}
      </h4>
      {subtitle && <p className="text-[11px] text-blue-400 mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}

function AlertTable({ alerts }: { alerts: ProfileAlert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="text-xs text-emerald-300 flex items-center gap-1.5">
        <CheckCircle2 size={13} /> No data quality alerts were raised.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-blue-800 text-blue-400">
            <th className="text-left pb-2 pr-3">Severity</th>
            <th className="text-left pb-2 pr-3">Check</th>
            <th className="text-left pb-2 pr-3">Issue</th>
            <th className="text-left pb-2">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-blue-900/60">
          {alerts.map((alert, index) => {
            const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
            return (
              <tr key={`${alert.type}-${alert.column || "dataset"}-${index}`} className={style.row}>
                <td className="py-1.5 pr-3">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${style.badge}`}>
                    {alert.severity}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-blue-300 whitespace-nowrap">
                  {ALERT_LABELS[alert.type] || alert.type}
                </td>
                <td className="py-1.5 pr-3 text-blue-100">{alert.title}</td>
                <td className="py-1.5 text-blue-300">{alert.description}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistogramChart({ bins }: { bins: HistogramBin[] }) {
  if (bins.length === 0) return null;
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 4, right: 4, bottom: 4, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
          <XAxis dataKey="label" stroke="#60a5fa" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
          <YAxis stroke="#60a5fa" tick={{ fontSize: 9 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0d1b3e",
              border: "1px solid #1e3a5f",
              borderRadius: "8px",
              fontSize: 11,
            }}
          />
          <Bar dataKey="count" fill="#facc15" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DataProfilePanels({
  profile,
  comparison,
}: {
  profile: DataProfile;
  comparison?: DatasetComparison | null;
}) {
  const [showAllCorrelations, setShowAllCorrelations] = useState(false);
  const [histogramColumn, setHistogramColumn] = useState<string>(
    profile.numericProfiles[0]?.name || ""
  );

  const errorCount = profile.alerts.filter((a) => a.severity === "error").length;
  const warningCount = profile.alerts.filter((a) => a.severity === "warning").length;
  const infoCount = profile.alerts.filter((a) => a.severity === "info").length;
  const correlations = showAllCorrelations
    ? profile.correlationMatrix
    : profile.correlationMatrix.slice(0, 12);
  const selectedHistogram = profile.histograms[histogramColumn];

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Records", value: profile.rowCount.toLocaleString() },
          { label: "Variables", value: profile.columnCount },
          { label: "Completeness", value: pct(profile.quality.completeness) },
          { label: "Missing cells", value: profile.quality.missingCells.toLocaleString() },
          { label: "Duplicate rows", value: profile.duplicateCount.toLocaleString() },
          { label: "Memory", value: profile.summary.memoryFootprint },
          { label: "Alerts (E/W/I)", value: `${errorCount}/${warningCount}/${infoCount}` },
        ].map((card) => (
          <div key={card.label} className="bg-blue-950 border border-blue-800 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-blue-400">{card.label}</div>
            <div className="text-lg font-bold text-white mt-0.5">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      <Panel
        title="Alerts"
        icon={<AlertTriangle size={14} className="text-amber-400" />}
        subtitle="Automatic data-quality checks — the same warnings the fg-data-profiling report raises."
      >
        <AlertTable alerts={profile.alerts} />
      </Panel>

      {/* Types */}
      <Panel
        title="Variable types"
        icon={<ListTree size={14} className="text-yellow-400" />}
        subtitle="Type inference per column, with the share of values that agree with the inferred type."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-blue-800 text-blue-400">
                <th className="text-left pb-2 pr-3">Variable</th>
                <th className="text-left pb-2 pr-3">Type</th>
                <th className="text-right pb-2 pr-3">Distinct</th>
                <th className="text-right pb-2 pr-3">Distinct %</th>
                <th className="text-right pb-2 pr-3">Confidence</th>
                <th className="text-left pb-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-900/60 text-blue-200">
              {profile.types.map((t) => (
                <tr key={t.name} className="hover:bg-blue-950/50">
                  <td className="py-1.5 pr-3 font-mono">{t.name}</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        TYPE_STYLES[t.type] || "bg-blue-900/50 text-blue-200"
                      }`}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{t.distinct}</td>
                  <td className="py-1.5 pr-3 text-right">{pct(t.distinctPct)}</td>
                  <td className="py-1.5 pr-3 text-right">{pct(t.confidence * 100, 0)}</td>
                  <td className="py-1.5 text-blue-300">{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Numerical variables */}
      {profile.numericProfiles.length > 0 && (
        <Panel
          title="Numerical variables"
          icon={<BarChart3 size={14} className="text-yellow-400" />}
          subtitle="Descriptive statistics with distribution histograms."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-blue-800 text-blue-400">
                  {[
                    "Variable", "n", "Missing", "Mean", "SD", "Median", "Mode", "Min", "Max",
                    "IQR", "CV %", "Skew", "Kurtosis", "Outliers", "Zeros", "Normal?",
                  ].map((h) => (
                    <th key={h} className="text-left pb-2 pr-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/60 text-blue-200">
                {profile.numericProfiles.map((c) => (
                  <tr key={c.name} className="hover:bg-blue-950/50">
                    <td className="py-1.5 pr-3 font-mono">{c.name}</td>
                    <td className="py-1.5 pr-3">{c.count}</td>
                    <td className="py-1.5 pr-3">{c.missing} ({pct(c.missingPct)})</td>
                    <td className="py-1.5 pr-3">{fmt(c.mean)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.sd)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.median)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.mode)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.min)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.max)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.iqr)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.cv, 1)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.skewness, 2)}</td>
                    <td className="py-1.5 pr-3">{fmt(c.kurtosis, 2)}</td>
                    <td className="py-1.5 pr-3">{c.outlierCount}</td>
                    <td className="py-1.5 pr-3">{c.zeroCount}</td>
                    <td className="py-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          c.normality.isNormal
                            ? "bg-emerald-900/40 text-emerald-300"
                            : "bg-amber-900/40 text-amber-300"
                        }`}
                      >
                        {c.normality.isNormal ? "yes" : "no"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(profile.histograms).length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <select
                  value={histogramColumn}
                  onChange={(e) => setHistogramColumn(e.target.value)}
                  className="bg-blue-950 border border-blue-800 text-white text-xs rounded px-2 py-1"
                >
                  {Object.keys(profile.histograms).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <span className="text-[11px] text-blue-400">distribution</span>
              </div>
              <HistogramChart bins={selectedHistogram || []} />
            </div>
          )}
        </Panel>
      )}

      {/* Categorical variables */}
      {profile.categoricalProfiles.length > 0 && (
        <Panel
          title="Categorical variables"
          icon={<Hash size={14} className="text-yellow-400" />}
          subtitle="Frequency tables, class imbalance and Shannon entropy (0 = one category, log2(k) = perfectly balanced)."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-blue-800 text-blue-400">
                  <th className="text-left pb-2 pr-3">Variable</th>
                  <th className="text-right pb-2 pr-3">Distinct</th>
                  <th className="text-left pb-2 pr-3">Mode</th>
                  <th className="text-right pb-2 pr-3">Imbalance</th>
                  <th className="text-right pb-2 pr-3">Entropy</th>
                  <th className="text-right pb-2 pr-3">Missing</th>
                  <th className="text-left pb-2">Top categories</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/60 text-blue-200">
                {profile.categoricalProfiles.map((c) => (
                  <tr key={c.name} className="hover:bg-blue-950/50 align-top">
                    <td className="py-1.5 pr-3 font-mono">{c.name}</td>
                    <td className="py-1.5 pr-3 text-right">{c.distinct}</td>
                    <td className="py-1.5 pr-3">
                      {c.mode} <span className="text-blue-400">({pct(c.modePct)})</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <span className={c.isImbalanced ? "text-amber-300" : ""}>
                        {fmt(c.imbalanceRatio, 1)}×
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmt(c.entropy, 2)}</td>
                    <td className="py-1.5 pr-3 text-right">{c.missing}</td>
                    <td className="py-1.5 text-blue-300">
                      {c.topCategories.slice(0, 5).map((t) => (
                        <span key={t.value} className="inline-block mr-2">
                          {t.value} ({t.count})
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Temporal variables */}
      {profile.dateProfiles.length > 0 && (
        <Panel
          title="Temporal variables"
          icon={<Clock size={14} className="text-yellow-400" />}
          subtitle="Date ranges and the period covered by each column."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-blue-800 text-blue-400">
                  <th className="text-left pb-2 pr-3">Variable</th>
                  <th className="text-left pb-2 pr-3">Range</th>
                  <th className="text-right pb-2 pr-3">Span (days)</th>
                  <th className="text-left pb-2 pr-3">Granularity</th>
                  <th className="text-right pb-2 pr-3">Distinct</th>
                  <th className="text-right pb-2">Missing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/60 text-blue-200">
                {profile.dateProfiles.map((d) => (
                  <tr key={d.name} className="hover:bg-blue-950/50">
                    <td className="py-1.5 pr-3 font-mono">{d.name}</td>
                    <td className="py-1.5 pr-3">{d.min} → {d.max}</td>
                    <td className="py-1.5 pr-3 text-right">{d.rangeDays}</td>
                    <td className="py-1.5 pr-3">{d.granularity}</td>
                    <td className="py-1.5 pr-3 text-right">{d.distinct}</td>
                    <td className="py-1.5 pr-3 text-right">{d.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Text variables */}
      {profile.textProfiles.length > 0 && (
        <Panel
          title="Text variables"
          icon={<Type size={14} className="text-yellow-400" />}
          subtitle="Character repertoire — casing balance, Unicode scripts and ASCII blocks."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-blue-800 text-blue-400">
                  <th className="text-left pb-2 pr-3">Variable</th>
                  <th className="text-right pb-2 pr-3">Chars</th>
                  <th className="text-right pb-2 pr-3">Words</th>
                  <th className="text-right pb-2 pr-3">Avg len</th>
                  <th className="text-right pb-2 pr-3">Upper</th>
                  <th className="text-right pb-2 pr-3">Lower</th>
                  <th className="text-right pb-2 pr-3">Non-ASCII</th>
                  <th className="text-left pb-2 pr-3">Scripts</th>
                  <th className="text-left pb-2">Common words</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/60 text-blue-200">
                {profile.textProfiles.map((t) => (
                  <tr key={t.name} className="hover:bg-blue-950/50">
                    <td className="py-1.5 pr-3 font-mono">{t.name}</td>
                    <td className="py-1.5 pr-3 text-right">{t.charCount}</td>
                    <td className="py-1.5 pr-3 text-right">{t.wordCount}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(t.avgWordLength, 1)}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(t.uppercasePct)}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(t.lowercasePct)}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(t.nonAsciiPct)}</td>
                    <td className="py-1.5 pr-3 text-blue-300">
                      {t.scripts.map((s) => `${s.script} ${pct(s.pct)}`).join(", ") || "—"}
                    </td>
                    <td className="py-1.5 text-blue-300">
                      {t.topWords.slice(0, 5).map((w) => `${w.word} (${w.count})`).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Correlations */}
      {profile.correlationMatrix.length > 0 && (
        <Panel
          title="Correlations"
          icon={<BarChart3 size={14} className="text-yellow-400" />}
          subtitle="Pearson r with the Spearman rank correlation, so monotonic but non-linear links stay visible."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-blue-800 text-blue-400">
                  <th className="text-left pb-2 pr-3">Variable 1</th>
                  <th className="text-left pb-2 pr-3">Variable 2</th>
                  <th className="text-right pb-2 pr-3">Pearson r</th>
                  <th className="text-right pb-2 pr-3">Spearman ρ</th>
                  <th className="text-right pb-2 pr-3">p-value</th>
                  <th className="text-right pb-2 pr-3">n</th>
                  <th className="text-left pb-2">Strength</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/60 text-blue-200">
                {correlations.map((c) => (
                  <tr key={`${c.var1}-${c.var2}`} className="hover:bg-blue-950/50">
                    <td className="py-1.5 pr-3 font-mono">{c.var1}</td>
                    <td className="py-1.5 pr-3 font-mono">{c.var2}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(c.r)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(c.spearman)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(c.pValue, 4)}</td>
                    <td className="py-1.5 pr-3 text-right">{c.n}</td>
                    <td className="py-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          c.strength === "strong"
                            ? "bg-red-900/50 text-red-200"
                            : c.strength === "moderate"
                              ? "bg-amber-900/50 text-amber-200"
                              : "bg-blue-900/50 text-blue-200"
                        }`}
                      >
                        {c.strength}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {profile.correlationMatrix.length > 12 && (
            <button
              onClick={() => setShowAllCorrelations((v) => !v)}
              className="mt-2 text-[11px] bg-blue-900/50 text-blue-200 px-3 py-1 rounded hover:bg-blue-900/70"
            >
              {showAllCorrelations
                ? "Show top 12"
                : `Show all ${profile.correlationMatrix.length} pairs`}
            </button>
          )}
        </Panel>
      )}

      {/* Missing values */}
      <Panel
        title="Missing values"
        icon={<FileWarning size={14} className="text-amber-400" />}
        subtitle="Per-column missingness, the joint missingness patterns and how the gaps correlate across columns."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h5 className="text-xs text-blue-300 mb-1">Per column</h5>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <tbody className="divide-y divide-blue-900/60 text-blue-200">
                  {profile.missingAnalysis.perColumn.map((c) => (
                    <tr key={c.column}>
                      <td className="py-1 pr-3 font-mono">{c.column}</td>
                      <td className="py-1 pr-3 text-right">{c.missing}</td>
                      <td className="py-1 text-right">
                        <span className={c.missingPct >= 10 ? "text-amber-300" : ""}>
                          {pct(c.missingPct)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h5 className="text-xs text-blue-300 mb-1">Missingness patterns</h5>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <tbody className="divide-y divide-blue-900/60 text-blue-200">
                  {profile.missingAnalysis.patterns.slice(0, 12).map((p, i) => (
                    <tr key={`${p.columns.join("|")}-${i}`}>
                      <td className="py-1 pr-3 font-mono">
                        {p.columns.join(", ") || "(complete rows)"}
                      </td>
                      <td className="py-1 pr-3 text-right">{p.count}</td>
                      <td className="py-1 text-right">{pct(p.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {profile.missingAnalysis.correlations.length > 0 && (
              <>
                <h5 className="text-xs text-blue-300 mt-3 mb-1">
                  Missingness correlation (φ)
                </h5>
                <ul className="text-[11px] text-blue-300 space-y-0.5">
                  {profile.missingAnalysis.correlations.slice(0, 6).map((c) => (
                    <li key={`${c.var1}-${c.var2}`}>
                      {c.var1} ↔ {c.var2}: {fmt(c.r)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </Panel>

      {/* Duplicate rows */}
      {profile.duplicates.length > 0 && (
        <Panel
          title="Duplicate rows"
          icon={<Copy size={14} className="text-amber-400" />}
          subtitle={`${profile.duplicateCount} duplicated row(s) across ${profile.duplicates.length} pattern(s).`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-blue-800 text-blue-400">
                  <th className="text-left pb-2 pr-3">Copies</th>
                  <th className="text-left pb-2">Example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/60 text-blue-200">
                {profile.duplicates.slice(0, 10).map((d, i) => (
                  <tr key={`${d.hash}-${i}`}>
                    <td className="py-1.5 pr-3">{d.count}</td>
                    <td className="py-1.5 font-mono text-[10px] break-all">
                      {Object.entries(d.example)
                        .slice(0, 6)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(" | ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Time series */}
      {profile.timeSeries.length > 0 && (
        <Panel
          title="Time series"
          icon={<Clock size={14} className="text-yellow-400" />}
          subtitle="Trend, sampling frequency, autocorrelation (ACF) and partial autocorrelation (PACF)."
        >
          {profile.timeSeries.map((ts) => (
            <div key={`${ts.dateColumn}-${ts.valueColumn}`} className="mb-4 last:mb-0">
              <p className="text-xs text-blue-200 font-semibold mb-1">
                {ts.valueColumn} over {ts.dateColumn}
              </p>
              <ul className="text-[11px] text-blue-300 grid grid-cols-2 md:grid-cols-4 gap-x-4 mb-2">
                <li>n = {ts.n}</li>
                <li>frequency: {ts.frequency}</li>
                <li>
                  trend: {ts.trend.direction} (R² {fmt(ts.trend.r2)})
                </li>
                <li>
                  seasonality:{" "}
                  {ts.seasonality.period
                    ? `lag ${ts.seasonality.period} (${fmt(ts.seasonality.strength)})`
                    : "not detected"}
                </li>
              </ul>
              <div className="h-36 mb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ts.series} margin={{ top: 4, right: 4, bottom: 4, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                    <XAxis dataKey="date" stroke="#60a5fa" tick={{ fontSize: 8 }} />
                    <YAxis stroke="#60a5fa" tick={{ fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0d1b3e",
                        border: "1px solid #1e3a5f",
                        borderRadius: "8px",
                        fontSize: 11,
                      }}
                    />
                    <Line dataKey="value" stroke="#facc15" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <h6 className="text-[10px] uppercase tracking-wide text-blue-400 mb-1">ACF</h6>
                  <ul className="text-[10px] text-blue-300 space-y-0.5 max-h-32 overflow-y-auto">
                    {ts.acf.map((a) => (
                      <li key={a.lag}>
                        lag {a.lag}: {fmt(a.acf)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h6 className="text-[10px] uppercase tracking-wide text-blue-400 mb-1">PACF</h6>
                  <ul className="text-[10px] text-blue-300 space-y-0.5 max-h-32 overflow-y-auto">
                    {ts.pacf.map((a) => (
                      <li key={a.lag}>
                        lag {a.lag}: {fmt(a.pacf)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {/* Comparison */}
      {comparison && (
        <Panel
          title="Dataset comparison"
          icon={<ListTree size={14} className="text-yellow-400" />}
          subtitle={`${comparison.left.name} (${comparison.left.rowCount} rows) vs ${comparison.right.name} (${comparison.right.rowCount} rows)`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="bg-blue-950 border border-blue-800 rounded-lg p-2">
              <div className="text-[10px] text-blue-400">Shared columns</div>
              <div className="text-base font-bold text-white">{comparison.sharedColumns}</div>
            </div>
            <div className="bg-blue-950 border border-blue-800 rounded-lg p-2">
              <div className="text-[10px] text-blue-400">Only in {comparison.left.name}</div>
              <div className="text-base font-bold text-white">{comparison.onlyLeft.length}</div>
            </div>
            <div className="bg-blue-950 border border-blue-800 rounded-lg p-2">
              <div className="text-[10px] text-blue-400">Only in {comparison.right.name}</div>
              <div className="text-base font-bold text-white">{comparison.onlyRight.length}</div>
            </div>
            <div className="bg-blue-950 border border-blue-800 rounded-lg p-2">
              <div className="text-[10px] text-blue-400">Changed</div>
              <div className="text-base font-bold text-white">{comparison.changedColumns.length}</div>
            </div>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-blue-800 text-blue-400">
                  <th className="text-left pb-2 pr-3">Column</th>
                  <th className="text-left pb-2 pr-3">Left type</th>
                  <th className="text-left pb-2 pr-3">Right type</th>
                  <th className="text-right pb-2 pr-3">Left missing</th>
                  <th className="text-right pb-2 pr-3">Right missing</th>
                  <th className="text-left pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/60 text-blue-200">
                {comparison.columnComparisons.map((c) => (
                  <tr key={c.name} className="hover:bg-blue-950/50">
                    <td className="py-1.5 pr-3 font-mono">{c.name}</td>
                    <td className="py-1.5 pr-3">{c.leftType}</td>
                    <td className="py-1.5 pr-3">{c.rightType}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(c.leftMissingPct)}</td>
                    <td className="py-1.5 pr-3 text-right">{pct(c.rightMissingPct)}</td>
                    <td className="py-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          c.status === "same"
                            ? "bg-emerald-900/40 text-emerald-300"
                            : c.status === "changed"
                              ? "bg-amber-900/40 text-amber-300"
                              : "bg-red-900/40 text-red-200"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Reproduction */}
      <Panel
        title="Reproduction"
        icon={<Info size={14} className="text-blue-300" />}
        subtitle="Technical details of this analysis run."
      >
        <ul className="text-[11px] text-blue-300 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0.5">
          <li>Engine: {profile.reproduction.engine} v{profile.reproduction.engineVersion}</li>
          <li>Generated: {new Date(profile.reproduction.generatedAt).toLocaleString()}</li>
          <li>Duration: {profile.reproduction.durationMs} ms</li>
          <li>Records / variables: {profile.reproduction.rowCount} / {profile.reproduction.columnCount}</li>
          {Object.entries(profile.reproduction.configuration).map(([key, value]) => (
            <li key={key}>{key}: {value}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
