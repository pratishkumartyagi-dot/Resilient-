"use client";

export default function TabLoadingSkeleton({ label }: { label?: string }) {
  return (
    <div className="w-full py-12 flex flex-col items-center justify-center gap-4 text-slate-400">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
        <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse [animation-delay:150ms]" />
        <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse [animation-delay:300ms]" />
      </div>
      <p className="text-sm">{label ? `Loading ${label}…` : "Loading pipeline…"}</p>
      <div className="w-full max-w-3xl space-y-3 mt-4">
        <div className="h-6 w-1/3 rounded bg-slate-800 animate-pulse" />
        <div className="h-32 w-full rounded bg-slate-800/70 animate-pulse" />
        <div className="h-32 w-full rounded bg-slate-800/70 animate-pulse" />
      </div>
    </div>
  );
}