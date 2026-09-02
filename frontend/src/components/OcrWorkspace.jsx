import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Upload, ChevronLeft, ChevronRight, Copy, Check, 
  Send, Download, Trash2, Sparkles, Layers, Eye, 
  FileCheck, AlertCircle, Loader2, Play, Square, FastForward,
  CheckSquare, ListFilter, SlidersHorizontal
} from 'lucide-react';
import { getApiBase } from '../config';

// Helper: Parse selection strings like "1-10", "1,3,5,9", "odd", "even", "all"
function parsePageSelection(inputStr, maxPages) {
  if (!inputStr || !inputStr.trim()) return [];
  const str = inputStr.trim().toLowerCase();

  if (str === 'all') {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }
  if (str === 'odd') {
    const pages = [];
    for (let i = 1; i <= maxPages; i += 2) pages.push(i);
    return pages;
  }
  if (str === 'even') {
    const pages = [];
    for (let i = 2; i <= maxPages; i += 2) pages.push(i);
    return pages;
  }

  const pagesSet = new Set();
  const parts = str.split(/[,;\s]+/);
  for (const part of parts) {
    if (!part) continue;
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr);
      const end = parseInt(endStr);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(maxPages, Math.max(start, end));
        for (let i = min; i <= max; i++) pagesSet.add(i);
      }
    } else {
      const p = parseInt(part);
      if (!isNaN(p) && p >= 1 && p <= maxPages) {
        pagesSet.add(p);
      }
    }
  }
  return Array.from(pagesSet).sort((a, b) => a - b);
}

export default function OcrWorkspace({ onInsertIntoChat, onBackToChat }) {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  
  // Custom Page Selection state
  const [pageRangeInput, setPageRangeInput] = useState("all");
  const [selectedPreset, setSelectedPreset] = useState("all"); // 'all', 'odd', 'even', 'custom'
  const [currentScanningTarget, setCurrentScanningTarget] = useState(null); // page currently being processed
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });

  // OCR Results cache per page: { 1: "text of page 1", 2: "text of page 2" }
  const [pageResults, setPageResults] = useState({});
  const [viewMode, setViewMode] = useState("current"); // "current" or "all"
  
  const [languages, setLanguages] = useState("en,bn");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    const isDocPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    
    setFile(selectedFile);
    setIsPdf(isDocPdf);
    setFileUrl(URL.createObjectURL(selectedFile));
    setCurrentPage(1);
    setTotalPages(1);
    setPageResults({});
    setError(null);
    setPageRangeInput("all");
    setSelectedPreset("all");

    // If PDF, immediately fetch page count from server
    if (isDocPdf) {
      try {
        const apiBase = getApiBase();
        const formData = new FormData();
        formData.append("file", selectedFile);
        const res = await fetch(`${apiBase}/api/pdf/info`, {
          method: "POST",
          body: formData
        });
        if (res.ok) {
          const data = await res.json();
          setTotalPages(data.total_pages || 1);
        }
      } catch (err) {
        console.log("Could not fetch PDF info:", err);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileSelect(dropped);
  };

  // Preset Selection Helper
  const applyPreset = (preset) => {
    setSelectedPreset(preset);
    if (preset === 'all') setPageRangeInput('all');
    else if (preset === 'odd') setPageRangeInput('odd');
    else if (preset === 'even') setPageRangeInput('even');
    else if (preset === 'current') setPageRangeInput(`${currentPage}`);
  };

  // Active target pages calculated from input
  const targetPages = parsePageSelection(pageRangeInput, totalPages);

  // Batch / Range Automated Scanner
  const handleStartAutoScan = async () => {
    if (!file || isScanning) return;
    if (targetPages.length === 0) {
      setError("দয়া করে সঠিক পেজ নম্বর বা রেঞ্জ লিখুন (যেমন: 1-10, 1,3,5, odd, even)");
      return;
    }

    setIsScanning(true);
    setError(null);
    setScanProgress({ done: 0, total: targetPages.length });

    abortControllerRef.current = new AbortController();
    const apiBase = getApiBase();

    for (let i = 0; i < targetPages.length; i++) {
      if (abortControllerRef.current?.signal?.aborted) break;

      const p = targetPages[i];
      setCurrentPage(p); // Flips the PDF preview live to this page!
      setCurrentScanningTarget(p);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("page_num", p.toString());
      formData.append("languages", languages);

      try {
        const res = await fetch(`${apiBase}/api/ocr/page`, {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current.signal
        });

        if (res.ok) {
          const data = await res.json();
          setPageResults(prev => ({
            ...prev,
            [p]: data.text || ""
          }));
          setScanProgress({ done: i + 1, total: targetPages.length });
        }
      } catch (err) {
        if (err.name === 'AbortError') break;
        console.error(`Page ${p} OCR failed:`, err);
      }
    }

    setIsScanning(false);
    setCurrentScanningTarget(null);
    abortControllerRef.current = null;
  };

  const handleStopScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsScanning(false);
    setCurrentScanningTarget(null);
  };

  const getCombinedText = () => {
    const pages = Object.keys(pageResults).sort((a, b) => Number(a) - Number(b));
    if (pages.length === 0) return "";
    return pages.map(p => `=== পৃষ্ঠা ${p} ===\n${pageResults[p]}`).join("\n\n");
  };

  const getActiveText = () => {
    if (viewMode === "all") return getCombinedText();
    return pageResults[currentPage] || "";
  };

  const handleCopy = () => {
    const text = getActiveText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToChat = () => {
    const text = getActiveText();
    if (!text) return;
    onInsertIntoChat(text);
    onBackToChat();
  };

  const handleDownloadTxt = () => {
    const text = getActiveText();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name?.replace(/\.[^/.]+$/, "") || "ocr_document"}_${viewMode === "all" ? "full" : `page_${currentPage}`}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setFile(null);
    setFileUrl(null);
    setPageResults({});
    setError(null);
    setCurrentPage(1);
    setTotalPages(1);
    setCurrentScanningTarget(null);
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#1c1c1c] text-[#ececec] overflow-hidden">
      {/* Top Editorial Header */}
      <header className="h-14 border-b border-[#2d2d2d] flex items-center justify-between px-6 bg-[#171717] shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>PDF & Document OCR Studio</span>
              {isPdf && (
                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded font-mono">
                  PDF ({totalPages} {totalPages === 1 ? 'Page' : 'Pages'})
                </span>
              )}
            </h1>
            <p className="text-[11px] text-neutral-400 truncate max-w-sm">
              {file ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)` : "ডকুমেন্ট আপলোড করে বাংলা ও ইংরেজি টেক্সট এক্সট্রাক্ট করুন"}
            </p>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2.5">
          {file && (
            <>
              {/* Language Selector */}
              <div className="flex items-center gap-1 bg-[#242424] border border-[#333] rounded-lg px-2 py-1 text-xs">
                <span className="text-[11px] text-neutral-400">ভাষা:</span>
                <select 
                  value={languages} 
                  onChange={e => setLanguages(e.target.value)}
                  className="bg-transparent text-xs text-neutral-200 focus:outline-none cursor-pointer"
                >
                  <option value="en,bn" className="bg-[#222]">বাংলা + English</option>
                  <option value="bn" className="bg-[#222]">শুধুমাত্র বাংলা</option>
                  <option value="en" className="bg-[#222]">Only English</option>
                </select>
              </div>

              <button
                onClick={handleClear}
                title="নতুন ফাইল আপলোড করুন"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-[#282828] transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={onBackToChat}
            className="px-3 py-1.5 rounded-lg bg-[#282828] hover:bg-[#333] text-neutral-300 text-xs font-medium transition-colors ml-1"
          >
            চ্যাটে ফিরুন
          </button>
        </div>
      </header>

      {/* Main Split Body */}
      {!file ? (
        /* Empty Upload Dropzone */
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div 
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="max-w-xl w-full border-2 border-dashed border-[#383838] hover:border-emerald-500 rounded-3xl p-12 bg-[#171717] hover:bg-[#1a1a1a] transition-all cursor-pointer flex flex-col items-center text-center space-y-4 group shadow-xl"
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".pdf,image/png,image/jpeg,image/webp,image/jpg" 
              onChange={e => handleFileSelect(e.target.files?.[0])}
              className="hidden" 
            />

            <div className="w-16 h-16 rounded-2xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-white">PDF অথবা ইমেজ ফাইল ড্র্যাগ করে ছাড়ুন</h2>
              <p className="text-xs text-neutral-400 mt-1">
                কম্পিউটার থেকে ফাইল বাছাই করতে <span className="text-emerald-400 underline">ব্রাউজ করুন</span>
              </p>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono pt-2">
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">PDF (বহুপাতা)</span>
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">PNG</span>
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">JPG</span>
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">WEBP</span>
            </div>
          </div>
        </div>
      ) : (
        /* Split-Screen Studio */
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* ========================================================
              TOP BATCH CONTROLLER BAR (Odd, Even, Range, 1-10, All)
              ======================================================== */}
          <div className="h-12 border-b border-[#2d2d2d] bg-[#1a1a1a] px-6 flex items-center justify-between gap-4 shrink-0 text-xs">
            {/* Presets & Range Input */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-neutral-400 font-medium flex items-center gap-1">
                <ListFilter className="w-3.5 h-3.5 text-emerald-400" />
                <span>পেজ নির্বাচন:</span>
              </span>

              {/* Quick Preset Buttons */}
              <div className="flex bg-[#242424] p-0.5 rounded-lg border border-[#333]">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'odd', label: 'Odd (বিজোড়)' },
                  { id: 'even', label: 'Even (জোড়)' },
                  { id: 'current', label: `Page ${currentPage}` },
                ].map(p => (
                  <button
                    key={p.id}
                    disabled={isScanning}
                    onClick={() => applyPreset(p.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                      selectedPreset === p.id 
                        ? 'bg-emerald-600 text-white shadow-sm' 
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom Input Box (e.g. "1-10, 15, 20-25") */}
              <div className="flex items-center gap-1.5 bg-[#141414] border border-[#333] rounded-lg px-2 py-1">
                <input
                  type="text"
                  disabled={isScanning}
                  value={pageRangeInput}
                  onChange={e => {
                    setPageRangeInput(e.target.value);
                    setSelectedPreset("custom");
                  }}
                  placeholder="যেমন: 1-10, 1,3,5,9"
                  className="bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none w-36 font-mono"
                />
                <span className="text-[10px] bg-[#282828] text-emerald-400 px-1.5 py-0.5 rounded border border-[#383838] font-mono">
                  {targetPages.length} পেজ
                </span>
              </div>
            </div>

            {/* Action Trigger / Stop Button */}
            <div className="flex items-center gap-2">
              {isScanning ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1 rounded-lg">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>পেজ {currentScanningTarget} ({scanProgress.done}/{scanProgress.total})</span>
                  </div>

                  <button
                    onClick={handleStopScan}
                    className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-md"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>থামান</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStartAutoScan}
                  disabled={targetPages.length === 0}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>অটো স্ক্যান শুরু করুন ({targetPages.length}টি পেজ)</span>
                </button>
              )}
            </div>
          </div>

          {/* ========================================================
              SPLIT BODY (Left: PDF Viewer, Right: OCR Text)
              ======================================================== */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* ========================================================
                LEFT COLUMN: PDF & Document Preview with Active Laser Beam
                ======================================================== */}
            <div className="w-full md:w-1/2 flex flex-col border-r border-[#2d2d2d] bg-[#121212] overflow-hidden">
              {/* Page Navigation Bar */}
              <div className="h-10 border-b border-[#282828] bg-[#181818] px-4 flex items-center justify-between text-xs text-neutral-300 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-200">ডকুমেন্ট প্রিভিউ</span>
                  {totalPages > 1 && (
                    <span className="text-[11px] bg-[#222] border border-[#333] px-2 py-0.5 rounded-full font-mono text-emerald-400">
                      পেজ {currentPage} / {totalPages}
                    </span>
                  )}
                </div>

                {/* Page Jumper */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={currentPage <= 1 || isScanning}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="p-1 rounded hover:bg-[#282828] disabled:opacity-30 text-neutral-300 transition-colors"
                      title="আগের পৃষ্ঠা"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 font-mono text-xs text-neutral-400">
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={currentPage}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1 && val <= totalPages) {
                            setCurrentPage(val);
                          }
                        }}
                        className="w-12 bg-[#222] border border-[#383838] rounded px-1.5 py-0.5 text-center text-white text-xs focus:outline-none focus:border-emerald-500"
                      />
                      <span>/ {totalPages}</span>
                    </div>

                    <button
                      disabled={currentPage >= totalPages || isScanning}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="p-1 rounded hover:bg-[#282828] disabled:opacity-30 text-neutral-300 transition-colors"
                      title="পরের পৃষ্ঠা"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Document Frame with Laser Beam */}
              <div className="flex-1 relative overflow-hidden p-3 bg-[#0d0d0d] flex items-center justify-center">
                <div className="w-full h-full relative rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#1e1e1e] shadow-2xl flex items-center justify-center">
                  {/* Laser Animation when scanning */}
                  {isScanning && (
                    <>
                      <div className="scanner-laser" />
                      <div className="scanner-overlay" />
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-emerald-950/95 border border-emerald-500/60 text-emerald-300 px-4 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 shadow-2xl backdrop-blur-md">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>পেজ {currentScanningTarget || currentPage} স্ক্যানিং হচ্ছে...</span>
                      </div>
                    </>
                  )}

                  {/* PDF or Image Viewer */}
                  {isPdf ? (
                    <iframe
                      key={`page-${currentPage}`}
                      src={`${fileUrl}#page=${currentPage}&toolbar=0&navpanes=0&view=FitH`}
                      title="PDF Preview"
                      className="w-full h-full border-0 bg-white"
                    />
                  ) : (
                    <img 
                      src={fileUrl} 
                      alt="Document preview" 
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================
                RIGHT COLUMN: Extracted OCR Text Editor
                ======================================================== */}
            <div className="w-full md:w-1/2 flex flex-col bg-[#181818] overflow-hidden">
              {/* Results Header Toolbar */}
              <div className="h-10 border-b border-[#282828] bg-[#1a1a1a] px-4 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-200">এক্সট্রাক্ট করা টেক্সট</span>

                  {Object.keys(pageResults).length > 0 && (
                    <div className="flex bg-[#242424] rounded-lg p-0.5 border border-[#333]">
                      <button
                        onClick={() => setViewMode("current")}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                          viewMode === "current" ? "bg-emerald-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        পেজ {currentPage}
                      </button>
                      <button
                        onClick={() => setViewMode("all")}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                          viewMode === "all" ? "bg-emerald-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        সব পেজ ({Object.keys(pageResults).length})
                      </button>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopy}
                    disabled={!getActiveText()}
                    className="p-1.5 rounded-lg hover:bg-[#282828] text-neutral-300 disabled:opacity-30 flex items-center gap-1 text-xs transition-colors"
                    title="টেক্সট কপি করুন"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{copied ? "কপি হয়েছে" : "কপি"}</span>
                  </button>

                  <button
                    onClick={handleDownloadTxt}
                    disabled={!getActiveText()}
                    className="p-1.5 rounded-lg hover:bg-[#282828] text-neutral-300 disabled:opacity-30 flex items-center gap-1 text-xs transition-colors"
                    title="TXT ডাউনলোড"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">ডাউনলোড</span>
                  </button>

                  <button
                    onClick={handleSendToChat}
                    disabled={!getActiveText()}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 disabled:opacity-30 flex items-center gap-1.5 text-xs font-medium ml-1 transition-all"
                    title="এই টেক্সট নিয়ে চ্যাটে কথা বলুন"
                  >
                    <Send className="w-3 h-3" />
                    <span>চ্যাটে পাঠান</span>
                  </button>
                </div>
              </div>

              {/* Main Text Content */}
              <div className="flex-1 p-4 overflow-y-auto flex flex-col">
                {error ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : isScanning && !getActiveText() ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                    <div className="text-sm font-medium text-white">
                      পেজ {currentScanningTarget || currentPage} স্ক্যান করা হচ্ছে...
                    </div>
                    <div className="text-xs text-neutral-400 max-w-xs">
                      T4 GPU দিয়ে বাংলা ও ইংরেজি অক্ষর ও যুক্তবর্ণ নিখুঁতভাবে এক্সট্রাক্ট করা হচ্ছে।
                    </div>
                  </div>
                ) : !getActiveText() ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-500 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#222] border border-[#333] flex items-center justify-center text-neutral-400">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-medium text-neutral-300">এখনো কোনো টেক্সট স্ক্যান করা হয়নি।</div>
                    <div className="text-[11px] text-neutral-500">
                      উপরে <span className="text-emerald-400 font-medium">'All', 'Odd', 'Even'</span> অথবা রেঞ্জ (যেমন: <span className="text-neutral-300 font-mono">1-10</span> বা <span className="text-neutral-300 font-mono">1,3,5,9</span>) দিয়ে <span className="text-emerald-400 font-medium">'অটো স্ক্যান শুরু করুন'</span> বাটনে ক্লিক করুন।
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={getActiveText()}
                    readOnly
                    placeholder="শনাক্তকৃত টেক্সট এখানে প্রদর্শিত হবে..."
                    className="flex-1 w-full bg-[#131313] border border-[#2b2b2b] rounded-xl p-4 text-xs md:text-sm text-neutral-100 font-sans leading-relaxed resize-none focus:outline-none focus:border-emerald-500"
                  />
                )}
              </div>

              {/* Bottom Telemetry Bar */}
              {getActiveText() && (
                <div className="h-8 border-t border-[#262626] bg-[#141414] px-4 flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
                  <span>লাইন সংখ্যা: {getActiveText().split('\n').filter(Boolean).length}</span>
                  <span>অক্ষর সংখ্যা: {getActiveText().length}</span>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
