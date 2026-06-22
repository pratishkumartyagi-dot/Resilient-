"use client";

import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ScatterChart, Scatter, PieChart, Pie, Cell,
  AreaChart, Area, Legend
} from "recharts";
import { Download, Play, RefreshCw, Type } from "lucide-react";

const CHART_TYPES = [
  "Histogram", "Density Plot", "Bar Chart", "Pie Chart",
  "Scatter + Line", "Kaplan-Meier", "Forest Plot",
];

interface ChartDatum {
  name: string;
  value?: number;
  intervention?: number;
  control?: number;
  A?: number;
  B?: number;
  C?: number;
  D?: number;
  x?: number;
  y?: number;
}

const COLORS = ["#facc15", "#60a5fa", "#f87171", "#34d399", "#a78bfa", "#fb923c", "#f472b6", "#22d3ee"];

const generateMockChartData = (type: string): ChartDatum[] => {
  switch (type) {
    case "Histogram":
    case "Density Plot":
      return Array.from({ length: 15 }, (_, i) => ({
        name: `${(i * 2 - 14)} to ${(i * 2 - 12)}`,
        value: Math.floor(Math.random() * 50 + 5 + 20 * Math.exp(-((i - 7) ** 2) / 8)),
      }));
    case "Bar Chart":
      return [
        { name: "TST", value: 78 }, { name: "IGRA", value: 95 },
        { name: "Xpert", value: 91 }, { name: "Culture", value: 99 },
      ];
    case "Pie Chart":
      return [
        { name: "Sensitivity", value: 91 }, { name: "Specificity", value: 94 },
        { name: "PPV", value: 68 }, { name: "NPV", value: 99 },
      ];
    case "Scatter + Line":
      return Array.from({ length: 30 }, (_, i) => ({
        name: `point-${i}`,
        value: 50 + Math.random() * 50 + Math.random() * 20,
        x: Math.random() * 100,
        y: 50 + Math.random() * 50 + Math.random() * 20,
      }));
    case "Kaplan-Meier":
      return [
        { name: "0 mo", intervention: 100, control: 100 },
        { name: "3 mo", intervention: 95, control: 91 },
        { name: "6 mo", intervention: 88, control: 79 },
        { name: "9 mo", intervention: 82, control: 70 },
        { name: "12 mo", intervention: 76, control: 62 },
        { name: "18 mo", intervention: 69, control: 54 },
        { name: "24 mo", intervention: 64, control: 48 },
      ];
    case "Forest Plot":
      return [
        { name: "Study 1 (Nigeria)", value: 1.45 },
        { name: "Study 2 (TX, USA)", value: 2.32 },
        { name: "Study 3 (China)", value: 1.12 },
        { name: "Study 4 (India)", value: 1.89 },
        { name: "Pooled", value: 1.65 },
      ];
    default:
      return Array.from({ length: 8 }, (_, i) => ({ name: `${i + 1}`, value: Math.floor(Math.random() * 100 + 10) }));
  }
};

const mockTableData = [
  { id: 1, group: "IGRA + Phone", mean: 78.5, sd: 12.3, n: 165 },
  { id: 2, group: "IGRA only", mean: 65.2, sd: 14.1, n: 148 },
  { id: 3, group: "TST (Control)", mean: 52.8, sd: 18.4, n: 170 },
  { id: 4, group: "No Screening", mean: 34.1, sd: 21.7, n: 152 },
];

export default function StatisticalAnalysisTab() {
  const [chartType, setChartType] = useState("Bar Chart");
  const [chartData, setChartData] = useState<ChartDatum[]>(generateMockChartData("Bar Chart"));
  const [dataInput, setDataInput] = useState(
    mockTableData.map((r) => `${r.group}: mean=${r.mean}, SD=${r.sd}, n=${r.n}`).join("\n")
  );

  const handleGenerate = () => {
    const newData = generateMockChartData(chartType);
    setChartData(newData);
  };

  const handleExport = () => {
    alert(`Exporting ${chartType} chart as image...`);
  };

  const renderChart = () => {
    switch (chartType) {
      case "Histogram":
      case "Density Plot":
        return (
          <BarChart data={chartData as any}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" stroke="#60a5fa" tick={{ fontSize: 10 }} />
            <YAxis stroke="#60a5fa" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f", borderRadius: "8px" }} />
            {chartType === "Histogram" ? <Bar dataKey="value" fill="#facc15" /> : <Area type="monotone" dataKey="value" stroke="#facc15" fill="#facc1540" />}
          </BarChart>
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
      case "Scatter + Line":
        return (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" stroke="#60a5fa" type="category" />
            <YAxis stroke="#60a5fa" type="number" />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f" }} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={chartData} fill="#facc15" />
          </ScatterChart>
        );
      case "Kaplan-Meier":
        return (
          <LineChart data={chartData as any}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="name" stroke="#60a5fa" />
            <YAxis stroke="#60a5fa" domain={[40, 100]} />
            <Tooltip contentStyle={{ backgroundColor: "#0d1b3e", border: "1px solid #1e3a5f" }} />
            <Line type="monotone" dataKey="intervention" name="IGRA + Reminders" stroke="#facc15" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="control" name="Standard TST" stroke="#f87171" strokeWidth={2} dot={{ r: 4 }} />
            <Legend />
          </LineChart>
        );
      case "Forest Plot":
        return (
          <BarChart data={chartData as any} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis type="number" stroke="#60a5fa" domain={[0, 3]} />
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

  return (
    <div className="space-y-6">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold text-white mb-1">Statistical Analysis</h2>
        <p className="text-sm text-blue-300 mb-6">
          Visualize and analyze your research data with interactive statistical charts.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative">
            <select
              value={chartType}
              onChange={(e) => { setChartType(e.target.value); setChartData(generateMockChartData(e.target.value)); }}
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
            onClick={() => setChartData(generateMockChartData(chartType))}
            className="bg-blue-900/50 text-blue-200 px-4 py-2.5 rounded-lg hover:bg-blue-900/70"
          >
            <RefreshCw size={16} />
          </button>
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleExport}
              className="text-sm bg-green-900/50 text-green-300 px-4 py-2 rounded-lg hover:bg-green-900/70 flex items-center gap-1"
            >
              <Download size={14} />
              Export Image
            </button>
            <button
              onClick={() => alert("Exporting chart + table to Word document...")}
              className="text-sm bg-purple-900/50 text-purple-300 px-4 py-2 rounded-lg hover:bg-purple-900/70 flex items-center gap-1"
            >
              <Type size={14} />
              Export to Word
            </button>
          </div>
        </div>

        <div className="bg-blue-950/50 border border-blue-900 rounded-lg p-4">
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
        </div>
      </div>
    </div>
  );
}
