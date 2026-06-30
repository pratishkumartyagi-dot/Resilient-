"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4">
      <div className="bg-[#0d1b3e] border border-red-900/50 rounded-lg p-8 max-w-lg w-full shadow-2xl">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h2>
        <p className="text-blue-200 mb-4 text-sm">
          An unexpected error occurred. The details below may help with troubleshooting.
        </p>
        <details className="mb-6">
          <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
            Error details
          </summary>
          <pre className="mt-2 p-3 bg-[#0a1428] rounded text-xs text-red-300 overflow-x-auto whitespace-pre-wrap">
            {error.message}
            {error.digest && <span className="block text-blue-400 mt-1">Digest: {error.digest}</span>}
          </pre>
        </details>
        <button
          onClick={reset}
          className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
