import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  FileText, Upload, ChevronLeft, ChevronRight, Copy, Check, 
  Send, Download, Trash2, Sparkles, Layers, Eye, 
  FileCheck, AlertCircle, Loader2, Play, Square, FastForward,
  CheckSquare, ListFilter, SlidersHorizontal, Image as ImageIcon,
  Wand2, Code, BookOpen
} from 'lucide-react';
import { getApiBase } from '../config';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

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

// Pure Heuristic Book Layout Formatter: parses and structures questions, options, headers, and explanations with generous spacing
function formatBookPageContent(rawText) {
  if (!rawText) return "";

  // 1. Clean horizontal column dividers
  let clean = rawText
    .replace(/(?:^|\n)(---+\s*(?:\[?কলাম|Page|পৃষ্ঠা)[^\n]*)/gi, '\n\n$1\n\n')
    // Split options on same line (e.g. "A. ঢাকা B. চট্টগ্রাম C. খুলনা D. রাজশাহী")
    .replace(/\s+([A-D][\.\)])\s+/g, '\n  - **$1** ')
    .replace(/^([A-D][\.\)])\s+/gm, '  - **$1** ');

  const rawLines = clean.split('\n');
  const formattedLines = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    // Question Number Start (e.g. "১.", "২.", "1.", "10.", "১৬.", "প্রশ্ন")
    if (/^(\d{1,3}[\.\)]\s*|প্রশ্ন\s*[:\-\s]*\d*)/i.test(line)) {
      formattedLines.push(`\n\n---\n\n### 🔹 ${line}\n`);
      continue;
    }

    // Answer / Explanation
    if (/^(?:উত্তর|Ans|Answer)\s*[:\-]/i.test(line)) {
      formattedLines.push(`\n> 💡 **${line}**`);
      continue;
    }
    if (/^(?:ব্যাখ্যা|Explanation)\s*[:\-]/i.test(line)) {
      formattedLines.push(`> 📖 **${line}**\n`);
      continue;
    }

    // Book, Subject or Exam Header
    if (/^(?:ঢাকা বিশ্ববিদ্যালয়|প্রশ্নব্যাংক|ভর্তি পরীক্ষা|সূচিপত্র|বিষয়|বিভাগ পরিবর্তন|কলা,\s*আইন)/i.test(line)) {
      formattedLines.push(`\n## 📌 ${line}\n`);
      continue;
    }

    formattedLines.push(line);
  }

  return formattedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export default function OcrWorkspace({ onInsertIntoChat, onBackToChat }) {
  const [file, setFile] = useState(null);
  const [isPdf, setIsPdf] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null); // Loaded PDF.js document object
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  
  // Local Rendered Single-Page Image Cache: { 1: { url: "blob:...", blob: Blob }, ... }
  const [renderedPages, setRenderedPages] = useState({});
  const [isRenderingPage, setIsRenderingPage] = useState(false);

  // Custom Page Selection state
  const [pageRangeInput, setPageRangeInput] = useState("all");
  const [selectedPreset, setSelectedPreset] = useState("all"); // 'all', 'odd', 'even', 'custom'
  const [currentScanningTarget, setCurrentScanningTarget] = useState(null); // page currently being scanned
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });

  // OCR Results cache per page: { 1: "text of page 1", 2: "text of page 2" }
  const [pageResults, setPageResults] = useState({});
  const [viewMode, setViewMode] = useState("current"); // "current" or "all"
  const [formatTab, setFormatTab] = useState("formatted"); // 'formatted' or 'raw'
  const [isAiFormatting, setIsAiFormatting] = useState(false);
  const [autoAiProofread, setAutoAiProofread] = useState(true); // Automatically runs AI to understand sentences and correct spellings
  
  const [languages, setLanguages] = useState("en,bn");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(renderedPages).forEach(item => {
        if (item?.url && item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  // In-Browser Instant PDF Page Renderer using PDF.js
  const renderPageLocally = async (doc, pageNum) => {
    if (!doc || renderedPages[pageNum]) return renderedPages[pageNum];

    setIsRenderingPage(true);
    try {
      const page = await doc.getPage(pageNum);
      // High resolution 2.0x scale for crisp OCR and crystal clear display
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const blobUrl = URL.createObjectURL(blob);

      const pageData = { url: blobUrl, blob };
      setRenderedPages(prev => ({ ...prev, [pageNum]: pageData }));
      return pageData;
    } catch (err) {
      console.error(`Error rendering page ${pageNum} locally:`, err);
      return null;
    } finally {
      setIsRenderingPage(false);
    }
  };

  // When currentPage or pdfDoc changes, ensure page is rendered locally
  useEffect(() => {
    if (pdfDoc && !renderedPages[currentPage]) {
      renderPageLocally(pdfDoc, currentPage);
    }
  }, [pdfDoc, currentPage]);

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    const isDocPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    
    // Revoke previous images
    Object.values(renderedPages).forEach(item => {
      if (item?.url && item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
    });

    setFile(selectedFile);
    setIsPdf(isDocPdf);
    setRenderedPages({});
    setCurrentPage(1);
    setTotalPages(1);
    setPageResults({});
    setError(null);
    setPageRangeInput("all");
    setSelectedPreset("all");

    if (isDocPdf) {
      setIsRenderingPage(true);
      try {
        // Read file locally without uploading 67MB across the network!
        const arrayBuffer = await selectedFile.arrayBuffer();
        const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPdfDoc(loadedPdf);
        setTotalPages(loadedPdf.numPages);
        
        // Render Page 1 instantly
        await renderPageLocally(loadedPdf, 1);
      } catch (err) {
        setError(`PDF লোড ব্যর্থ হয়েছে: ${err.message}`);
      } finally {
        setIsRenderingPage(false);
      }
    } else {
      // Standard image
      const blobUrl = URL.createObjectURL(selectedFile);
      setPdfDoc(null);
      setTotalPages(1);
      setRenderedPages({ 1: { url: blobUrl, blob: selectedFile } });
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

  // Batch / Range Automated Scanner (Sends ONLY ~200KB single page image!)
  const handleStartAutoScan = async () => {
    if (!file || isScanning) return;
    if (targetPages.length === 0) {
      setError("দয়া করে সঠিক পেজ নম্বর বা রেঞ্জ লিখুন (যেমন: 1-10, 1,3,5, odd, even)");
      return;
    }

    setIsScanning(true);
    setError(null);
    setViewMode("all");
    setScanProgress({ done: 0, total: targetPages.length });

    abortControllerRef.current = new AbortController();
    const apiBase = getApiBase();

    for (let i = 0; i < targetPages.length; i++) {
      if (abortControllerRef.current?.signal?.aborted) break;

      const p = targetPages[i];
      
      // 1. Advance to page and ensure local high-res render is ready
      setCurrentPage(p);
      setCurrentScanningTarget(p);

      let pageData = renderedPages[p];
      if (!pageData && pdfDoc) {
        pageData = await renderPageLocally(pdfDoc, p);
      }

      if (!pageData?.blob) {
        console.error(`Could not get image for page ${p}`);
        continue;
      }

      // 2. Send ONLY the single 200KB page image to Colab T4 GPU!
      const formData = new FormData();
      formData.append("file", pageData.blob, `page_${p}.png`);
      formData.append("languages", languages);

      try {
        const res = await fetch(`${apiBase}/api/ocr`, {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current.signal
        });

        if (res.ok) {
          const data = await res.json();
          const structuredText = formatBookPageContent(data.text || "");
          const rawLines = structuredText.split("\n");
          
          if (rawLines.length === 0) {
            setPageResults(prev => ({ ...prev, [p]: "কোনো টেক্সট পাওয়া যায়নি।" }));
          } else {
            let streamAccumulator = "";
            for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
              if (abortControllerRef.current?.signal?.aborted) break;
              streamAccumulator += (streamAccumulator ? "\n" : "") + rawLines[lineIdx];
              
              setPageResults(prev => ({
                ...prev,
                [p]: streamAccumulator
              }));

              // 20ms smooth typewriter streaming pace
              await new Promise(r => setTimeout(r, 20));
            }
          }
          setScanProgress({ done: i + 1, total: targetPages.length });

          // Immediately & automatically run AI to understand sentences, fix spellings, and build book structure!
          if (autoAiProofread && !abortControllerRef.current?.signal?.aborted && data.text) {
            await formatTextWithAi(data.text, p);
          }
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

  // Split page text into focused atomic chunks (1 question or section at a time)
  const splitIntoAtomicChunks = (rawText) => {
    if (!rawText || !rawText.trim()) return [];
    const lines = rawText.split('\n');
    const chunks = [];
    let current = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Question start or major section header marks a new atomic chunk
      const isQuestionStart = /^(\d{1,3}[\.\)]|প্রশ্ন\s*[:\-\s]*\d*)/i.test(line);
      const isSectionHeader = /^(\#\#|সূচিপত্র|বিষয়|বিভাগ|---+\s*\[?কলাম)/i.test(line);

      if ((isQuestionStart || isSectionHeader) && current.length > 0) {
        chunks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
        // Flush long prose chunks so context remains small & sharp
        if (current.length >= 8 && !isQuestionStart) {
          chunks.push(current.join('\n'));
          current = [];
        }
      }
    }

    if (current.length > 0) {
      chunks.push(current.join('\n'));
    }

    return chunks.length > 0 ? chunks : [rawText];
  };

  // Universal Atomic Chunk-by-Chunk AI Document Refinement Engine
  const formatTextWithAi = async (textToFormat, targetPageNum = null) => {
    if (!textToFormat || !textToFormat.trim()) return;

    setIsAiFormatting(true);
    setFormatTab("formatted");

    const pageKey = targetPageNum || currentPage;
    const atomicChunks = splitIntoAtomicChunks(textToFormat);
    let pageFullAccumulator = "";

    const systemPrompt = `You are an expert multilingual document comprehension and editorial intelligence engine.
Your task: Read this short text chunk (representing a single question, section, or paragraph from a book).

Core Instructions:
1. Sentence-Level Semantic Comprehension & Automatic Typo Correction:
   - Carefully read and understand the complete sentence meaning, subject matter, and grammar.
   - Automatically correct any misrecognized OCR spellings, broken Bengali conjuncts (যুক্তবর্ণ), split compound words, and misread letters based on your semantic understanding of the sentence (e.g. identify government ministries, historical political figures, exam details, literary quotes).
   - If two different columns or topics collided into the same line, separate them into their respective distinct questions or sections.

2. Book Layout, Gaps, and Structure:
   - Provide generous vertical breathing room (blank line gaps) between every question and section, exactly like a printed book.
   - For academic tests/questions:
     * Put each question on its own clean header: ### 🔹 প্রশ্ন [নম্বর]: [প্রশ্ন]
     * Format option choices clearly on separate lines: - **(A)** ... - **(B)** ...
     * Format answer and explanation in a clean quote block: > 💡 **উত্তর:** ... > 📖 **ব্যাখ্যা:** ...
   - For tables of contents or indices: Render as aligned Markdown tables with generous spacing.

3. Pure Output:
   - Output ONLY the finished, impeccably formatted Markdown text. Do NOT include any introductory greetings, commentary, or conversational remarks.`;

    try {
      const apiBase = getApiBase();

      for (let cIdx = 0; cIdx < atomicChunks.length; cIdx++) {
        if (abortControllerRef.current?.signal?.aborted) break;

        const chunkText = atomicChunks[cIdx];
        const userMessage = `Process, correct, and intelligently structure this small text chunk:\n\n${chunkText}`;

        const res = await fetch(`${apiBase}/api/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage }
            ],
            max_new_tokens: 1024,
            temperature: 0.2
          }),
          signal: abortControllerRef.current?.signal
        });

        if (!res.ok) continue;

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let chunkAccumulator = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkStr = decoder.decode(value, { stream: true });
          const lines = chunkStr.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") break;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.token) {
                  chunkAccumulator += parsed.token;
                  const cleanChunk = chunkAccumulator.replace(/<think>[\s\S]*?<\/think>/gi, '').trimStart();
                  setPageResults(prev => ({
                    ...prev,
                    [pageKey]: (pageFullAccumulator ? pageFullAccumulator + "\n\n---\n\n" : "") + cleanChunk
                  }));
                }
              } catch {
                chunkAccumulator += dataStr;
                const cleanChunk = chunkAccumulator.replace(/<think>[\s\S]*?<\/think>/gi, '').trimStart();
                setPageResults(prev => ({
                  ...prev,
                  [pageKey]: (pageFullAccumulator ? pageFullAccumulator + "\n\n---\n\n" : "") + cleanChunk
                }));
              }
            }
          }
        }

        const finalCleanChunk = chunkAccumulator.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (finalCleanChunk) {
          pageFullAccumulator = (pageFullAccumulator ? pageFullAccumulator + "\n\n---\n\n" : "") + finalCleanChunk;
          setPageResults(prev => ({
            ...prev,
            [pageKey]: pageFullAccumulator
          }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiFormatting(false);
    }
  };

  const handleAiFormat = () => {
    formatTextWithAi(getActiveText(), currentPage);
  };

  const getCombinedText = () => {
    const pages = Object.keys(pageResults).sort((a, b) => Number(a) - Number(b));
    if (pages.length === 0) return "";
    return pages.map(p => `## পৃষ্ঠা ${p}\n\n${pageResults[p]}`).join("\n\n---\n\n");
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
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name?.replace(/\.[^/.]+$/, "") || "ocr_document"}_${viewMode === "all" ? "full" : `page_${currentPage}`}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setFile(null);
    setPdfDoc(null);
    setRenderedPages({});
    setPageResults({});
    setError(null);
    setCurrentPage(1);
    setTotalPages(1);
    setCurrentScanningTarget(null);
  };

  const currentDisplayImage = renderedPages[currentPage]?.url;

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
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                  {totalPages} {totalPages === 1 ? 'Page' : 'Pages'} (Instant Fit)
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
              <span className="bg-[#242424] px-2 py-0.5 rounded border border-[#333]">PDF (যেকোনো সাইজ)</span>
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
              SPLIT BODY (Left: Single-Page Fit View, Right: OCR Text)
              ======================================================== */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            
            {/* ========================================================
                LEFT COLUMN: 100% Fit Single-Page Canvas (Zero Overflow)
                ======================================================== */}
            <div className="w-full md:w-1/2 flex flex-col border-r border-[#2d2d2d] bg-[#111111] overflow-hidden">
              {/* Page Navigation Bar */}
              <div className="h-10 border-b border-[#282828] bg-[#181818] px-4 flex items-center justify-between text-xs text-neutral-300 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-200">সিঙ্গেল পেজ ভিউ</span>
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

              {/* Single Page High-Resolution Container (100% Fit, Zero Overflow) */}
              <div className="flex-1 relative overflow-hidden p-4 bg-[#0a0a0a] flex items-center justify-center select-none">
                {/* Visual Laser Scanner Beam positioned strictly inside container */}
                {isScanning && (
                  <>
                    <div className="scanner-laser" />
                    <div className="scanner-overlay" />
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-emerald-950/95 border border-emerald-500/60 text-emerald-300 px-4 py-1.5 rounded-full text-xs font-mono flex items-center gap-2 shadow-2xl backdrop-blur-md">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>পেজ {currentScanningTarget || currentPage} স্ক্যান হচ্ছে...</span>
                    </div>
                  </>
                )}

                {/* Page Image Display (100% Fit & Crisp) */}
                {isRenderingPage && !currentDisplayImage ? (
                  <div className="flex flex-col items-center justify-center text-center space-y-2 text-neutral-500">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                    <span className="text-xs font-mono">পেজ {currentPage} দ্রুত লোড হচ্ছে...</span>
                  </div>
                ) : currentDisplayImage ? (
                  <div className="relative max-h-full max-w-full flex items-center justify-center rounded-lg shadow-2xl overflow-hidden border border-[#2a2a2a] bg-white">
                    <img 
                      src={currentDisplayImage} 
                      alt={`Page ${currentPage}`} 
                      className="max-h-[calc(100vh-180px)] max-w-full object-contain block"
                    />
                  </div>
                ) : (
                  <div className="text-neutral-500 text-xs italic">
                    পেজ প্রিভিউ প্রস্তুত হচ্ছে...
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================
                RIGHT COLUMN: Smart Extracted Text & AI Formatter
                ======================================================== */}
            <div className="w-full md:w-1/2 flex flex-col bg-[#181818] overflow-hidden">
              {/* Results Header Toolbar */}
              <div className="h-10 border-b border-[#282828] bg-[#1a1a1a] px-4 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-200">টেক্সট ফলাফল</span>

                  {/* Smart View Toggle: Formatted vs Raw */}
                  <div className="flex bg-[#242424] rounded-lg p-0.5 border border-[#333]">
                    <button
                      onClick={() => setFormatTab("formatted")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-all ${
                        formatTab === "formatted" ? "bg-emerald-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>স্মার্ট ভিউ</span>
                    </button>

                    <button
                      onClick={() => setFormatTab("raw")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-all ${
                        formatTab === "raw" ? "bg-emerald-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      <Code className="w-3 h-3" />
                      <span>র (Raw)</span>
                    </button>
                  </div>

                  {Object.keys(pageResults).length > 0 && (
                    <div className="flex bg-[#242424] rounded-lg p-0.5 border border-[#333]">
                      <button
                        onClick={() => setViewMode("current")}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          viewMode === "current" ? "bg-[#333] text-white" : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        পেজ {currentPage}
                      </button>
                      <button
                        onClick={() => setViewMode("all")}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                          viewMode === "all" ? "bg-[#333] text-white" : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        সব পেজ ({Object.keys(pageResults).length})
                      </button>
                    </div>
                  )}
                </div>

                {/* AI Polish & Actions */}
                <div className="flex items-center gap-1.5">
                  {/* Magic AI Smart Clean Button */}
                  <button
                    onClick={handleAiFormat}
                    disabled={!getActiveText() || isAiFormatting}
                    className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-30"
                    title="DeepSeek AI দিয়ে বানান ঠিক করে সুন্দর প্রশ্ন ও টেবিলে সাজান"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${isAiFormatting ? 'animate-spin' : ''}`} />
                    <span>{isAiFormatting ? "সাজানো হচ্ছে..." : "✨ AI দিয়ে সাজান"}</span>
                  </button>

                  <button
                    onClick={handleCopy}
                    disabled={!getActiveText()}
                    className="p-1.5 rounded-lg hover:bg-[#282828] text-neutral-300 disabled:opacity-30 flex items-center gap-1 text-xs transition-colors"
                    title="টেক্সট কপি করুন"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{copied ? "কপি" : "কপি"}</span>
                  </button>

                  <button
                    onClick={handleDownloadTxt}
                    disabled={!getActiveText()}
                    className="p-1.5 rounded-lg hover:bg-[#282828] text-neutral-300 disabled:opacity-30 flex items-center gap-1 text-xs transition-colors"
                    title="Markdown/TXT ডাউনলোড"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">ডাউনলোড</span>
                  </button>

                  <button
                    onClick={handleSendToChat}
                    disabled={!getActiveText()}
                    className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 disabled:opacity-30 flex items-center gap-1.5 text-xs font-medium ml-1 transition-all"
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
                ) : !getActiveText() && !isScanning ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-500 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#222] border border-[#333] flex items-center justify-center text-neutral-400">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-medium text-neutral-300">এখনো কোনো টেক্সট স্ক্যান করা হয়নি।</div>
                    <div className="text-[11px] text-neutral-500">
                      উপরে <span className="text-emerald-400 font-medium">'All', 'Odd', 'Even'</span> অথবা রেঞ্জ দিয়ে <span className="text-emerald-400 font-medium">'অটো স্ক্যান শুরু করুন'</span> বাটনে ক্লিক করুন।
                    </div>
                  </div>
                ) : formatTab === "formatted" ? (
                  /* Editorial Smart Markdown View */
                  <div className="flex-1 bg-[#141414] border border-[#2b2b2b] rounded-xl p-5 overflow-y-auto text-neutral-200 prose prose-invert max-w-none text-xs md:text-sm leading-relaxed space-y-3 whitespace-pre-line">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {getActiveText() + (isScanning ? "\n\n`[পেজ " + (currentScanningTarget || currentPage) + " স্ক্যানিং চলছে... ▍]`" : "")}
                    </ReactMarkdown>
                  </div>
                ) : (
                  /* Raw Editable Textarea */
                  <div className="flex-1 flex flex-col relative h-full">
                    <textarea
                      value={getActiveText() + (isScanning ? "\n\n[পেজ " + (currentScanningTarget || currentPage) + " স্ক্যানিং চলছে... ▍]" : "")}
                      readOnly
                      placeholder="শনাক্তকৃত টেক্সট এখানে রিয়েল-টাইমে স্ট্রিম হবে..."
                      className="flex-1 w-full bg-[#131313] border border-[#2b2b2b] rounded-xl p-4 text-xs md:text-sm text-neutral-100 font-mono leading-relaxed resize-none focus:outline-none focus:border-emerald-500"
                    />
                  </div>
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
