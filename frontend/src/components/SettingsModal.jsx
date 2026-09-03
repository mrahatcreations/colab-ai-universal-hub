import React, { useState, useEffect } from 'react';
import { X, Server, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { getApiBase, setApiBase } from '../config';

export default function SettingsModal({ isOpen, onClose, onApiChanged }) {
  const [url, setUrl] = useState("");
  const [testStatus, setTestStatus] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrl(getApiBase());
      setTestStatus(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await fetch(`${url.trim().replace(/\/+$/, '')}/health`);
      if (res.ok) {
        const data = await res.json();
        setTestStatus({ ok: true, msg: `কানেকশন সফল! (মডেল: ${data.active_model})` });
      } else {
        setTestStatus({ ok: false, msg: `কানেক্ট করা যায়নি (HTTP ${res.status})` });
      }
    } catch (err) {
      setTestStatus({ ok: false, msg: `এরর: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    setApiBase(url);
    onApiChanged();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1e1e1e] border border-[#333333] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2d2d2d]">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-white">API Endpoint Settings</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Colab Cloudflare Tunnel URL:
            </label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://colabapi.iunisphere.com"
              className="w-full bg-[#141414] border border-[#333] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {testStatus && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              testStatus.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {testStatus.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{testStatus.msg}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="px-3 py-1.5 rounded-lg bg-[#282828] hover:bg-[#333] text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>কানেকশন টেস্ট</span>
            </button>

            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors shadow-sm"
            >
              সেভ করুন
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
