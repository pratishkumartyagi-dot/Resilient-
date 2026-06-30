"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#0f172a] text-white">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-[#0d1b3e] border border-red-900/50 rounded-lg p-8 max-w-lg w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-red-400 mb-4">Application Error</h2>
            <p className="text-blue-200 mb-4 text-sm">
              A critical error occurred. Please refresh the page or try again later.
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
              onClick={() => window.location.reload()}
              className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg text-sm"
            >
              Refresh page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
