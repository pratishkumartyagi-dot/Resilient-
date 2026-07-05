"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Upload, FileText, Image as ImageIcon, Video, Music, Tag, Trash2,
  Download, Plus, BarChart3, FolderOpen, FileJson, BookOpen
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface QASource {
  id: string;
  name: string;
  type: "text" | "image" | "audio" | "video" | "pdf";
  content: string;
  dataUrl?: string;
  createdAt: number;
}

interface QACode {
  id: string;
  name: string;
  color: string;
  category: string;
}

interface QACoding {
  id: string;
  sourceId: string;
  codeId: string;
  start: number;
  end: number;
  note: string;
}

interface QAMemo {
  id: string;
  sourceId: string;
  codeId?: string;
  content: string;
  createdAt: number;
}

const MEDIA_ACCEPT: Record<string, string> = {
  text: ".txt,.md,.csv,.tsv",
  image: "image/*",
  audio: "audio/*",
  video: "video/*",
  pdf: ".pdf,.docx,.doc,.odt,.rtf,.html,.htm,.epub",
};

const COLORS = [
  "#f97316", "#ef4444", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef",
  "#f43f5e", "#10b981", "#f59e0b", "#ec4899",
];

const LS_KEY = "qa_project_v1";

function uid(prefix = "qa"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function saveProject(project: {
  sources: QASource[];
  codebook: QACode[];
  codings: QACoding[];
  memos: QAMemo[];
}) {
  try {
    const serializable = {
      ...project,
      sources: project.sources.map((s) => ({ ...s, dataUrl: undefined })),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(serializable));
  } catch {
    // quota exceeded; skip persistence
  }
}

function loadProject() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      sources: Omit<QASource, "dataUrl">[];
      codebook: QACode[];
      codings: QACoding[];
      memos: QAMemo[];
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function QualitativeAnalysisTab() {
  const [sources, setSources] = useState<QASource[]>([]);
  const [codebook, setCodebook] = useState<QACode[]>([]);
  const [codings, setCodings] = useState<QACoding[]>([]);
  const [memos, setMemos] = useState<QAMemo[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [codeFilter, setCodeFilter] = useState<string>("all");
  const [newCodeName, setNewCodeName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [importType, setImportType] = useState<QASource["type"]>("text");
  const [isParsing, setIsParsing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const mediaRefs = useRef<Map<string, HTMLAudioElement | HTMLVideoElement>>(new Map());
  const selectionsCache = useRef<Map<string, { start: number; end: number; text: string }>>(new Map());
  const objectUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const saved = loadProject();
    if (saved) {
      setSources(saved.sources || []);
      setCodebook(saved.codebook || []);
      setCodings(saved.codings || []);
      setMemos(saved.memos || []);
      if (saved.sources?.length) setSelectedSourceId(saved.sources[0].id);
    }
  }, []);

  useEffect(() => {
    if (sources.length || codebook.length || codings.length || memos.length) {
      saveProject({ sources, codebook, codings, memos });
    }
  }, [sources, codebook, codings, memos]);

  useEffect(() => {
    const urls = Array.from(objectUrls.current);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const selectedSource = useMemo(() => sources.find((s) => s.id === selectedSourceId) || null, [sources, selectedSourceId]);
  const filteredCodings = useMemo(() => {
    const base = selectedSourceId ? codings.filter((c) => c.sourceId === selectedSourceId) : [];
    if (codeFilter === "all") return base;
    return base.filter((c) => c.codeId === codeFilter);
  }, [codings, selectedSourceId, codeFilter]);
  const sourceMemos = useMemo(() => memos.filter((m) => m.sourceId === selectedSourceId), [memos, selectedSourceId]);

  const codeFrequency = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of codings) map[c.codeId] = (map[c.codeId] || 0) + 1;
    return codebook
      .map((code) => ({ name: code.name, color: code.color, count: map[code.id] || 0 }))
      .slice()
      .sort((a, b) => b.count - a.count);
  }, [codings, codebook]);

  const getCodeById = useCallback((id: string) => codebook.find((c) => c.id === id), [codebook]);

  /* ------------------------------------------------------------------ */
  /* Imports                                                            */
  /* ------------------------------------------------------------------ */

  const createObjectUrl = useCallback((file: File): string => {
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    return url;
  }, []);

  const handleImportFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setIsParsing(true);
    const newSources: QASource[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      let type: QASource["type"] = "text";
      if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(ext)) type = "image";
      else if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) type = "audio";
      else if (["mp4", "webm", "ogg", "mov", "avi"].includes(ext)) type = "video";
      else if (ext === "pdf") type = "pdf";

      try {
        if (type === "text") {
          const content = await file.text();
          newSources.push({
            id: uid(), name: file.name, type, content,
            dataUrl: createObjectUrl(file), createdAt: Date.now(),
          });
        } else if (type === "pdf") {
          const { parsePDFDocument } = await import("@/lib/document-parser");
          const content = await parsePDFDocument(file);
          newSources.push({
            id: uid(), name: file.name, type, content,
            dataUrl: createObjectUrl(file), createdAt: Date.now(),
          });
        } else if (type === "image" || type === "audio" || type === "video") {
          const dataUrl = createObjectUrl(file);
          newSources.push({
            id: uid(), name: file.name, type,
            content: "", dataUrl, createdAt: Date.now(),
          });
        } else {
          const { parseUploadedDocument } = await import("@/lib/document-parser");
          const parsed = await parseUploadedDocument(file);
          newSources.push({
            id: uid(), name: file.name, type: "text",
            content: parsed.content, dataUrl: createObjectUrl(file), createdAt: Date.now(),
          });
        }
      } catch (err) {
        alert(`Failed to import ${file.name}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    if (newSources.length) {
      setSources((prev) => [...prev, ...newSources]);
      if (!selectedSourceId) setSelectedSourceId(newSources[0].id);
    }
    setIsParsing(false);
  };

  const removeSource = useCallback((id: string) => {
    const source = sources.find((s) => s.id === id);
    if (source?.dataUrl) {
      URL.revokeObjectURL(source.dataUrl);
      objectUrls.current.delete(source.dataUrl);
    }
    setSources((prev) => prev.filter((s) => s.id !== id));
    if (selectedSourceId === id) setSelectedSourceId(null);
    setCodings((prev) => prev.filter((c) => c.sourceId !== id));
    setMemos((prev) => prev.filter((m) => m.sourceId !== id));
  }, [sources, selectedSourceId]);

  /* ------------------------------------------------------------------ */
  /* Codebook                                                           */
  /* ------------------------------------------------------------------ */

  const addCode = () => {
    if (!newCodeName.trim()) return;
    const code: QACode = {
      id: uid("code"),
      name: newCodeName.trim(),
      color: COLORS[codebook.length % COLORS.length],
      category: newCategory.trim() || "Uncategorized",
    };
    setCodebook((prev) => [...prev, code]);
    setNewCodeName("");
    setNewCategory("");
  };

  const deleteCode = useCallback((id: string) => {
    setCodebook((prev) => prev.filter((c) => c.id !== id));
    setCodings((prev) => prev.filter((c) => c.codeId !== id));
    if (selectedCodeId === id) setSelectedCodeId(null);
  }, [selectedCodeId]);

  /* ------------------------------------------------------------------ */
  /* Codings                                                           */
  /* ------------------------------------------------------------------ */

  const handleTextSelect = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !selectedSource) return;
    const text = sel.toString().trim();
    if (!text.length) return;
    const node = sel.anchorNode;
    const container = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
    const sourceEl = container?.closest(`[data-source-id="${selectedSource.id}"]`);
    if (!sourceEl || !textContainerRef.current?.contains(sourceEl)) return;

    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(sourceEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    const before = preRange.toString().length;
    const after = before + text.length;

    const key = selectedSource.id;
    selectionsCache.current.set(key, { start: before, end: after, text });
    setSelectedCodeId((current) => current);
    sel.removeAllRanges();
  }, [selectedSource]);

  const applyTextCoding = useCallback((codeId: string) => {
    const sourceId = selectedSource?.id;
    if (!sourceId) return;
    const cache = selectionsCache.current.get(sourceId);
    if (!cache) return;

    const coding: QACoding = {
      id: uid("coding"),
      sourceId,
      codeId,
      start: cache.start,
      end: cache.end,
      note: cache.text,
    };
    setCodings((prev) => [...prev, coding]);
    selectionsCache.current.delete(sourceId);
  }, [selectedSource]);

  const addImageCoding = useCallback((sourceId: string, codeId: string, xPct: number, yPct: number) => {
    setCodings((prev) => [
      ...prev,
      {
        id: uid("coding"),
        sourceId,
        codeId,
        start: Math.round(xPct * 1000),
        end: Math.round(yPct * 1000),
        note: `Image marker at ${(xPct * 100).toFixed(1)}%, ${(yPct * 100).toFixed(1)}%`,
      },
    ]);
  }, []);

  const addAVCoding = useCallback((sourceId: string, codeId: string, start: number, end: number) => {
    setCodings((prev) => [
      ...prev,
      { id: uid("coding"), sourceId, codeId, start, end, note: `Audio/video segment ${start}s - ${end}s` },
    ]);
  }, []);

  const deleteCoding = useCallback((id: string) => setCodings((prev) => prev.filter((c) => c.id !== id)), []);

  /* ------------------------------------------------------------------ */
  /* Memos                                                              */
  /* ------------------------------------------------------------------ */

  const addMemo = useCallback(() => {
    if (!newMemo.trim() || !selectedSourceId) return;
    setMemos((prev) => [...prev, {
      id: uid("memo"), sourceId: selectedSourceId,
      codeId: selectedCodeId || undefined, content: newMemo.trim(), createdAt: Date.now(),
    }]);
    setNewMemo("");
  }, [newMemo, selectedSourceId, selectedCodeId]);

  const deleteMemo = useCallback((id: string) => setMemos((prev) => prev.filter((m) => m.id !== id)), []);

  /* ------------------------------------------------------------------ */
  /* Export                                                             */
  /* ------------------------------------------------------------------ */

  const exportProjectJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify({ sources, codebook, codings, memos }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qualitative-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sources, codebook, codings, memos]);

  const exportCSV = useCallback(() => {
    const header = "coding_id,source,code,start,end,note\n";
    const rows = codings.map((c) => {
      const src = sources.find((s) => s.id === c.sourceId)?.name || "";
      const code = getCodeById(c.codeId)?.name || "";
      return `${c.id},"${src}","${code}",${c.start},${c.end},"${c.note.replace(/"/g, '""')}"`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qualitative-codings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [codings, sources, getCodeById]);

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  const renderSourceChips = useCallback((source: QASource) => {
    const icons: Record<string, React.ReactNode> = {
      text: <FileText size={14} />, image: <ImageIcon size={14} />,
      audio: <Music size={14} />, video: <Video size={14} />, pdf: <BookOpen size={14} />,
    };
    return (
      <div
        className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer border ${
          selectedSourceId === source.id ? "bg-yellow-900/20 border-yellow-700/50" : "bg-blue-950/50 border-blue-900/50 hover:border-blue-700"
        }`}
        onClick={() => setSelectedSourceId(source.id)}
      >
        <span className="text-blue-300">{icons[source.type] || <FileText size={14} />}</span>
        <span className="flex-1 text-sm text-white truncate">{source.name}</span>
        <button onClick={(e) => { e.stopPropagation(); removeSource(source.id); }} className="text-xs text-red-300 hover:text-red-200">
          <Trash2 size={12} />
        </button>
      </div>
    );
  }, [selectedSourceId, removeSource]);

  const renderCodeChip = useCallback((code: QACode) => {
    const isActive = selectedCodeId === code.id;
    return (
      <div
        key={code.id}
        className={`flex items-center gap-2 p-2 rounded cursor-pointer border ${
          isActive ? "bg-blue-900/40 border-blue-600" : "bg-blue-950/50 border-blue-900/50 hover:border-blue-700"
        }`}
        onClick={() => setSelectedCodeId(code.id)}
      >
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: code.color }} />
        <span className="flex-1 text-xs text-white">{code.name}</span>
        <span className="text-[10px] text-blue-400">{code.category}</span>
        <button onClick={() => deleteCode(code.id)} className="text-[10px] text-red-300 hover:text-red-200"><Trash2 size={10} /></button>
      </div>
    );
  }, [selectedCodeId, deleteCode]);

  function sourceDetail(source: QASource) {
    const codeIcons: Record<string, React.ReactNode> = {
      text: <FileText size={14} />, image: <ImageIcon size={14} />,
      audio: <Music size={14} />, video: <Video size={14} />, pdf: <BookOpen size={14} />,
    };

    const renderTextCodingLayer = (source: QASource) => {
      if (!source.content) return <p className="text-sm text-blue-400">No text content.</p>;
      const sourceCodings = codings.filter((c) => c.sourceId === source.id);
      const text = source.content;
      const segments: Array<{ text: string; codeId?: string }> = [];
      const spans: Array<{ start: number; end: number; codeId: string }> = sourceCodings
        .filter((c) => c.start >= 0 && c.end <= text.length)
        .map((c) => ({ ...c }))
        .sort((a, b) => a.start - b.start);

      let cursor = 0;
      for (const span of spans) {
        if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start) });
        segments.push({ text: text.slice(span.start, span.end), codeId: span.codeId });
        cursor = span.end;
      }
      if (cursor < text.length) segments.push({ text: text.slice(cursor) });

      return (
        <div
          data-source-id={source.id}
          ref={textContainerRef}
          onMouseUp={handleTextSelect}
          className="p-5 bg-blue-950 border border-blue-900 rounded-lg min-h-[300px] max-h-[600px] overflow-y-auto text-sm text-blue-100 leading-7 whitespace-pre-wrap cursor-text"
        >
          {segments.map((seg, i) => {
            if (seg.codeId) {
              const code = getCodeById(seg.codeId);
              return (
                <mark key={i} className="rounded px-0.5" style={{ backgroundColor: code ? `${code.color}33` : "#fbbf2444", color: "#fff" }}>
                  {seg.text}
                </mark>
              );
            }
            return <span key={i}>{seg.text}</span>;
          })}
          {selectionsCache.current.has(source.id) && (
            <div className="mt-4 p-3 bg-blue-900/40 border border-blue-700 rounded-lg">
              <p className="text-xs text-yellow-200 mb-2">Selected passage: {`"${selectionsCache.current.get(source.id)?.text || ""}"`}</p>
              <div className="flex flex-wrap gap-2">
                {codebook.map((code) => (
                  <button key={code.id} onClick={() => applyTextCoding(code.id)}
                    className="text-xs px-3 py-1.5 rounded text-white font-medium"
                    style={{ backgroundColor: code.color }}>
                    {code.name}
                  </button>
                ))}
                {codebook.length === 0 && (
                  <span className="text-xs text-blue-300">Add a code in the Codebook first.</span>
                )}
              </div>
            </div>
          )}
        </div>
      );
    };

    const renderImageViewer = (source: QASource) => {
      if (!source.dataUrl) return <p className="text-sm text-blue-400">No image data.</p>;
      const sourceCodings = codings.filter((c) => c.sourceId === source.id);
      const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!selectedCodeId) {
          alert("Select a code first, then click the image to place a marker.");
          return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        addImageCoding(source.id, selectedCodeId, x, y);
      };
      return (
        <div className="relative inline-block max-w-full" data-source-id={source.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source.dataUrl} alt={source.name} className="max-h-[500px] rounded border border-blue-900" onClick={handleImageClick} />
          {sourceCodings.map((coding) => {
            const code = getCodeById(coding.codeId);
            if (!code) return null;
            const xPct = coding.start / 1000;
            const yPct = coding.end / 1000;
            return (
              <div key={coding.id}
                className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg cursor-pointer"
                style={{ left: `${xPct * 100}%`, top: `${yPct * 100}%`, backgroundColor: code.color }}
                title={`${code.name}: ${coding.note}`}
                onClick={() => { if (confirm("Delete this marker?")) deleteCoding(coding.id); }}
              />
            );
          })}
          {sourceCodings.length === 0 && (
            <p className="text-xs text-blue-300 mt-2">Click on the image after selecting a code to place markers.</p>
          )}
        </div>
      );
    };

    const renderMediaPlayer = (source: QASource) => {
      const mediaType = source.type === "audio" ? "audio" : "video";
      const ref = (el: HTMLAudioElement | HTMLVideoElement | null) => {
        if (el) mediaRefs.current.set(source.id, el);
        else mediaRefs.current.delete(source.id);
      };
      return (
        <div className="space-y-3" data-source-id={source.id}>
          {mediaType === "audio" ? (
            <audio ref={ref as any} src={source.dataUrl} controls className="w-full" />
          ) : (
            <video ref={ref as any} src={source.dataUrl} controls className="w-full max-h-[400px] rounded border border-blue-900" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-blue-300">Start (s)</label>
            <input type="number" min={0} step={0.1} defaultValue={0}
              className="w-24 bg-blue-950 border border-blue-800 text-white rounded px-2 py-1 text-xs"
              id={`av-start-${source.id}`} />
            <label className="text-xs text-blue-300">End (s)</label>
            <input type="number" min={0} step={0.1} defaultValue={10}
              className="w-24 bg-blue-950 border border-blue-800 text-white rounded px-2 py-1 text-xs"
              id={`av-end-${source.id}`} />
            <button
              onClick={() => {
                const startEl = document.getElementById(`av-start-${source.id}`) as HTMLInputElement | null;
                const endEl = document.getElementById(`av-end-${source.id}`) as HTMLInputElement | null;
                if (!selectedCodeId || !startEl || !endEl) return;
                const s = parseFloat(startEl.value) || 0;
                const e = parseFloat(endEl.value) || 0;
                if (s < 0 || e <= s) { alert("Invalid time range."); return; }
                addAVCoding(source.id, selectedCodeId, s, e);
              }}
              disabled={!selectedCodeId}
              className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-[#0a1a3a] text-xs font-bold rounded disabled:opacity-50"
            >
              Apply Code to Segment
            </button>
          </div>
          <p className="text-[11px] text-blue-400">Select a code, set start/end seconds, then click Assign.</p>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {codeIcons[source.type]} {source.name}
            </h3>
            <p className="text-xs text-blue-400 mt-0.5">
              {source.type.toUpperCase()} · {(source.content || "").length.toLocaleString()} chars · {new Date(source.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button onClick={() => removeSource(source.id)} className="p-2 bg-red-900/40 text-red-300 rounded hover:bg-red-900/60">
            <Trash2 size={14} />
          </button>
        </div>

        <div className="bg-blue-950 border border-blue-900 rounded-lg">
          <div className="flex items-center gap-2 p-2 border-b border-blue-900">
            {source.type === "text" && <span className="text-xs bg-teal-900/50 text-teal-200 px-2 py-1 rounded">Text source</span>}
            {source.type === "pdf" && <span className="text-xs bg-teal-900/50 text-teal-200 px-2 py-1 rounded">PDF (extracted text)</span>}
            {source.type === "image" && <span className="text-xs bg-indigo-900/50 text-indigo-200 px-2 py-1 rounded">Image source</span>}
            {(source.type === "audio" || source.type === "video") && <span className="text-xs bg-indigo-900/50 text-indigo-200 px-2 py-1 rounded">Media source</span>}
            {!selectedCodeId ? (
              <span className="text-[11px] text-yellow-300">Select a code from the sidebar to begin coding.</span>
            ) : (
              <span className="text-[11px] text-green-300">Active code: {getCodeById(selectedCodeId)?.name}</span>
            )}
          </div>
          <div className="p-3">
            {source.type === "text" || source.type === "pdf"
              ? renderTextCodingLayer(source)
              : source.type === "image"
                ? renderImageViewer(source)
                : renderMediaPlayer(source)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-950/60 border border-blue-900 rounded-lg p-4">
            <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><Tag size={12} className="text-yellow-400" /> Codings on this source ({filteredCodings.length})</h4>
            <div className="flex items-center gap-2 mb-2">
              <select value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)}
                className="bg-blue-950 border border-blue-800 text-white rounded px-2 py-1 text-xs">
                <option value="all">All codes</option>
                {codebook.map((code) => (
                  <option key={code.id} value={code.id}>{code.name}</option>
                ))}
              </select>
              <span className="text-[10px] text-blue-400">{codeFilter === "all" ? "Showing all" : `Filtered to ${getCodeById(codeFilter)?.name}`}</span>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {filteredCodings.map((coding) => {
                const code = getCodeById(coding.codeId);
                if (!code) return null;
                return (
                  <div key={coding.id} className="flex items-start gap-2 p-2 bg-blue-950 rounded border border-blue-900">
                    <span className="w-3 h-3 rounded-full mt-0.5" style={{ backgroundColor: code.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{code.name}</p>
                      <p className="text-[10px] text-blue-300 truncate">{coding.note}</p>
                    </div>
                    <button onClick={() => deleteCoding(coding.id)} className="text-[10px] text-red-300 hover:text-red-200"><Trash2 size={10} /></button>
                  </div>
                );
              })}
              {filteredCodings.length === 0 && <p className="text-[11px] text-blue-400">No codings match the current filter.</p>}
            </div>
          </div>

          <div className="bg-blue-950/60 border border-blue-900 rounded-lg p-4">
            <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2"><BookOpen size={12} className="text-yellow-400" /> Memos ({sourceMemos.length})</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {sourceMemos.map((memo) => (
                <div key={memo.id} className="p-2 bg-blue-950 rounded border border-blue-900">
                  <p className="text-xs text-blue-100">{memo.content}</p>
                  <p className="text-[10px] text-blue-400 mt-1">{new Date(memo.createdAt).toLocaleString()}</p>
                  <button onClick={() => deleteMemo(memo.id)} className="text-[10px] text-red-300 hover:text-red-200 mt-1"><Trash2 size={10} /> delete</button>
                </div>
              ))}
              {sourceMemos.length === 0 && <p className="text-[11px] text-blue-400">No memos on this source yet.</p>}
            </div>
            <div className="mt-3">
              <textarea
                value={newMemo}
                onChange={(e) => setNewMemo(e.target.value)}
                placeholder="Write a memo for this source..."
                className="w-full bg-blue-900/50 border border-blue-800 text-white rounded-lg px-3 py-2 text-xs placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
                rows={2}
              />
              <button onClick={addMemo} disabled={!newMemo.trim()}
                className="mt-2 px-3 py-1.5 bg-green-900/50 text-green-200 rounded hover:bg-green-900/70 text-xs disabled:opacity-50">Add Memo</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-4">
      <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-4 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Qualitative Analysis</h2>
            <p className="text-xs text-blue-300">Code text, images, audio, video and generate reports.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-blue-900/50 text-blue-200 rounded hover:bg-blue-900/70 text-xs flex items-center gap-2">
              <Upload size={14} /> Import Files
            </button>
            <input ref={fileInputRef} type="file" accept={Object.values(MEDIA_ACCEPT).join(",")} multiple className="hidden"
              onChange={(e) => { handleImportFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = ""; }} />
            <button onClick={exportProjectJSON} className="px-3 py-2 bg-green-900/50 text-green-200 rounded hover:bg-green-900/70 text-xs flex items-center gap-2"><FileJson size={14} /> Export JSON</button>
            <button onClick={exportCSV} className="px-3 py-2 bg-green-900/50 text-green-200 rounded hover:bg-green-900/70 text-xs flex items-center gap-2"><Download size={14} /> Export CSV</button>
            <button onClick={() => { if (confirm("Clear project?")) { setSources([]); setCodebook([]); setCodings([]); setMemos([]); setSelectedSourceId(null); localStorage.removeItem(LS_KEY); } }} className="px-3 py-2 bg-red-900/50 text-red-200 rounded hover:bg-red-900/70 text-xs">New Project</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <select value={importType} onChange={(e) => setImportType(e.target.value as QASource["type"])}
            className="bg-blue-950 border border-blue-800 text-white rounded px-3 py-1.5 text-xs">
            <option value="text">Text</option>
            <option value="pdf">PDF / Word</option>
            <option value="image">Image</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
          {isParsing && <span className="text-xs text-blue-300 flex items-center gap-1">Parsing...</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left panel: sources + codebook */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-4 shadow">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><FolderOpen size={14} className="text-yellow-400" /> Sources ({sources.length})</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {sources.length === 0 && <p className="text-xs text-blue-400">No sources imported. Use Import Files above.</p>}
              {sources.map(renderSourceChips)}
            </div>
          </div>

          <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-4 shadow">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2"><Tag size={14} className="text-yellow-400" /> Codebook ({codebook.length})</h3>
            <div className="flex gap-2 mb-2">
              <input value={newCodeName} onChange={(e) => setNewCodeName(e.target.value)} placeholder="New code..."
                className="flex-1 bg-blue-950 border border-blue-800 text-white rounded px-3 py-1.5 text-xs placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                onKeyDown={(e) => { if (e.key === "Enter") addCode(); }} />
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Category"
                className="w-24 bg-blue-950 border border-blue-800 text-white rounded px-2 py-1.5 text-xs placeholder:text-blue-500 focus:outline-none focus:ring-2 focus:ring-yellow-500" />
              <button onClick={addCode} className="px-2 py-1 bg-yellow-500 text-[#0a1a3a] rounded text-xs font-bold flex items-center gap-1"><Plus size={12} /> Add</button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {codebook.length === 0 && <p className="text-xs text-blue-400">No codes yet. Add a code above.</p>}
              {codebook.map(renderCodeChip)}
            </div>
          </div>
        </div>

        {/* Right panel: work area + charts */}
        <div className="lg:col-span-2 space-y-4">
          {selectedSource ? (
            sourceDetail(selectedSource)
          ) : (
            <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-6 shadow text-center">
              <FolderOpen size={40} className="mx-auto text-blue-600 mb-3" />
              <h3 className="text-lg font-bold text-white">No source selected</h3>
              <p className="text-sm text-blue-300 mt-1">Import files or select a source from the sidebar to begin coding.</p>
              <button onClick={() => fileInputRef.current?.click()} className="mt-4 px-4 py-2 bg-yellow-500 text-[#0a1a3a] rounded-lg font-bold text-sm">
                Import Now
              </button>
            </div>
          )}

          <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-4 shadow">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><BarChart3 size={14} className="text-yellow-400" /> Code Frequency</h3>
            {codeFrequency.length === 0 ? (
              <p className="text-xs text-blue-400">No codings yet. Apply codes to sources to see frequencies.</p>
            ) : (
              <div className="space-y-2">
                {codeFrequency.map((item) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-white w-40 truncate">{item.name}</span>
                    <div className="flex-1 h-3 bg-blue-900 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min((item.count / (codeFrequency[0]?.count || 1)) * 100, 100)}%`, backgroundColor: item.color }} />
                    </div>
                    <span className="text-xs text-blue-200 w-8 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#0d1b3e] border border-blue-900/50 rounded-lg p-4 shadow">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2"><Download size={14} className="text-yellow-400" /> Project Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-blue-200">
              <div className="bg-blue-950 border border-blue-900 rounded p-2">Sources: {sources.length}</div>
              <div className="bg-blue-950 border border-blue-900 rounded p-2">Codes: {codebook.length}</div>
              <div className="bg-blue-950 border border-blue-900 rounded p-2">Codings: {codings.length}</div>
              <div className="bg-blue-950 border border-blue-900 rounded p-2">Memos: {memos.length}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
