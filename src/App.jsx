import React, { useState } from 'react';
import { useOllama } from './hooks/useOllama.js';
import { StatusBadge } from './components/Sidebar/StatusBadge.jsx';
import { Sidebar } from './components/Sidebar/Sidebar.jsx';
import { ChatArea } from './components/Chat/ChatArea.jsx';
import { RouteModal } from './components/Modals/RouteModal.jsx';
import { SettingsModal } from './components/Modals/SettingsModal.jsx';

export function App() {
  const { status, refreshModels } = useOllama();

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth > 768 : true;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [routeModalState, setRouteModalState] = useState({ isOpen: false, routeId: null });

  // Keyboard shortcut: Cmd+B or Ctrl+B toggles sidebar
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  const handleOpenSidebar = () => {
    setIsSidebarOpen(true);
  };

  const handleSelectConversationMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleOpenAddRoute = () => {
    setRouteModalState({ isOpen: true, routeId: null });
  };

  const handleOpenEditRoute = (routeId) => {
    setRouteModalState({ isOpen: true, routeId });
  };

  const handleCloseRouteModal = () => {
    setRouteModalState({ isOpen: false, routeId: null });
  };

  return (
    <div id="app">
      {/* Ambient background effects */}
      <div className="ambient-bg">
        <div className="ambient-orb ambient-orb--1"></div>
        <div className="ambient-orb ambient-orb--2"></div>
        <div className="ambient-orb ambient-orb--3"></div>
      </div>

      {/* Top navigation bar */}
      <header id="topbar" className="topbar">
        <div className="topbar__left">
          <button
            id="btn-toggle-sidebar"
            className="topbar__btn"
            onClick={handleToggleSidebar}
            title={isSidebarOpen ? "Close sidebar (Cmd+B)" : "Open sidebar (Cmd+B)"}
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <span className="material-symbols-outlined">
              {isSidebarOpen ? "dock_to_left" : "menu"}
            </span>
          </button>
          <div className="topbar__logo">
            <span className="material-symbols-outlined topbar__logo-icon">alt_route</span>
            <span className="topbar__title">ollama-router</span>
          </div>
        </div>
        <div className="topbar__right">
          <StatusBadge status={status} />
          <button
            id="btn-settings"
            className="topbar__btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </header>

      {/* Main layout: sidebar + chat */}
      <main className="main-layout">
        {isSidebarOpen && (
          <div
            className="sidebar-backdrop"
            onClick={handleCloseSidebar}
            aria-hidden="true"
          />
        )}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={handleCloseSidebar}
          onSelectConversation={handleSelectConversationMobile}
          onOpenAddRoute={handleOpenAddRoute}
          onOpenEditRoute={handleOpenEditRoute}
          onRefreshModels={refreshModels}
        />
        <ChatArea />
      </main>

      {/* Route Modal */}
      <RouteModal
        isOpen={routeModalState.isOpen}
        routeId={routeModalState.routeId}
        onClose={handleCloseRouteModal}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={refreshModels}
      />
    </div>
  );
}
export default App;
