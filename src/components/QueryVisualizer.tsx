"use client";

import React, { useState } from "react";
import { GitBranch, Eye, EyeOff, BarChart3 } from "lucide-react";
import { parseBooleanQuery, getQueryComplexity, type QueryTree } from "@/lib/query-visualizer";

interface QueryVisualizerProps {
  query: string;
  className?: string;
}

export default function QueryVisualizer({ query, className = "" }: QueryVisualizerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "concepts" | "stats">("concepts");
  
  if (!query || query.trim() === "") {
    return null;
  }
  
  const tree = parseBooleanQuery(query);
  const complexity = getQueryComplexity(tree);
  
  const renderNode = (node: any, depth = 0): React.ReactNode => {
    if (node.type === "term" && node.value) {
      // Clean up the term for display
      let displayValue = node.value.replace(/"/g, '');
      displayValue = displayValue.replace(/\[.*?\]/g, '');
      if (!displayValue || /^(AND|OR|NOT)$/.test(displayValue)) {
        return null;
      }
      return (
        <span
          key={node.id}
          className="inline-flex items-center px-2 py-1 m-0.5 bg-blue-600/40 text-blue-200 rounded border border-blue-500/50 text-xs"
        >
          {displayValue}
        </span>
      );
    }
    
    if (node.type === "operator") {
      return (
        <div key={node.id} className="flex flex-wrap items-center gap-1 my-1">
          {node.children && node.children.map((child: any, idx: number) => (
            <React.Fragment key={child.id}>
              {renderNode(child, depth + 1)}
              {idx < node.children.length - 1 && (
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  node.operator === "AND" ? "bg-yellow-600/40 text-yellow-200 border border-yellow-500/50" :
                  node.operator === "OR" ? "bg-green-600/40 text-green-200 border border-green-500/50" :
                  "bg-red-600/40 text-red-200 border border-red-500/50"
                }`}>
                  {node.operator}
                </span>
              )}
            </React.Fragment>
          ))}
        </div>
      );
    }
    
    if (node.type === "group" && node.children) {
      return (
        <div key={node.id} className="inline-flex flex-wrap items-center border-l-2 border-blue-500/50 pl-2 ml-1">
          {node.children.map((child: any) => renderNode(child, depth + 1))}
        </div>
      );
    }
    
    return null;
  };
  
  return (
    <div className={`bg-[#0a1530] border border-blue-900/50 rounded-lg ${className}`}>
      <div className="flex items-center justify-between p-3 border-b border-blue-900/50">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-yellow-400" />
          <span className="text-sm font-semibold text-white">Query Structure (SearchRefiner-inspired)</span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
        >
          {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
          {isExpanded ? "Hide" : "Show"}
        </button>
      </div>
      
      {isExpanded && (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("concepts")}
              className={`px-2 py-1 text-xs rounded ${
                viewMode === "concepts" ? "bg-blue-600 text-white" : "bg-blue-900/50 text-blue-300 hover:bg-blue-900"
              }`}
            >
              Concepts
            </button>
            <button
              onClick={() => setViewMode("stats")}
              className={`px-2 py-1 text-xs rounded ${
                viewMode === "stats" ? "bg-blue-600 text-white" : "bg-blue-900/50 text-blue-300 hover:bg-blue-900"
              }`}
            >
              <BarChart3 size={12} className="inline mr-1" />
              Stats
            </button>
          </div>
          
          {viewMode === "concepts" && (
            <div>
              <div className="text-xs text-blue-300 mb-2">Identified Concepts:</div>
              <div className="flex flex-wrap gap-1">
                {tree.concepts.map((concept, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-cyan-600/40 text-cyan-200 rounded border border-cyan-500/50 text-xs"
                  >
                    {concept}
                  </span>
                ))}
              </div>
              {tree.concepts.length === 0 && (
                <div className="text-xs text-blue-400">No distinct concepts extracted</div>
              )}
            </div>
          )}
          
          {viewMode === "stats" && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-blue-950/40 p-2 rounded">
                <div className="text-blue-400">Terms</div>
                <div className="text-white font-semibold">{complexity.terms}</div>
              </div>
              <div className="bg-blue-950/40 p-2 rounded">
                <div className="text-blue-400">Operators</div>
                <div className="text-white font-semibold">{complexity.operators}</div>
              </div>
              <div className="bg-blue-950/40 p-2 rounded">
                <div className="text-blue-400">Groups</div>
                <div className="text-white font-semibold">{complexity.groups}</div>
              </div>
              <div className="bg-blue-950/40 p-2 rounded">
                <div className="text-blue-400">Complex</div>
                <div className="text-white font-semibold">{complexity.hasNesting ? "Yes" : "No"}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
