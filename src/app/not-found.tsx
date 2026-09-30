"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-4">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-8 max-w-lg w-full shadow-2xl text-center">
        <h2 className="text-3xl font-bold text-yellow-400 mb-4">404</h2>
        <p className="text-blue-200 mb-6 text-sm">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] font-bold px-6 py-2.5 rounded-lg text-sm inline-block"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
}
