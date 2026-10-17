"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Scatter, PieChart, Pie, Cell, ComposedChart,
  AreaChart, Area, Legend
} from "recharts";
import { Download, Play, RefreshCw, Type, Calculator, TrendingUp, Sigma } from "lucide-react";
import { downloadMarkdownAsWord } from "@/lib/exporters";
import {
  descriptiveStatistics,
  linearRegression,
  correlation,
  tTestOneSample,
  tTestTwoSample,
  wilcoxonRankSum,
  formatStat,
  type DescriptiveStats,
} from "@/lib/statistics";

const CHART_TYPES = [
  "Histogram", "Density Plot", "Bar Chart", "Pie Chart",
  "Scatter + Line", "Kaplan-Meier", "Forest Plot",
];

interface ChartDatum {
  name: string;
  value?: number;
  intervention?: number;
  control?: number;
  x?: number;
  y?: number;
  trend?: number;
}

interface ParsedRow {
  label: string;
  value: number;
  sd?: number;
  n?: number;
}

interface AnalysisInput {
  groupA: number[];
  groupB: number[];
  x: number[];
  y: number[];
}

const COLORS = ["#facc15", "#60a5fa", "#f87171", "#34d399", "#a78bfa", "#fb923c", "#f472b6", "#22d3ee"];

const DEFAULT_DATA_INPUT = [
  "IGRA + Phone: mean=78.5, SD=12.3, n=165",
  "IGRA only: mean=65.2, SD=14.1, n=148",
  "TST (Control): mean=52.8, SD=18.4, n=170",
  "No Screening: mean=34.1, SD=21.7, n=152",
].join("\n");

const DEFAULT_ANALYSIS_INPUT = [
  "# Raw samples for two-sample t-test / Wilcoxon rank-sum",
  "Group A: 78, 82, 75, 80, 79, 84, 77, 81, 76, 83",
  "Group B: 65, 68, 62, 70, 64, 66, 63, 69, 61, 67",
  "",
  "# Paired x/y data for linear regression & correlation",
  "x: 1, 2, 3, 4, 5, 6, 7, 8",
  "y: 2.1, 4.2, 6.1, 7.9, 10.2, 11.8, 14.1, 15.9",
].join("\n");

function parseDataInput(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const kv = line.match(/^([^:]+):\s*(.+)$/);
    if (kv) {
      const label = kv[1].trim();
      const rest = kv[2].trim();
      const meanMatch = rest.match(/mean\s*=\s*(-?\d+(?:\.\d+)?)/i);
      if (meanMatch) {
        const value = parseFloat(meanMatch[1]);
        const sdMatch = rest.match(/sd\s*=\s*(-?\d+(?:\.\d+)?)/i);
        const nMatch = rest.match(/(?:^|[,\s])n\s*=\s*(-?\d+(?:\.\d+)?)/i);
        if (!Number.isFinite(value)) continue;
        rows.push({
          label,
          value,
          sd: sdMatch ? parseFloat(sdMatch[1]) : undefined,
          n: nMatch ? parseFloat(nMatch[1]) : undefined,
        });
        continue;
      }
      if (/^-?\d+(?:\.\d+)?$/.test(rest)) {
        rows.push({ label, value: parseFloat(rest) });
      }
      continue;
    }

    if (line.includes(",")) {
      const parts = line.split(",");
      if (parts.length >= 2) {
        const label = parts[0].trim();
        const value = parseFloat(parts[1].trim());
        if (label && Number.isFinite(value)) rows.push({ label, value });
      }
    }
  }
  return rows;
}

function parseNumberList(text: string): number[] {
  return text
    .split(/[,\s;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseFloat(s))
    .filter((n) => Number.isFinite(n));
}

function parseAnalysisInput(text: string): AnalysisInput {
  const result: AnalysisInput = { groupA: [], groupB: [], x: [], y: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const kv = line.match(/^([^:]+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase();
    const values = parseNumberList(kv[2]);
    if (values.length === 0) continue;
    if (key === "a" || key === "group a" || key === "groupa" || key === "treatment" || key === "intervention") {
      result.groupA.push(...values);
    } else if (key === "b" || key === "group b" || key === "groupb" || key === "control" || key === "comparator") {
      result.groupB.push(...values);
    } else if (key === "x" || key === "independent" || key === "predictor") {
      result.x.push(...values);
    } else if (key === "y" || key === "dependent" || key === "outcome") {
      result.y.push(...values);
    }
  }
  return result;
}

function buildHistogram(values: number[], binCount = 10): ChartDatum[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ name: min.toFixed(1), value: values.length }];
  }
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    name: `${(min + i * width).toFixed(1)}-${(min + (i + 1) * width).toFixed(1)}`,
    value: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].value += 1;
  }
  return bins;
}

function movingAverage(values: number[], window = 3): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

function deriveChartData(type: string, rows: ParsedRow[]): ChartDatum[] {
  const values = rows.map((r) => r.value).filter((v) => Number.isFinite(v));

  switch (type) {
    case "Histogram":
    case "Density Plot":
      return buildHistogram(values);
    case "Bar Chart":
    case "Pie Chart":
    case "Forest Plot":
      return rows.map((r) => ({ name: r.label, value: r.value }));
    case "Scatter + Line": {
      const trend = movingAverage(values);
      return rows.map((r, i) => ({
        name: r.label,
        x: i + 1,
        y: r.value,
        value: r.value,
        trend: trend[i],
      }));
    }
    case "Kaplan-Meier": {
      const intervention = rows.filter((r) => /interven|treat|experiment/i.test(r.label));
      const control = rows.filter((r) => /control|placebo|comparator|standard|screening/i.test(r.label));
      if (intervention.length > 0 && control.length > 0) {
        const len = Math.max(intervention.length, control.length);
        return Array.from({ length: len }, (_, i) => ({
          name: intervention[i]?.label ?? control[i]?.label ?? `T${i + 1}`,
          intervention: intervention[i]?.value,
          control: control[i]?.value,
        }));
      }
      return rows.map((r) => ({ name: r.label, intervention: r.value }));
    }
    default:
      return rows.map((r) => ({ name: r.label, value: r.value }));
  }
}

function pct(n: number): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";
}

function pValueLabel(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< .001";
  return `= ${p.toFixed(3).replace(/^0/, "")}`;
}

export default function StatisticalAnalysisTab() {
  const [chartType, setChartType] = useState("Bar Chart");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>(() => parseDataInput(DEFAULT_DATA_INPUT));
  const [chartData, setChartData] = useState<ChartDatum[]>(() => deriveChartData("Bar Chart", parseDataInput(DEFAULT_DATA_INPUT)));
  const [dataInput, setDataInput] = useState(DEFAULT_DATA_INPUT);
  const [analysisInput, setAnalysisInput] = useState(DEFAULT_ANALYSIS_INPUT);
  const [analysisData, setAnalysisData] = useState<AnalysisInput>(() => parseAnalysisInput(DEFAULT_ANALYSIS_INPUT));
  const [testMu, setTestMu] = useState("0");
  const chartRef = useRef<HTMLDivElement>(null);

  const applyData = (type: string, text: string) => {
    const rows = parseDataInput(text);
    setParsedRows(rows);
    setChartData(deriveChartData(type, rows));
  };

  const handleGenerate = () => {
    applyData(chartType, dataInput);
    setAnalysisData(parseAnalysisInput(analysisInput));
  };

  const stats = useMemo<DescriptiveStats>(() => {
    const values = [
      ...analysisData.groupA,
      ...analysisData.groupB,
      ...analysisData.x,
      ...analysisData.y,
    ];
    return descriptiveStatistics(values);
  }, [analysisData]);

  const regression = useMemo(() => {
    if (analysisData.x.length < 2 || analysisData.y.length < 2) return null;
    return linearRegression(analysisData.x, analysisData.y);
  }, [analysisData]);

  const corr = useMemo(() => {
    if (analysisData.x.length < 2 || analysisData.y.length < 2) return null;
    return correlation(analysisData.x, analysisData.y);
  }, [analysisData]);

  const tTwo = useMemo(() => {
    if (analysisData.groupA.length < 2 || analysisData.groupB.length < 2) return null;
    return tTestTwoSample(analysisData.groupA, analysisData.groupB);
  }, [analysisData]);

  const wilcoxon = useMemo(() => {
    if (analysisData.groupA.length < 1 || analysisData.groupB.length < 1) return null;
    return wilcoxonRankSum(analysisData.groupA, analysisData.groupB);
  }, [analysisData]);

  const tOne = useMemo(() => {
    const mu = parseFloat(testMu);
    if (analysisData.groupA.length < 2 || !Number.isFinite(mu)) return null;
    return tTestOneSample(analysisData.groupA, mu);
  }, [analysisData, testMu]);

  const downloadUrl = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSvgFallback = (svgString: string) => {
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, "chart.svg");
    URL.revokeObjectURL(url);
  };

  const handleExportImage = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGElement;
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 400;
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        downloadSvgFallback(svgString);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          downloadSvgFallback(svgString);
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        downloadUrl(pngUrl, "chart.png");
        URL.revokeObjectURL(pngUrl);
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      downloadSvgFallback(svgString);
    };

    img.src = url;
  };

  const handleExportWord = async () => {
    const tableRows = parsedRows.map(
      (r) => `| ${r.label} | ${r.value} | ${r.sd ?? ""} | ${r.n ?? ""} |`
    );
    const parsedValues = parsedRows.map(
      (r) => `- ${r.label}: value=${r.value}${r.sd !== undefined ? `, SD=${r.sd}` : ""}${r.n !== undefined ? `, n=${r.n}` : ""}`
    );

    const descriptiveRows = [
      ["N", String(stats.n)],
      ["Mean", formatStat(stats.mean)],
      ["Median", formatStat(stats.median)],
      ["Standard deviation", formatStat(stats.standardDeviation)],
      ["Variance", formatStat(stats.variance)],
      ["Minimum", formatStat(stats.min)],
      ["Maximum", formatStat(stats.max)],
      ["Range", formatStat(stats.range)],
      ["Interquartile range", formatStat(stats.iqr)],
      ["Coefficient of variation", `${formatStat(stats.coefficientOfVariation)}%`],
      ["Skewness", formatStat(stats.skewness)],
      ["Kurtosis", formatStat(stats.kurtosis)],
    ].map(([k, v]) => `| ${k} | ${v} |`);

    const inference: string[] = [];
    if (tTwo) {
      inference.push(
        `**Independent-samples t-test:** t(${tTwo.df}) = ${formatStat(tTwo.t, 2)}, p ${pValueLabel(tTwo.pValue)}, mean difference = ${formatStat(tTwo.meanDifference)}${tTwo.cohenD !== null ? `, Cohen's d = ${formatStat(tTwo.cohenD, 2)}` : ""}.`
      );
    }
    if (wilcoxon) {
      inference.push(
        `**Wilcoxon rank-sum test:** W = ${formatStat(wilcoxon.statistic, 1)}, p ${wilcoxon.pValue !== null ? pValueLabel(wilcoxon.pValue) : "—"}.`
      );
    }
    if (tOne) {
      inference.push(
        `**One-sample t-test (μ₀ = ${testMu}):** t(${tOne.df}) = ${formatStat(tOne.t, 2)}, p ${pValueLabel(tOne.pValue)}, mean difference = ${formatStat(tOne.meanDifference)}.`
      );
    }
    if (regression) {
      inference.push(
        `**Linear regression:** ${regression.equation}, R² = ${pct(regression.rSquared)}, r = ${formatStat(regression.r)}.`
      );
    }
    if (corr) {
      inference.push(
        `**Correlation:** Pearson r = ${formatStat(corr.pearson)}${corr.spearman !== null ? `, Spearman ρ = ${formatStat(corr.spearman)}` : ""}.`
      );
    }

    const md = [
      `# Statistical Analysis — ${chartType}`,
      "",
      "## Data Table",
      "",
      "| Label | Mean/Value | SD | N |",
      "| --- | --- | --- | --- |",
      ...tableRows,
      "",
      "## Parsed Values",
      "",
      ...(parsedValues.length > 0 ? parsedValues : ["- No valid data rows parsed."]),
      "",
      "## Descriptive Statistics",
      "",
      "Computed with simple-statistics.",
      "",
      "| Statistic | Value |",
      "| --- | --- |",
      ...descriptiveRows,
      "",
      "## Inferential Statistics",
      "",
      ...(inference.length > 0 ? inference.map((i) => `- ${i}`) : ["- Provide two groups or x/y pairs in the Analysis Data input."]),
      "",
    ].join("\n");
    await downloadMarkdownAsWord(md, "statistical-analysis.docx");
  };

  const renderChart = () => {
    switch (chartType) {
      case "Histogram":
        return (
          <BarChart data={chartData as any}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" stroke="#60a5fa" tick={{ fontSize: 10 }} />
            <YAxis stroke="#60a5fa" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f", borderRadius: "8px" }} />
            <Bar dataKey="value" fill="#facc15" />
          </BarChart>
        );
      case "Density Plot":
        return (
          <AreaChart data={chartData as any}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" stroke="#60a5fa" tick={{ fontSize: 10 }} />
            <YAxis stroke="#60a5fa" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f", borderRadius: "8px" }} />
            <Area type="monotone" dataKey="value" stroke="#facc15" fill="#facc1540" />
          </AreaChart>
        );
      case "Bar Chart":
        return (
          <BarChart data={chartData as any}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" stroke="#60a5fa" />
            <YAxis stroke="#60a5fa" />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f" }} />
            <Bar dataKey="value" fill="#facc15" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case "Pie Chart":
        return (
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={140} label>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f" }} />
          </PieChart>
        );
      case "Scatter + Line": {
        const regressionPoints = analysisData.x.map((x, i) => ({
          x,
          y: analysisData.y[i],
          fitted: regression ? regression.line(x) : undefined,
        })).filter((p) => Number.isFinite(p.y));
        const scatterData = regressionPoints.length > 0 ? regressionPoints : chartData;
        return (
          <ComposedChart data={scatterData as any}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="x" type="number" stroke="#60a5fa" />
            <YAxis dataKey="y" type="number" stroke="#60a5fa" />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f" }} />
            <Scatter dataKey="y" name="Value" fill="#facc15" />
            {regression && <Line type="monotone" dataKey="fitted" name="Fitted" stroke="#60a5fa" strokeWidth={2} dot={false} />}
            <Legend />
          </ComposedChart>
        );
      }
      case "Kaplan-Meier":
        return (
          <LineChart data={chartData as any}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" stroke="#60a5fa" />
            <YAxis stroke="#60a5fa" />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f" }} />
            <Line type="monotone" dataKey="intervention" name="Intervention" stroke="#facc15" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="control" name="Control" stroke="#f87171" strokeWidth={2} dot={{ r: 4 }} />
            <Legend />
          </LineChart>
        );
      case "Forest Plot":
        return (
          <BarChart data={chartData as any} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis type="number" stroke="#60a5fa" />
            <YAxis type="category" dataKey="name" stroke="#60a5fa" tick={{ fontSize: 10 }} width={130} />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f" }} />
            <Bar dataKey="value" fill="#facc15" />
          </BarChart>
        );
      default:
        return (
          <LineChart data={chartData as any}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" stroke="#60a5fa" />
            <YAxis stroke="#60a5fa" />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f" }} />
            <Line type="monotone" dataKey="value" stroke="#facc15" strokeWidth={2} />
          </LineChart>
        );
    }
  };

  const statRows: [string, string][] = [
    ["N", String(stats.n)],
    ["Mean", formatStat(stats.mean)],
    ["Median", formatStat(stats.median)],
    ["SD", formatStat(stats.standardDeviation)],
    ["Variance", formatStat(stats.variance)],
    ["Min", formatStat(stats.min)],
    ["Max", formatStat(stats.max)],
    ["IQR", formatStat(stats.iqr)],
    ["CV", `${formatStat(stats.coefficientOfVariation)}%`],
    ["Skewness", formatStat(stats.skewness)],
    ["Kurtosis", formatStat(stats.kurtosis)],
  ];

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Statistical Analysis</h2>
        <p className="text-sm text-blue-300 mb-6">
          Visualize and analyze your research data with interactive statistical charts. Descriptive and inferential statistics are computed with <span className="font-mono text-yellow-300">simple-statistics</span>.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative">
            <select
              value={chartType}
              onChange={(e) => { setChartType(e.target.value); applyData(e.target.value, dataInput); }}
              className="appearance-none bg-blue-900/50 text-white border border-blue-800 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {CHART_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <svg className="w-4 h-4 text-blue-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <button
            onClick={handleGenerate}
            className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-5 py-2.5 rounded-lg flex items-center gap-2"
          >
            <Play size={16} />
            Generate Chart
          </button>
          <button
            onClick={() => { applyData(chartType, dataInput); setAnalysisData(parseAnalysisInput(analysisInput)); }}
            className="bg-blue-900/50 text-blue-200 px-4 py-2.5 rounded-lg hover:bg-blue-900/70"
            title="Recompute"
          >
            <RefreshCw size={16} />
          </button>
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleExportImage}
              className="text-sm bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 flex items-center gap-1"
            >
              <Download size={14} />
              Export Image
            </button>
            <button
              onClick={handleExportWord}
              className="text-sm bg-purple-900/50 text-purple-300 px-4 py-2 rounded-lg hover:bg-purple-900/70 flex items-center gap-1"
            >
              <Type size={14} />
              Export to Word
            </button>
          </div>
        </div>

        <div ref={chartRef} className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
          <ResponsiveContainer height={380}>
            {renderChart()}
          </ResponsiveContainer>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-blue-200 mb-2">Data Table Input (editable)</label>
          <textarea
            value={dataInput}
            onChange={(e) => setDataInput(e.target.value)}
            rows={5}
            className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm font-mono placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y"
          />
          <p className="mt-2 text-xs text-blue-400">
            One row per line: <span className="font-mono">Label: mean=78.5, SD=12.3, n=165</span>,{" "}
            <span className="font-mono">Label: 42</span>, or <span className="font-mono">Label,42</span>. Lines starting with # are ignored.
          </p>
        </div>
      </div>

      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <div className="flex items-center gap-2 mb-1">
          <Calculator size={18} className="text-yellow-400" />
          <h3 className="text-lg font-bold text-white">Statistician Workbench</h3>
        </div>
        <p className="text-sm text-blue-300 mb-5">
          Enter raw samples or paired data to run descriptive statistics, t-tests, Wilcoxon rank-sum, linear regression, and correlation.
        </p>

        <label className="block text-sm font-medium text-blue-200 mb-2">Analysis Data (editable)</label>
        <textarea
          value={analysisInput}
          onChange={(e) => setAnalysisInput(e.target.value)}
          rows={8}
          className="w-full bg-blue-950 border border-blue-800 text-white rounded-lg px-4 py-3 text-sm font-mono placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-xs text-blue-400">
            Use <span className="font-mono">Group A:</span> / <span className="font-mono">Group B:</span> for two-sample tests, or{" "}
            <span className="font-mono">x:</span> / <span className="font-mono">y:</span> for regression and correlation. Comma- or space-separated numbers.
          </p>
          <label className="ml-auto text-xs text-blue-300 flex items-center gap-2">
            One-sample μ₀
            <input
              value={testMu}
              onChange={(e) => setTestMu(e.target.value)}
              className="w-20 bg-blue-950 border border-blue-800 text-white rounded px-2 py-1 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mt-6">
          <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sigma size={16} className="text-yellow-400" />
              <h4 className="text-sm font-semibold text-white">Descriptive Statistics</h4>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {statRows.map(([k, v]) => (
                  <tr key={k} className="border-b border-blue-900/60 last:border-0">
                    <td className="py-1.5 text-blue-300">{k}</td>
                    <td className="py-1.5 text-right font-mono text-white">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-yellow-400" />
              <h4 className="text-sm font-semibold text-white">Inferential Statistics</h4>
            </div>
            <div className="space-y-3 text-sm">
              {!tTwo && !wilcoxon && !tOne && !regression && !corr && (
                <p className="text-blue-400">Add two groups or x/y pairs above to compute inferential statistics.</p>
              )}
              {tTwo && (
                <div className="border-b border-blue-900/60 pb-2">
                  <p className="text-blue-300 text-xs uppercase tracking-wide">Independent-samples t-test</p>
                  <p className="font-mono text-white">
                    t({tTwo.df}) = {formatStat(tTwo.t, 2)}, p {pValueLabel(tTwo.pValue)}
                  </p>
                  <p className="text-xs text-blue-400">
                    Mean difference = {formatStat(tTwo.meanDifference)}
                    {tTwo.cohenD !== null ? `, Cohen's d = ${formatStat(tTwo.cohenD, 2)}` : ""}
                  </p>
                </div>
              )}
              {wilcoxon && (
                <div className="border-b border-blue-900/60 pb-2">
                  <p className="text-blue-300 text-xs uppercase tracking-wide">Wilcoxon rank-sum</p>
                  <p className="font-mono text-white">
                    W = {formatStat(wilcoxon.statistic, 1)}
                    {wilcoxon.pValue !== null ? `, p ${pValueLabel(wilcoxon.pValue)}` : ""}
                  </p>
                </div>
              )}
              {tOne && (
                <div className="border-b border-blue-900/60 pb-2">
                  <p className="text-blue-300 text-xs uppercase tracking-wide">One-sample t-test (μ₀ = {testMu})</p>
                  <p className="font-mono text-white">
                    t({tOne.df}) = {formatStat(tOne.t, 2)}, p {pValueLabel(tOne.pValue)}
                  </p>
                  <p className="text-xs text-blue-400">Mean difference = {formatStat(tOne.meanDifference)}</p>
                </div>
              )}
              {regression && (
                <div className="border-b border-blue-900/60 pb-2">
                  <p className="text-blue-300 text-xs uppercase tracking-wide">Linear regression</p>
                  <p className="font-mono text-white">{regression.equation}</p>
                  <p className="text-xs text-blue-400">
                    R² = {formatStat(regression.rSquared)} ({pct(regression.rSquared)}), r = {formatStat(regression.r)}
                  </p>
                </div>
              )}
              {corr && (
                <div>
                  <p className="text-blue-300 text-xs uppercase tracking-wide">Correlation</p>
                  <p className="font-mono text-white">
                    Pearson r = {formatStat(corr.pearson)}
                    {corr.spearman !== null ? `, Spearman ρ = ${formatStat(corr.spearman)}` : ""}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
