import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resilient Researcher Assistant",
  description: "AI-Powered Research Intelligence Platform for Systematic Reviews & Evidence Synthesis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
