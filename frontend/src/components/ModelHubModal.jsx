import React, { useState, useEffect } from 'react';
import { 
  X, HardDrive, Search, Download, Trash2, Zap, 
  RefreshCw, Check, Loader2, AlertTriangle, ShieldCheck 
} from 'lucide-react';
import { getApiBase } from '../config';

// Fallback Recommended Models if backend is offline
const DEFAULT_FALLBACK_MODELS = [
  {
    id: "baidu/Unlimited-OCR",
    name: "Baidu Unlimited-OCR (Long-Horizon Document)",
    badge: "📄 ৪০+ পেজ ১-শট OCR",
    badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    desc: "বই, প্রশ্নব্যাংক ও মাল্টি-পেজ ডকুমেন্ট এক ক্লিকে নির্ভুল টেক্সট ও কলামসহ পার্স করার জন্য আল্ট্রা-ফাস্ট মডেল।",
    vram: "~6.0 GB VRAM"
  },
  {
    id: "Qwen/Qwen2.5-VL-3B-Instruct",
    name: "Qwen 2.5 VL (3B Vision & Layout)",
    badge: "🌟 ২-কলাম বই ও ভিশন (অফিসিয়াল)",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    desc: "বইয়ের ২-কলাম পেজ, চার্ট ও বাংলা যুক্তবর্ণ সরাসরি ছবি দেখে নির্ভুলভাবে পড়ার জন্য এক নম্বর ভিশন মডেল।",
    vram: "~6.8 GB VRAM"
  },
  {
    id: "unsloth/Qwen2.5-7B-Instruct-bnb-4bit",
    name: "Qwen 2.5 Instruct (7B Multilingual)",
    badge: "বাংলা ব্যাকরণ ও প্রশ্নব্যাংক",
    badgeColor: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    desc: "বাংলা ভাষা ও পরীক্ষার ফরম্যাটের জন্য বিশ্বের #১ টেক্সট মডেল (সরাসরি দ্রুত আউটপুট)।",
    vram: "~4.8 GB VRAM"
  },
  {
    id: "unsloth/DeepSeek-R1-Distill-Qwen-7B-bnb-4bit",
    name: "DeepSeek R1 (7B Reasoning)",
    badge: "ডিপ রিজনিং",
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    desc: "জটিল প্রশ্নের গভীর যুক্তি ও বিশ্লেষণ করার জন্য শক্তিশালী রিজনিং ইঞ্জিন।",
    vram: "~5.2 GB VRAM"
  },
  {
    id: "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit",
    name: "Llama 3.1 Instruct (8B Meta)",
    badge: "সুপারফাস্ট",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    desc: "মেটার অত্যন্ত দ্রুতগতির এবং স্থিতিশীল সর্বজনীন ভাষা মডেল।",
    vram: "~5.4 GB VRAM"
  }
];

export default function ModelHubModal({ 
  isOpen, 
  onClose, 
  activeModel, 
  onModelChanged, 
  vramInfo 
}) {
  const [tab, setTab] = useState("downloaded"); // 'downloaded' or 'search'
  const [downloadedModels, setDownloadedModels] = useState([]);
  const [featuredModels, setFeaturedModels] = useState(DEFAULT_FALLBACK_MODELS);
  const [customLoadRepoId, setCustomLoadRepoId] = useState("");
  const [quantization, setQuantization] = useState("4bit");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingModelId, setLoadingModelId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadRepoId, setDownloadRepoId] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDownloadedModels();
    }
  }, [isOpen]);

  const fetchDownloadedModels = async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/models`);
      if (res.ok) {
        const data = await res.json();
        setDownloadedModels(data.downloaded_models || []);
        if (data.featured_models && Array.isArray(data.featured_models) && data.featured_models.length > 0) {
          setFeaturedModels(data.featured_models);
        }
      }
    } catch (err) {
      console.error("Failed to fetch models", err);
    }
  };

  const handleLoadModel = async (repoId) => {
    setIsLoading(true);
    setLoadingModelId(repoId);
    setStatusMessage({ type: 'info', text: `মডেল '${repoId}' লোড হচ্ছে (${quantization.toUpperCase()} মোড)... এটি ১-২ মিনিট সময় নিতে পারে।` });

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/models/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_id: repoId, quantization }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load model.");

      setStatusMessage({ type: 'success', text: `🎉 সফলভাবে লোড হয়েছে: ${repoId}` });
      onModelChanged(repoId);
      fetchDownloadedModels();
    } catch (err) {
      setStatusMessage({ type: 'error', text: `❌ লোড এরর: ${err.message}` });
    } finally {
      setIsLoading(false);
      setLoadingModelId(null);
    }
  };

  const handleUnloadModel = async () => {
    setIsLoading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/models/unload`, { method: "POST" });
      if (res.ok) {
        setStatusMessage({ type: 'success', text: "✅ মেমরি সম্পূর্ণ খালি করা হয়েছে (VRAM Cleared)।" });
        onModelChanged("None");
        fetchDownloadedModels();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `এরর: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = async (folderName) => {
    if (!confirm(`আপনি কি নিশ্চিত যে '${folderName}' ডিস্ক থেকে মুছে ফেলতে চান?`)) return;
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/models/${folderName}`, { method: "DELETE" });
      if (res.ok) {
        fetchDownloadedModels();
        setStatusMessage({ type: 'success', text: "মডেল মুছে ফেলা হয়েছে।" });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleSearchHf = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setStatusMessage(null);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/hf/search?q=${encodeURIComponent(searchQuery)}&limit=15`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        if ((data.results || []).length === 0) {
          setStatusMessage({ type: 'info', text: `'${searchQuery}'-এর জন্য কোনো মডেল পাওয়া যায়নি। সরাসরি Repo ID দিয়ে ডাউনলোড করতে পারেন।` });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `সার্চ এরর: ${err.message}` });
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownloadHf = async (repoId) => {
    const targetId = repoId || downloadRepoId;
    if (!targetId.trim()) return;
    setIsDownloading(true);
    setStatusMessage({ type: 'info', text: `মডেল ডাউনলোড শুরু হয়েছে: ${targetId}... Hugging Face থেকে ডাউনলোড হতে কিছুক্ষণ সময় লাগবে।` });

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/hf/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Download failed.");

      setStatusMessage({ type: 'success', text: `🎉 ডাউনলোড সম্পন্ন হয়েছে: ${targetId}` });
      fetchDownloadedModels();
      setDownloadRepoId("");
    } catch (err) {
      setStatusMessage({ type: 'error', text: `ডাউনলোড ব্যর্থ: ${err.message}` });
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1e1e1e] border border-[#333333] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2d2d2d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-600/20 text-sky-400 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Model Hub & GPU Manager</h3>
              <p className="text-xs text-neutral-400">মডেল লোড/আনলোড ও Hugging Face ডাউনলোডার</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#2b2b2b] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-[#2d2d2d] bg-[#171717] px-6">
          <button
            onClick={() => setTab("downloaded")}
            className={`py-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 mr-6 ${
              tab === "downloaded" 
                ? "border-sky-500 text-white" 
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>সংরক্ষিত মডেল ({downloadedModels.length})</span>
          </button>

          <button
            onClick={() => setTab("search")}
            className={`py-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
              tab === "search" 
                ? "border-sky-500 text-white" 
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Hugging Face সার্চ ও ডাউনলোড</span>
          </button>
        </div>

        {/* Status Alert */}
        {statusMessage && (
          <div className={`mx-6 mt-4 p-3 rounded-xl text-xs flex items-center gap-2 border ${
            statusMessage.type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
            statusMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
            'bg-sky-500/10 border-sky-500/30 text-sky-300'
          }`}>
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Tab 1: Downloaded Models */}
        {tab === "downloaded" && (
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {/* Quantization selector & controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-[#171717] border border-[#2b2b2b] text-xs">
              <div className="flex items-center gap-2">
                <span className="text-neutral-400">কোয়ান্টাইজেশন:</span>
                <div className="flex gap-1 bg-[#222] p-0.5 rounded-lg border border-[#333]">
                  {["4bit", "8bit", "fp16"].map(q => (
                    <button
                      key={q}
                      onClick={() => setQuantization(q)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                        quantization === q ? "bg-sky-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                      }`}
                    >
                      {q.toUpperCase()}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-neutral-500 font-mono">(T4-র জন্য 4-Bit প্রস্তাবিত)</span>
              </div>

              {activeModel && activeModel !== "None" && (
                <button
                  onClick={handleUnloadModel}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-medium transition-colors"
                >
                  🧹 মেমরি খালি করুন (Unload)
                </button>
              )}
            </div>

            {/* Direct Model Repo ID Load Bar */}
            <div className="p-3 bg-[#171717] border border-[#2b2b2b] rounded-xl flex items-center gap-2">
              <input
                type="text"
                placeholder="যেকোনো HuggingFace Repo ID দিন (যেমন: baidu/Unlimited-OCR বা Qwen/Qwen2.5-3B)"
                value={customLoadRepoId}
                onChange={e => setCustomLoadRepoId(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && customLoadRepoId.trim()) {
                    handleLoadModel(customLoadRepoId.trim());
                  }
                }}
                className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none font-mono"
              />
              <button
                onClick={() => handleLoadModel(customLoadRepoId.trim())}
                disabled={isLoading || !customLoadRepoId.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 disabled:opacity-50"
              >
                {loadingModelId === customLoadRepoId.trim() ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span>সরাসরি লোড</span>
              </button>
            </div>

            {/* Featured / Recommended Models */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-neutral-400 px-1 font-medium">
                <span className="flex items-center gap-1.5 text-white">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>প্রস্তাবিত মডেলসমূহ (১-ক্লিকে লোড করুন)</span>
                </span>
                <span className="text-[10px] text-neutral-500">স্বয়ংক্রিয়ভাবে ডাউনলোড ও রান হবে</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {featuredModels.map(fm => {
                  const isActive = activeModel === fm.id;
                  return (
                    <div
                      key={fm.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                        isActive 
                          ? "bg-emerald-950/20 border-emerald-500/40 shadow-sm" 
                          : "bg-[#171717] border-[#2b2b2b] hover:border-neutral-700"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-white">{fm.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${fm.badgeColor}`}>
                            {fm.badge}
                          </span>
                          <span className="text-[10px] text-neutral-500 font-mono bg-[#222] px-1.5 py-0.5 rounded border border-[#333]">
                            {fm.vram}
                          </span>
                          {isActive && (
                            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">{fm.desc}</p>
                        <div className="text-[10px] text-neutral-500 font-mono mt-1 truncate">
                          Repo: {fm.id}
                        </div>
                      </div>

                      <div className="shrink-0">
                        <button
                          onClick={() => handleLoadModel(fm.id)}
                          disabled={isLoading || isActive}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                            isActive 
                              ? "bg-neutral-800 text-neutral-500 cursor-default" 
                              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:scale-[1.02]"
                          }`}
                        >
                          {loadingModelId === fm.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 fill-current" />
                          )}
                          <span>
                            {isActive ? "রানিং আছে" : loadingModelId === fm.id ? "লোড হচ্ছে..." : "লোড করুন (Load)"}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Downloaded Models on Disk */}
            {downloadedModels.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="text-xs text-neutral-400 px-1 font-medium flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                  <span>ডিস্কে আগে থেকে ডাউনলোড করা মডেল ({downloadedModels.length})</span>
                </div>
                <div className="space-y-2">
                  {downloadedModels.map(m => {
                    const isActive = activeModel === m.id;
                    const isCurrentLoading = loadingModelId === m.id;
                    return (
                      <div
                        key={m.folder}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                          isActive 
                            ? "bg-sky-950/20 border-sky-500/40" 
                            : "bg-[#171717] border-[#2b2b2b] hover:border-neutral-700"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-white truncate">{m.id}</span>
                            {isActive && (
                              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleLoadModel(m.id)}
                            disabled={isLoading || isActive}
                            className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${
                              isActive 
                                ? "bg-neutral-800 text-neutral-500" 
                                : "bg-sky-600 hover:bg-sky-500 text-white"
                            }`}
                          >
                            {isCurrentLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Zap className="w-3.5 h-3.5" />
                            )}
                            <span>{isActive ? "রানিং" : isCurrentLoading ? "লোড হচ্ছে..." : "চালান"}</span>
                          </button>
                          <button
                            onClick={() => handleDeleteModel(m.folder)}
                            disabled={isLoading}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: HF Search & Download */}
        {tab === "search" && (
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            <form onSubmit={handleSearchHf} className="flex gap-2">
              <input
                type="text"
                placeholder="যেমন: qwen, mistral, llama, bangla..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-[#141414] border border-[#333] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-2 transition-all shadow-md shrink-0"
              >
                {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>খুঁজুন</span>
              </button>
            </form>

            {/* Direct Repo ID input */}
            <div className="p-3 bg-[#171717] border border-[#2b2b2b] rounded-xl flex items-center gap-2">
              <input
                type="text"
                placeholder="সরাসরি Repo ID দিন (যেমন: TinyLlama/TinyLlama-1.1B-Chat-v1.0)"
                value={downloadRepoId}
                onChange={e => setDownloadRepoId(e.target.value)}
                className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none"
              />
              <button
                onClick={() => handleDownloadHf(downloadRepoId)}
                disabled={isDownloading || !downloadRepoId.trim()}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 disabled:opacity-50"
              >
                {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>ডাউনলোড</span>
              </button>
            </div>

            {/* Quick Search Tag Suggestions */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-neutral-500">জনপ্রিয় সার্চ:</span>
              {["baidu/Unlimited-OCR", "Qwen2.5-VL", "DeepSeek", "Bangla", "Llama-3"].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setSearchQuery(tag);
                    setTimeout(() => {
                      setSearchQuery(tag);
                    }, 50);
                  }}
                  className="text-[10px] bg-[#1f1f1f] hover:bg-[#2a2a2a] text-neutral-400 hover:text-white px-2 py-0.5 rounded-full border border-[#333] transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Search Results */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">সার্চ ফলাফল</div>
              {searchResults.length === 0 ? (
                <div className="text-xs text-neutral-500 italic p-4 text-center">
                  {isSearching ? "মডেল খোঁজা হচ্ছে..." : "কোনো মডেল সার্চ করতে উপরের বক্সে লিখুন।"}
                </div>
              ) : (
                searchResults.map(res => {
                  const isActive = activeModel === res.id;
                  const isCurrentLoading = loadingModelId === res.id;
                  return (
                    <div key={res.id} className="p-3 rounded-xl bg-[#171717] border border-[#2b2b2b] flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white truncate">{res.id}</span>
                          {isActive && (
                            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-0.5">
                          ডাউনলোড: {res.downloads.toLocaleString()} | লাইক: {res.likes.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleLoadModel(res.id)}
                          disabled={isLoading || isActive}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                            isActive
                              ? "bg-neutral-800 text-neutral-500"
                              : "bg-emerald-600 hover:bg-emerald-500 text-white"
                          }`}
                          title="সরাসরি লোড করুন"
                        >
                          {isCurrentLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5" />
                          )}
                          <span>{isActive ? "রানিং" : "লোড"}</span>
                        </button>

                        <button
                          onClick={() => handleDownloadHf(res.id)}
                          disabled={isDownloading}
                          className="px-2.5 py-1.5 rounded-lg bg-[#282828] hover:bg-sky-600 hover:text-white text-neutral-300 text-xs font-medium flex items-center gap-1 transition-all"
                          title="ডিস্কে ডাউনলোড করে রাখুন"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ডাউনলোড</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
