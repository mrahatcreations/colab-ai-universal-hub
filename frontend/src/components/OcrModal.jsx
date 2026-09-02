import React, { useState } from 'react';
import { X, Upload, Image as ImageIcon, Copy, Check, Send, Loader2 } from 'lucide-react';
import { getApiBase } from '../config';

export default function OcrModal({ isOpen, onClose, onInsertIntoChat }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [langs, setLangs] = useState("en,bn");

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setExtractedText("");
      setError(null);
    }
  };

  const handleProcessOcr = async () => {
    if (!file) return;
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("languages", langs);

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/ocr`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "OCR extraction failed.");
      }

      const data = await res.json();
      setExtractedText(data.text || "কোনো টেক্সট পাওয়া যায়নি।");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!extractedText) return;
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToChat = () => {
    if (!extractedText) return;
    onInsertIntoChat(extractedText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1e1e1e] border border-[#333333] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2d2d2d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Vision & Bangla OCR Scanner</h3>
              <p className="text-xs text-neutral-400">ইমেজ থেকে বাংলা ও ইংরেজি টেক্সট এক্সট্রাক্ট করুন</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#2b2b2b] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Upload Area */}
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#3d3d3d] hover:border-neutral-500 rounded-xl p-6 bg-[#171717] transition-colors cursor-pointer relative group">
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            {preview ? (
              <div className="flex flex-col items-center gap-2">
                <img src={preview} alt="Preview" className="max-h-48 rounded-lg object-contain border border-[#333]" />
                <span className="text-xs text-neutral-400 group-hover:text-white">অন্য ছবি বাছাই করতে ক্লিক করুন</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <Upload className="w-8 h-8 text-neutral-400 group-hover:text-emerald-400 transition-colors" />
                <div className="text-xs font-medium text-neutral-200">
                  ছবি ড্র্যাগ করুন অথবা <span className="text-emerald-400 underline">ব্রাউজ করুন</span>
                </div>
                <div className="text-[11px] text-neutral-500">PNG, JPG, WEBP ফরম্যাট সমর্থিত</div>
              </div>
            )}
          </div>

          {/* Action Trigger */}
          {file && (
            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-neutral-400 flex items-center gap-2">
                <span>ভাষা:</span>
                <span className="bg-[#282828] text-neutral-200 px-2 py-0.5 rounded text-[11px] font-mono">বাংলা + English</span>
              </div>

              <button
                onClick={handleProcessOcr}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{isLoading ? "টেক্সট রিড করা হচ্ছে..." : "টেক্সট এক্সট্রাক্ট করুন"}</span>
              </button>
            </div>
          )}

          {/* Extracted Text Viewer */}
          {extractedText && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-300">
                <span>শনাক্তকৃত টেক্সট:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg bg-[#282828] hover:bg-[#333] text-neutral-300 flex items-center gap-1.5 transition-colors text-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "কপি হয়েছে" : "কপি করুন"}</span>
                  </button>

                  <button
                    onClick={handleSendToChat}
                    className="p-1.5 px-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 flex items-center gap-1.5 transition-colors text-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>চ্যাটে পাঠান</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={6}
                value={extractedText}
                onChange={e => setExtractedText(e.target.value)}
                className="w-full bg-[#141414] border border-[#333] rounded-xl p-3 text-xs text-neutral-200 focus:outline-none focus:border-emerald-500 font-mono resize-y"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
