import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Upload, ChevronLeft, ChevronRight, Copy, Check, 
  Send, Download, Trash2, Sparkles, Layers, Eye, 
  FileCheck, AlertCircle, Loader2, Play, Square, FastForward 
} from 'lucide-react';
import { getApiBase } from '../config';

export default function OcrWorkspace({ onInsertIntoChat, onBackToChat }) {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState("single"); // "single" or "batch"
  
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

  // Scan single page (Current Page)
  const handleScanCurrentPage = async () => {
    if (!file || isScanning) return;
    setIsScanning(true);
    setError(null);
    setScanMode("single");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("page_num", currentPage.toString());
    formData.append("languages", languages);

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/ocr/page`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Page OCR failed.");
      }

      const data = await res.json();
      setPageResults(prev => ({
        ...prev,
        [currentPage]: data.text || "কোনো টেক্সট পাওয়া যায়নি।"
      }));
      if (data.total_pages) {
        setTotalPages(data.total_pages);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Scan all pages sequentially with live progress
  const handleScanAllPages = async () => {
    if (!file || isScanning) return;
    setIsScanning(true);
    setError(null);
    setScanMode("batch");

    abortControllerRef.current = new AbortController();

    const apiBase = getApiBase();
    for (let p = 1; p <= totalPages; p++) {
      if (abortControllerRef.current?.signal?.aborted) break;

      setCurrentPage(p);
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
        }
      } catch (err) {
        if (err.name === 'AbortError') break;
        console.error(`Error scanning page ${p}:`, err);
      }
    }

    setIsScanning(false);
    abortControllerRef.current = null;
  };

  const handleStopScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsScanning(false);
  };

  const getCombinedText = () => {
    const pages = Object.keys(pageResults).sort((a, b) => Number(a) - Number(b));
    if (pages.length === 0) return "";
    return pages.map(p => `--- পৃষ্ঠা ${p} ---\n${pageResults[p]}`).join("\n\n");
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

        {/* Action controls */}
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

              {/* Scan Current Page Button */}
              {isScanning ? (
                <button
                  onClick={handleStopScan}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>স্ক্যান বন্ধ করুন</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleScanCurrentPage}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-md"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>বর্তমান পেজ স্ক্যান ({currentPage})</span>
                  </button>

                  {totalPages > 1 && (
                    <button
                      onClick={handleScanAllPages}
                      title="সবগুলো পেজ ক্রমান্বয়ে স্ক্যান করুন"
                      className="px-3 py-1.5 rounded-xl bg-[#282828] hover:bg-[#333] text-neutral-200 text-xs font-medium flex items-center gap-1.5 border border-[#383838] transition-all"
                    >
                      <FastForward className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">সব পেজ স্ক্যান</span>
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handleClear}
                title="নতুন ডকুমেন্ট নির্বাচন করুন"
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
        /* Empty Upload Zone */
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
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">PDF (যেকোনো সাইজ)</span>
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">PNG</span>
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">JPG</span>
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">WEBP</span>
            </div>
          </div>
        </div>
      ) : (
        /* Split-Screen Studio */
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* ========================================================
              LEFT COLUMN: PDF & Document Preview with Active Laser Beam
              ======================================================== */}
          <div className="w-full md:w-1/2 flex flex-col border-r border-[#2d2d2d] bg-[#121212] overflow-hidden">
            {/* Page Navigation Bar */}
            <div className="h-11 border-b border-[#282828] bg-[#181818] px-4 flex items-center justify-between text-xs text-neutral-300 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-200">ডকুমেন্ট ভিউয়ার</span>
                {totalPages > 1 && (
                  <span className="text-[11px] bg-[#222] border border-[#333] px-2 py-0.5 rounded-full font-mono text-emerald-400">
                    পেজ {currentPage} / {totalPages}
                  </span>
                )}
              </div>

              {/* Interactive Page Jumper */}
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
              {/* Document Container */}
              <div className="w-full h-full relative rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#1e1e1e] shadow-2xl flex items-center justify-center">
                {/* Laser Animation when scanning */}
                {isScanning && (
                  <>
                    <div className="scanner-laser" />
                    <div className="scanner-overlay" />
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-emerald-950/95 border border-emerald-500/60 text-emerald-300 px-4 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 shadow-2xl backdrop-blur-md">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>পেজ {currentPage} স্ক্যানিং চলছে...</span>
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
            <div className="h-11 border-b border-[#282828] bg-[#1a1a1a] px-4 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-200">শনাক্তকৃত টেক্সট</span>

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
                    {totalPages > 1 && (
                      <button
                        onClick={() => setViewMode("all")}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                          viewMode === "all" ? "bg-emerald-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        সব পেজ ({Object.keys(pageResults).length})
                      </button>
                    )}
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
                    পেজ {currentPage} স্ক্যান করা হচ্ছে...
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
                  <div className="text-xs font-medium text-neutral-300">পেজ {currentPage}-এর কোনো টেক্সট এখনো স্ক্যান করা হয়নি।</div>
                  <div className="text-[11px] text-neutral-500">
                    উপরে থাকা <span className="text-emerald-400 font-medium">'বর্তমান পেজ স্ক্যান ({currentPage})'</span> বাটনে ক্লিক করুন।
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
      )}
    </div>
  );
}
