"use client";

import Image from "next/image";
import { Settings } from "lucide-react";

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
            <p className="text-xs text-blue-200">
              AI-Powered Research Intelligence Platform
            </p>
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-yellow-300 tracking-wider">
            Resilient Research App
          </h1>
          <p className="text-xs text-blue-200">Powered Research Intelligence Platform</p>
        </div>
        <div className="flex items-center">
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
