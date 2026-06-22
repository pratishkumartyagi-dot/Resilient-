"use client";

import Image from "next/image";

export default function Header() {
  return (
    <header className="bg-gradient-to-r from-[#0a1a3a] to-[#0d2080] text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
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
          <div>
            <h1 className="text-xl font-bold tracking-wide text-yellow-400">
              Resilient Researcher Assistant
            </h1>
            <p className="text-xs text-blue-200">
              AI-Powered Research Intelligence Platform
            </p>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-yellow-300 tracking-wider">
            Resilient Research App
          </h2>
          <p className="text-xs text-blue-200">Systematic Review & Evidence Synthesis</p>
        </div>
        <div className="w-20" />
      </div>
    </header>
  );
}
