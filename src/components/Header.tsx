"use client";

import Image from "next/image";
import { Settings, BookOpen, Microscope, ClipboardCheck } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { APP_VERSION } from "@/lib/version";

export default function Header() {
  const { dispatch } = useApp();
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
