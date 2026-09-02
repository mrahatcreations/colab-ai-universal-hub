import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import OcrModal from './components/OcrModal';
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

  const [activeTab, setActiveTab] = useState("chat");
  const [activeModel, setActiveModel] = useState("None");
  const [vramInfo, setVramInfo] = useState(null);

  // Modals state
  const [isOcrOpen, setIsOcrOpen] = useState(false);
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
      console.log("Backend offline or waiting...", err.message);
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
    const activeChat = chats.find(c => c.id === currentChatId);
    if (!activeChat) return;

    const ocrMessage = {
      role: 'user',
      content: `[OCR Extracted Text]:\n${text}`
    };

    handleUpdateChat(currentChatId, {
      messages: [...(activeChat.messages || []), ocrMessage]
    });
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
        onOpenOcr={() => setIsOcrOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        vramInfo={vramInfo}
        onRefreshStatus={fetchStatus}
      />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <ChatView
          chat={currentChat}
          onUpdateChat={handleUpdateChat}
          activeModel={activeModel}
          onOpenModelHub={() => setIsModelHubOpen(true)}
          onOpenOcr={() => setIsOcrOpen(true)}
        />
      </main>

      {/* Modals */}
      <OcrModal
        isOpen={isOcrOpen}
        onClose={() => setIsOcrOpen(false)}
        onInsertIntoChat={handleInsertOcrText}
      />

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
