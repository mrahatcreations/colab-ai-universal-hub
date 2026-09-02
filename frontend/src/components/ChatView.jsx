import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  ArrowUp, Sparkles, User, Copy, Check, Square, 
  Paperclip, Sliders, AlertCircle 
} from 'lucide-react';
import { getApiBase } from '../config';

export default function ChatView({
  chat,
  onUpdateChat,
  activeModel,
  onOpenModelHub,
  onOpenOcr
}) {
  const [inputPrompt, setInputPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat?.messages]);

  // Handle textarea auto-height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputPrompt]);

  const handleSend = async (customPrompt = null) => {
    const textToSend = customPrompt || inputPrompt;
    if (!textToSend.trim() || isGenerating) return;

    if (!activeModel || activeModel === "None") {
      alert("⚠️ বর্তমানে কোনো মডেল সক্রিয় নেই! দয়া করে বামপাশের 'Model Manager' থেকে একটি মডেল লোড করুন।");
      onOpenModelHub();
      return;
    }

    const userMessage = { role: 'user', content: textToSend.trim() };
    const initialAssistantMessage = { role: 'assistant', content: "" };

    const updatedMessages = [...(chat?.messages || []), userMessage, initialAssistantMessage];
    const assistantMsgIndex = updatedMessages.length - 1;

    // Update title if first message
    const updatedTitle = (chat?.messages?.length || 0) === 0 
      ? textToSend.trim().slice(0, 32) + (textToSend.length > 32 ? "..." : "")
      : chat.title;

    onUpdateChat(chat.id, {
      title: updatedTitle,
      messages: updatedMessages
    });

    setInputPrompt("");
    setIsGenerating(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const apiBase = getApiBase();
      const response = await fetch(`${apiBase}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...(chat?.messages || []), userMessage],
          max_new_tokens: maxTokens,
          temperature: temperature,
          top_p: 0.9
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === "[DONE]") {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.token) {
                accumulatedText += parsed.token;
                // Live update assistant message
                updatedMessages[assistantMsgIndex].content = accumulatedText;
                onUpdateChat(chat.id, { messages: [...updatedMessages] });
              }
            } catch (err) {
              // Plain text fallback
              accumulatedText += dataStr;
              updatedMessages[assistantMsgIndex].content = accumulatedText;
              onUpdateChat(chat.id, { messages: [...updatedMessages] });
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        updatedMessages[assistantMsgIndex].content += `\n\n❌ **Error:** ${err.message}`;
        onUpdateChat(chat.id, { messages: [...updatedMessages] });
      }
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsGenerating(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const promptSuggestions = [
    { title: "ক্লিন পাইথন স্ক্রিপ্ট", desc: "একটি ওয়েব স্ক্র্যাপার তৈরির উদাহরণ দিন।" },
    { title: "কোয়ান্টাম কম্পিউটিং", desc: "কোয়ান্টাম কম্পিউটিং সহজ ভাষায় ব্যাখ্যা করুন।" },
    { title: "বাংলা কবিতা", desc: "মেঘলা আকাশ ও বর্ষা নিয়ে একটি সুন্দর কবিতা লিখুন।" },
    { title: "কোড রিফ্যাক্টরিং", desc: "আমার কোড কীভাবে আরও অপ্টিমাইজড করব?" }
  ];

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#212121] text-[#ececec] overflow-hidden relative">
      {/* Top Minimal Bar */}
      <header className="h-14 border-b border-[#2d2d2d] flex items-center justify-between px-6 bg-[#212121]/90 backdrop-blur shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenModelHub}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#2b2b2b] hover:bg-[#333333] border border-[#383838] text-xs font-medium text-neutral-200 transition-colors"
          >
            <div className={`w-2 h-2 rounded-full ${activeModel && activeModel !== 'None' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="truncate max-w-[200px]">
              {activeModel && activeModel !== 'None' ? activeModel : 'কোনো মডেল সক্রিয় নেই'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(prev => !prev)}
            className={`p-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
              showSettings ? 'bg-[#333333] text-emerald-400' : 'text-neutral-400 hover:bg-[#2b2b2b] hover:text-white'
            }`}
            title="Generation Parameters"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Generation Settings Drawer */}
      {showSettings && (
        <div className="bg-[#1a1a1a] border-b border-[#2d2d2d] px-6 py-3 text-xs flex items-center gap-6 justify-center">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Max Tokens:</span>
            <input 
              type="range" min="64" max="2048" step="64" value={maxTokens} 
              onChange={e => setMaxTokens(Number(e.target.value))}
              className="accent-emerald-500 w-28"
            />
            <span className="font-mono text-neutral-200">{maxTokens}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Temperature:</span>
            <input 
              type="range" min="0.1" max="1.5" step="0.1" value={temperature} 
              onChange={e => setTemperature(Number(e.target.value))}
              className="accent-emerald-500 w-28"
            />
            <span className="font-mono text-neutral-200">{temperature}</span>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-0">
        {(!chat?.messages || chat.messages.length === 0) ? (
          <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center p-6 space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-[#2a2a2a] border border-[#383838] flex items-center justify-center text-emerald-400 shadow-md">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white mb-1">আমি আপনাকে কীভাবে সাহায্য করতে পারি?</h2>
              <p className="text-sm text-neutral-400">
                {activeModel && activeModel !== 'None' 
                  ? `মডেল সক্রিয় আছে: ${activeModel}` 
                  : "চ্যাট শুরু করতে মডেল ম্যানেজার থেকে একটি মডেল লোড করুন।"}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-4">
              {promptSuggestions.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(`${item.title}: ${item.desc}`)}
                  className="p-3.5 rounded-xl bg-[#2a2a2a] hover:bg-[#333333] border border-[#353535] text-left transition-all duration-150 group"
                >
                  <div className="font-medium text-xs text-neutral-200 group-hover:text-white mb-0.5">{item.title}</div>
                  <div className="text-[11px] text-neutral-400">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-6 space-y-6">
            {chat.messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className="flex gap-4 items-start group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isUser ? 'bg-neutral-700 text-neutral-200' : 'bg-emerald-600 text-white shadow-sm'
                  }`}>
                    {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] text-neutral-300 mb-1">
                      {isUser ? "You" : (activeModel?.split('/').pop() || "Colab AI")}
                    </div>

                    <div className={`text-sm leading-relaxed ${isUser ? 'bg-[#2f2f2f] px-4 py-3 rounded-2xl inline-block text-neutral-100' : 'text-neutral-200 prose prose-invert max-w-none'}`}>
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content || (isGenerating && idx === chat.messages.length - 1 ? "▍" : "")}
                        </ReactMarkdown>
                      )}
                    </div>

                    {!isUser && msg.content && (
                      <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(msg.content, idx)}
                          className="p-1 rounded hover:bg-[#333] text-neutral-400 hover:text-white text-xs flex items-center gap-1"
                        >
                          {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span className="text-[11px]">{copiedIndex === idx ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Floating ChatGPT Input Pill */}
      <div className="p-4 md:pb-6 bg-gradient-to-t from-[#212121] via-[#212121] to-transparent shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-[#2f2f2f] border border-[#424242] focus-within:border-neutral-500 rounded-3xl shadow-xl flex items-end p-2 transition-all">
            <button
              onClick={onOpenOcr}
              title="Upload Image for OCR"
              className="p-2.5 rounded-full text-neutral-400 hover:text-white hover:bg-[#3d3d3d] transition-colors shrink-0 mb-0.5"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={inputPrompt}
              onChange={e => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Colab AI..."
              className="flex-1 bg-transparent text-sm text-neutral-100 placeholder-neutral-400 focus:outline-none resize-none px-2 py-2 max-h-44"
            />

            {isGenerating ? (
              <button
                onClick={handleStop}
                title="Stop generation"
                className="p-2 rounded-full bg-neutral-200 text-neutral-900 hover:bg-white transition-colors shrink-0 mb-0.5"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!inputPrompt.trim()}
                title="Send prompt"
                className={`p-2 rounded-full transition-all shrink-0 mb-0.5 ${
                  inputPrompt.trim() 
                    ? 'bg-white text-neutral-900 hover:bg-neutral-200 shadow-md' 
                    : 'bg-[#404040] text-neutral-500 cursor-not-allowed'
                }`}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="text-center text-[11px] text-neutral-500 mt-2">
            Colab AI can make mistakes. Verify important info.
          </div>
        </div>
      </div>
    </div>
  );
}
