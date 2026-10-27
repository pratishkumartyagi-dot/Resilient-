"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Settings, BookOpen, Microscope, ClipboardCheck, Cpu, FileText } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { APP_VERSION } from "@/lib/version";
import type { AiFallbackEvent } from "@/lib/ai";

export default function Header() {
  const { dispatch } = useApp();
  const [aiFallback, setAiFallback] = useState<AiFallbackEvent | null>(null);

  // Show when an exhausted Gemini/Groq quota was covered by a backup provider.
  useEffect(() => {
    const onFallback = (event: Event) => {
      setAiFallback((event as CustomEvent<AiFallbackEvent>).detail || null);
    };
    window.addEventListener("ai-fallback", onFallback);
    return () => window.removeEventListener("ai-fallback", onFallback);
  }, []);

  useEffect(() => {
    if (!aiFallback) return;
    const timer = setTimeout(() => setAiFallback(null), 20000);
    return () => clearTimeout(timer);
  }, [aiFallback]);
  return (
    <header className="bg-gradient-to-r from-[#0a1a3a] to-[#0d2080] text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <div className="relative w-16 h-16 flex-shrink-0">
            <Image
              src="/resilient-logo.jpg"
              alt="Resilient Logo"
              fill
              className="object-contain"
              priority
              unoptimized
            />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-yellow-300 tracking-wider">
            Resilient Research App
          </h1>
          <p className="text-xs text-blue-200">
            AI-Powered Research Intelligence Platform ·{" "}
            <span className="text-blue-300/80">v{APP_VERSION}</span>
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          {aiFallback && (
            <span
              className="hidden md:inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-amber-900/50 text-amber-200 border border-amber-700"
              title={aiFallback.reason || "A provider was unavailable and a backup was used"}
            >
              <Cpu size={12} />
              {aiFallback.exhausted
                ? `${aiFallback.failedProvider ?? "Provider"} quota exhausted → ${aiFallback.provider === "local" ? "local model" : aiFallback.provider} used`
                : `${aiFallback.failedProvider ?? "Provider"} unavailable → ${aiFallback.provider} used`}
            </span>
          )}
          <button
            onClick={() => {
              const event = new CustomEvent("open-thesis");
              window.dispatchEvent(event);
            }}
            className="p-2 rounded-lg bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
            title="Thesis Generator"
          >
            <BookOpen size={20} />
          </button>
          <button
            onClick={() => {
              const event = new CustomEvent("open-appraisal");
              window.dispatchEvent(event);
            }}
            className="p-2 rounded-lg bg-amber-900/40 text-amber-300 hover:bg-amber-900/60"
            title="Critical Appraisal"
            aria-label="Critical Appraisal"
          >
            <ClipboardCheck size={20} />
          </button>
          <button
            onClick={() => {
              const event = new CustomEvent("open-slr");
              window.dispatchEvent(event);
            }}
            className="p-2 rounded-lg bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60"
            title="Automated SLR"
          >
            <Microscope size={20} />
          </button>
          <button
            onClick={() => {
              const event = new CustomEvent("open-paperwriter");
              window.dispatchEvent(event);
            }}
            className="p-2 rounded-lg bg-yellow-900/40 text-yellow-300 hover:bg-yellow-900/60"
            title="Paper Writer"
            aria-label="Paper Writer"
          >
            <FileText size={20} />
          </button>
          <button
            onClick={() => {
              const event = new CustomEvent("open-paperreviewer");
              window.dispatchEvent(event);
            }}
            className="p-2 rounded-lg bg-green-900/40 text-green-300 hover:bg-green-900/60"
            title="Paper Reviewer"
            aria-label="Paper Reviewer"
          >
            <ClipboardCheck size={20} />
          </button>
          <button
            onClick={() => {
              const event = new CustomEvent("open-settings");
              window.dispatchEvent(event);
            }}
            className="p-2 rounded-lg bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
