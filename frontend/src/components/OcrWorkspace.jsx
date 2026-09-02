import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Upload, ChevronLeft, ChevronRight, Copy, Check, 
  Send, Download, Trash2, RefreshCw, Sparkles, Layers, Eye, 
  FileCheck, AlertCircle, Loader2 
} from 'lucide-react';
import { getApiBase } from '../config';

export default function OcrWorkspace({ onInsertIntoChat, onBackToChat }) {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [scanningPage, setScanningPage] = useState(null); // which page is currently being scanned
  const [isScanning, setIsScanning] = useState(false);
  
  // OCR Results
  const [pagesData, setPagesData] = useState([]); // [{ page_num: 1, text: "..." }]
  const [fullText, setFullText] = useState("");
  const [viewMode, setViewMode] = useState("current"); // "current" or "all"
  
  const [languages, setLanguages] = useState("en,bn");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    const isDocPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    
    setFile(selectedFile);
    setIsPdf(isDocPdf);
    setFileUrl(URL.createObjectURL(selectedFile));
    setCurrentPage(1);
    setTotalPages(1);
    setPagesData([]);
    setFullText("");
    setError(null);
    setScanningPage(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFileSelect(dropped);
  };

  // Start Full Scanning
  const handleStartOcr = async () => {
    if (!file || isScanning) return;
    setIsScanning(true);
    setError(null);
    setScanningPage(1);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("languages", languages);

    try {
      const apiBase = getApiBase();
      
      // Artificial step animation for scanning pages if multi-page PDF
      const scanInterval = setInterval(() => {
        setScanningPage(prev => (prev < totalPages ? prev + 1 : prev));
      }, 1200);

      const res = await fetch(`${apiBase}/api/ocr`, {
        method: "POST",
        body: formData,
      });

      clearInterval(scanInterval);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "OCR Extraction Failed.");
      }

      const data = await res.json();
      setTotalPages(data.total_pages || 1);
      setPagesData(data.pages || []);
      setFullText(data.text || "");
      setScanningPage(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsScanning(false);
      setScanningPage(null);
    }
  };

  const getCurrentPageText = () => {
    if (viewMode === "all") return fullText;
    const pageObj = pagesData.find(p => p.page_num === currentPage);
    return pageObj ? pageObj.text : (fullText && totalPages === 1 ? fullText : "");
  };

  const handleCopy = () => {
    const text = getCurrentPageText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToChat = () => {
    const text = getCurrentPageText();
    if (!text) return;
    onInsertIntoChat(text);
    onBackToChat();
  };

  const handleDownloadTxt = () => {
    const text = getCurrentPageText();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name?.replace(/\.[^/.]+$/, "") || "ocr_document"}_page_${currentPage}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setFile(null);
    setFileUrl(null);
    setPagesData([]);
    setFullText("");
    setError(null);
    setScanningPage(null);
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#212121] text-[#ececec] overflow-hidden">
      {/* Top Header */}
      <header className="h-14 border-b border-[#2d2d2d] flex items-center justify-between px-6 bg-[#1a1a1a] shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>PDF & Document OCR Studio</span>
              {isPdf && (
                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded font-mono">
                  PDF
                </span>
              )}
            </h1>
            <p className="text-[11px] text-neutral-400">
              {file ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)` : "ডকুমেন্ট আপলোড করে বাংলা ও ইংরেজি টেক্সট এক্সট্রাক্ট করুন"}
            </p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2.5">
          {file && (
            <>
              {/* Language Selector */}
              <div className="flex items-center gap-1.5 bg-[#262626] border border-[#333] rounded-lg p-1 text-xs">
                <span className="text-[11px] text-neutral-400 pl-1.5">ভাষা:</span>
                <select 
                  value={languages} 
                  onChange={e => setLanguages(e.target.value)}
                  className="bg-transparent text-xs text-neutral-200 focus:outline-none cursor-pointer pr-1"
                >
                  <option value="en,bn" className="bg-[#222]">বাংলা + English</option>
                  <option value="bn" className="bg-[#222]">শুধুমাত্র বাংলা</option>
                  <option value="en" className="bg-[#222]">Only English</option>
                </select>
              </div>

              {/* Scan Button */}
              <button
                onClick={handleStartOcr}
                disabled={isScanning}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
              >
                {isScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isScanning ? "স্ক্যান চলছে..." : "স্ক্যান শুরু করুন"}</span>
              </button>

              <button
                onClick={handleClear}
                title="ডকুমেন্ট পরিবর্তন করুন"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-[#282828] transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={onBackToChat}
            className="px-3 py-1.5 rounded-lg bg-[#282828] hover:bg-[#333] text-neutral-300 text-xs font-medium transition-colors ml-2"
          >
            চ্যাটে ফিরুন
          </button>
        </div>
      </header>

      {/* Main Split Body */}
      {!file ? (
        /* Empty Upload State */
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
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* ========================================================
              LEFT COLUMN: PDF & Document Preview with Laser Scan
              ======================================================== */}
          <div className="w-full md:w-1/2 flex flex-col border-r border-[#2d2d2d] bg-[#141414] overflow-hidden">
            {/* Document Toolbar */}
            <div className="h-10 border-b border-[#282828] bg-[#1a1a1a] px-4 flex items-center justify-between text-xs text-neutral-400 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-300">ডকুমেন্ট ভিউয়ার</span>
                {totalPages > 1 && (
                  <span className="text-[11px] bg-[#282828] px-2 py-0.5 rounded font-mono text-neutral-300">
                    পৃষ্ঠা {currentPage} / {totalPages}
                  </span>
                )}
              </div>

              {/* Page Navigation Controls */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1 rounded hover:bg-[#282828] disabled:opacity-30 text-neutral-300"
                    title="পূর্ববর্তী পৃষ্ঠা"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1 rounded hover:bg-[#282828] disabled:opacity-30 text-neutral-300"
                    title="পরবর্তী পৃষ্ঠা"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Document Preview Canvas / Viewport */}
            <div className="flex-1 relative overflow-auto p-4 flex items-center justify-center bg-[#0d0d0d]">
              {/* Active Scanner Laser Line Animation */}
              {isScanning && (
                <>
                  <div className="scanner-laser" />
                  <div className="scanner-overlay" />
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 px-3 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 shadow-2xl backdrop-blur-md">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>স্ক্যানিং পেজ: {scanningPage || currentPage} / {totalPages}...</span>
                  </div>
                </>
              )}

              {/* PDF or Image Viewer */}
              {isPdf ? (
                <iframe
                  src={`${fileUrl}#page=${currentPage}&toolbar=0&navpanes=0`}
                  title="PDF Preview"
                  className="w-full h-full rounded-xl border border-[#2d2d2d] bg-white shadow-2xl"
                />
              ) : (
                <img 
                  src={fileUrl} 
                  alt="Document preview" 
                  className="max-h-full max-w-full object-contain rounded-xl border border-[#2d2d2d] shadow-2xl"
                />
              )}
            </div>
          </div>

          {/* ========================================================
              RIGHT COLUMN: OCR Live Text Results
              ======================================================== */}
          <div className="w-full md:w-1/2 flex flex-col bg-[#1c1c1c] overflow-hidden">
            {/* Results Toolbar */}
            <div className="h-10 border-b border-[#282828] bg-[#1a1a1a] px-4 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-200">এক্সট্রাক্টেড টেক্সট</span>
                {pagesData.length > 0 && (
                  <div className="flex bg-[#262626] rounded-lg p-0.5 border border-[#333]">
                    <button
                      onClick={() => setViewMode("current")}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                        viewMode === "current" ? "bg-emerald-600 text-white" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      বর্তমান পেজ ({currentPage})
                    </button>
                    {totalPages > 1 && (
                      <button
                        onClick={() => setViewMode("all")}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                          viewMode === "all" ? "bg-emerald-600 text-white" : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        সম্পূর্ণ ডকুমেন্ট
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  disabled={!getCurrentPageText()}
                  className="p-1.5 rounded-lg hover:bg-[#282828] text-neutral-300 disabled:opacity-30 flex items-center gap-1 text-xs"
                  title="টেক্সট কপি করুন"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copied ? "কপি হয়েছে" : "কপি"}</span>
                </button>

                <button
                  onClick={handleDownloadTxt}
                  disabled={!getCurrentPageText()}
                  className="p-1.5 rounded-lg hover:bg-[#282828] text-neutral-300 disabled:opacity-30 flex items-center gap-1 text-xs"
                  title="TXT হিসেবে ডাউনলোড করুন"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ডাউনলোড</span>
                </button>

                <button
                  onClick={handleSendToChat}
                  disabled={!getCurrentPageText()}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 disabled:opacity-30 flex items-center gap-1.5 text-xs font-medium ml-1"
                  title="এই টেক্সট নিয়ে চ্যাটে আলোচনা করুন"
                >
                  <Send className="w-3 h-3" />
                  <span>চ্যাটে পাঠান</span>
                </button>
              </div>
            </div>

            {/* Text Editor Area */}
            <div className="flex-1 p-4 overflow-y-auto flex flex-col">
              {error ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : isScanning ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                  <div className="text-sm font-medium text-white">
                    ডকুমেন্ট স্ক্যান করা হচ্ছে...
                  </div>
                  <div className="text-xs text-neutral-400 max-w-xs">
                    ইমেজ থেকে বাংলা ও ইংরেজি যুক্তবর্ণ এবং প্যারাগ্রাফ আলাদা করা হচ্ছে।
                  </div>
                </div>
              ) : !getCurrentPageText() ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-500 space-y-2">
                  <FileCheck className="w-10 h-10 opacity-30" />
                  <div className="text-xs font-medium">এখনো কোনো টেক্সট এক্সট্রাক্ট করা হয়নি।</div>
                  <div className="text-[11px]">উপরে থাকা <span className="text-emerald-400 font-medium">'স্ক্যান শুরু করুন'</span> বাটনে চাপ দিন।</div>
                </div>
              ) : (
                <textarea
                  value={getCurrentPageText()}
                  readOnly
                  placeholder="শনাক্তকৃত টেক্সট এখানে প্রদর্শিত হবে..."
                  className="flex-1 w-full bg-[#141414] border border-[#2d2d2d] rounded-xl p-4 text-xs md:text-sm text-neutral-200 font-mono leading-relaxed resize-none focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>

            {/* Bottom Status Bar */}
            {pagesData.length > 0 && (
              <div className="h-8 border-t border-[#282828] bg-[#171717] px-4 flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
                <span>মোট লাইন: {getCurrentPageText().split('\n').filter(Boolean).length}</span>
                <span>অক্ষর সংখ্যা: {getCurrentPageText().length}</span>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
