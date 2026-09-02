import React, { useState, useEffect } from 'react';
import { 
  Plus, MessageSquare, Image, Cpu, HardDrive, 
  Settings, Trash2, Check, RefreshCw, Sparkles, ChevronDown 
} from 'lucide-react';
import { getApiBase } from '../config';

export default function Sidebar({ 
  currentChatId, 
  setCurrentChatId, 
  chats, 
  setChats, 
  activeTab, 
  setActiveTab,
  activeModel,
  onOpenModelHub,
  onOpenOcr,
  onOpenSettings,
  vramInfo,
  onRefreshStatus
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleNewChat = () => {
    const newId = Date.now().toString();
    const newChat = {
      id: newId,
      title: "New chat",
      messages: [],
      createdAt: new Date().toISOString()
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newId);
    setActiveTab('chat');
  };

  const handleDeleteChat = (e, chatId) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (currentChatId === chatId) {
      const remaining = chats.filter(c => c.id !== chatId);
      setCurrentChatId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  return (
    <aside className="w-64 bg-[#171717] border-r border-[#262626] flex flex-col h-screen select-none shrink-0 z-20">
      {/* Brand Header & New Chat */}
      <div className="p-3 border-b border-[#262626] flex flex-col gap-2">
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-white">Colab AI</span>
          </div>
          <button 
            onClick={onOpenSettings}
            title="API Settings"
            className="p-1.5 rounded-md hover:bg-[#262626] text-neutral-400 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#212121] hover:bg-[#282828] text-neutral-200 text-sm font-medium border border-[#333333] transition-all duration-150 group"
        >
          <div className="flex items-center gap-2.5">
            <Plus className="w-4 h-4 text-neutral-300 group-hover:rotate-90 transition-transform duration-200" />
            <span>New chat</span>
          </div>
          <span className="text-[10px] text-neutral-500 font-mono bg-[#1a1a1a] px-1.5 py-0.5 rounded border border-[#2e2e2e]">Ctrl+K</span>
        </button>
      </div>

      {/* Power Tools Shortcuts */}
      <div className="p-2 border-b border-[#262626] flex flex-col gap-1">
        <button
          onClick={onOpenOcr}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'ocr' ? 'bg-[#262626] text-emerald-400' : 'text-neutral-300 hover:bg-[#212121]'
          }`}
        >
          <Image className="w-4 h-4 text-emerald-500" />
          <span>Vision & Bangla OCR</span>
        </button>

        <button
          onClick={onOpenModelHub}
          className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-neutral-300 hover:bg-[#212121] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-4 h-4 text-sky-400" />
            <span>Model Manager</span>
          </div>
          <span className="text-[10px] bg-[#262626] text-neutral-400 px-1.5 py-0.5 rounded truncate max-w-[80px]">
            {activeModel && activeModel !== 'None' ? activeModel.split('/').pop() : 'No Model'}
          </span>
        </button>
      </div>

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
          Recent Chats
        </div>

        {chats.length === 0 ? (
          <div className="px-3 py-4 text-xs text-neutral-500 text-center italic">
            No conversations yet
          </div>
        ) : (
          chats.map(chat => {
            const isActive = chat.id === currentChatId && activeTab === 'chat';
            return (
              <div
                key={chat.id}
                onClick={() => {
                  setCurrentChatId(chat.id);
                  setActiveTab('chat');
                }}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                  isActive 
                    ? 'bg-[#262626] text-white font-medium' 
                    : 'text-neutral-400 hover:bg-[#212121] hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
                  <span className="truncate">{chat.title || "New chat"}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition-opacity"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* System Telemetry Bar (Footer) */}
      <div className="p-3 border-t border-[#262626] bg-[#141414] text-xs">
        <div className="flex items-center justify-between mb-1.5 text-neutral-400">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium text-neutral-300">GPU VRAM</span>
          </div>
          <button 
            onClick={onRefreshStatus} 
            className="hover:text-white transition-colors"
            title="Refresh GPU VRAM"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {vramInfo?.gpu_available ? (
          <div>
            <div className="w-full bg-[#262626] h-1.5 rounded-full overflow-hidden mb-1">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ 
                  width: `${Math.min(100, (vramInfo.allocated_gb / (vramInfo.total_gb || 1)) * 100)}%` 
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
              <span>{vramInfo.allocated_gb} GB used</span>
              <span>{vramInfo.total_gb} GB total</span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-neutral-500 italic">
            {vramInfo?.device_name || "Checking status..."}
          </div>
        )}
      </div>
    </aside>
  );
}
