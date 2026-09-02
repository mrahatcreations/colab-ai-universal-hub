import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import OcrWorkspace from './components/OcrWorkspace';
import ModelHubModal from './components/ModelHubModal';
import SettingsModal from './components/SettingsModal';
import { getApiBase } from './config';

export default function App() {
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem("colab_chats");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentChatId, setCurrentChatId] = useState(() => {
    return chats.length > 0 ? chats[0].id : null;
  });

  const [activeTab, setActiveTab] = useState("chat"); // 'chat' or 'ocr'
  const [activeModel, setActiveModel] = useState("None");
  const [vramInfo, setVramInfo] = useState(null);

  // Modals state
  const [isModelHubOpen, setIsModelHubOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Persist chats in localStorage
  useEffect(() => {
    localStorage.setItem("colab_chats", JSON.stringify(chats));
  }, [chats]);

  // Initial chat creation if empty
  useEffect(() => {
    if (chats.length === 0) {
      const initialId = Date.now().toString();
      const initialChat = {
        id: initialId,
        title: "New chat",
        messages: [],
        createdAt: new Date().toISOString()
      };
      setChats([initialChat]);
      setCurrentChatId(initialId);
    }
  }, []);

  // Fetch backend status
  const fetchStatus = async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setActiveModel(data.active_model || "None");
        setVramInfo(data.vram || null);
      }
    } catch (err) {
      // Background offline or waiting
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdateChat = (chatId, updates) => {
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, ...updates } : c));
  };

  const handleInsertOcrText = (text) => {
    let targetChatId = currentChatId;
    if (!targetChatId) {
      targetChatId = Date.now().toString();
      const newChat = {
        id: targetChatId,
        title: "Document OCR",
        messages: [],
        createdAt: new Date().toISOString()
      };
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(targetChatId);
    }

    const activeChat = chats.find(c => c.id === targetChatId) || { messages: [] };

    const ocrMessage = {
      role: 'user',
      content: `[Extracted Document Text]:\n\n${text}\n\nঅনুগ্রহ করে এই ডকুমেন্টের বিষয়বস্তু সংক্ষেপে বিশ্লেষণ করুন।`
    };

    handleUpdateChat(targetChatId, {
      title: activeChat.title === "New chat" ? "Document Analysis" : activeChat.title,
      messages: [...(activeChat.messages || []), ocrMessage]
    });

    setActiveTab("chat");
  };

  const currentChat = chats.find(c => c.id === currentChatId) || chats[0];

  return (
    <div className="flex h-screen bg-[#212121] overflow-hidden">
      {/* ChatGPT Left Sidebar */}
      <Sidebar
        currentChatId={currentChatId}
        setCurrentChatId={setCurrentChatId}
        chats={chats}
        setChats={setChats}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeModel={activeModel}
        onOpenModelHub={() => setIsModelHubOpen(true)}
        onOpenOcr={() => setActiveTab("ocr")}
        onOpenSettings={() => setIsSettingsOpen(true)}
        vramInfo={vramInfo}
        onRefreshStatus={fetchStatus}
      />

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {activeTab === "ocr" ? (
          <OcrWorkspace
            onInsertIntoChat={handleInsertOcrText}
            onBackToChat={() => setActiveTab("chat")}
          />
        ) : (
          <ChatView
            chat={currentChat}
            onUpdateChat={handleUpdateChat}
            activeModel={activeModel}
            onOpenModelHub={() => setIsModelHubOpen(true)}
            onOpenOcr={() => setActiveTab("ocr")}
          />
        )}
      </main>

      {/* Modals */}
      <ModelHubModal
        isOpen={isModelHubOpen}
        onClose={() => setIsModelHubOpen(false)}
        activeModel={activeModel}
        onModelChanged={(m) => {
          setActiveModel(m);
          fetchStatus();
        }}
        vramInfo={vramInfo}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onApiChanged={fetchStatus}
      />
    </div>
  );
}
