"use client";

import React, { useEffect, useState } from "react";
import { Cpu, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { onModelProgress } from "@/lib/local-llm";

export default function ModelLoadingIndicator() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unsub = onModelProgress((p, s) => {
      setProgress(p);
      setStatus(s);
      setVisible(true);
    });
    return unsub;
  }, []);

  // Auto-hide shortly after the model is ready.
  useEffect(() => {
    if (progress >= 100 && !status.toLowerCase().startsWith("error")) {
      const t = setTimeout(() => setVisible(false), 2500);
      return () => clearTimeout(t);
    }
  }, [progress, status]);

  if (!visible) return null;

  const isError = status.toLowerCase().startsWith("error");
  const isReady = progress >= 100 && !isError;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      <div className="bg-[#0d1b3e] border border-blue-800/70 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          {isError ? (
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          ) : isReady ? (
            <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
          ) : (
            <Loader2 size={16} className="text-yellow-400 animate-spin flex-shrink-0" />
          )}
          <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
            <Cpu size={14} className="text-blue-300" />
            Local AI model
          </div>
          {!isError && (
            <span className="ml-auto text-xs font-mono text-blue-300">{Math.round(progress)}%</span>
          )}
        </div>
        <p className="px-4 pb-3 text-xs text-blue-300 leading-snug">{status || "Preparing..."}</p>
        {!isError && (
          <div className="h-1.5 w-full bg-blue-950">
            <div
              className={`h-full transition-all duration-300 ${isReady ? "bg-green-500" : "bg-yellow-500"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
