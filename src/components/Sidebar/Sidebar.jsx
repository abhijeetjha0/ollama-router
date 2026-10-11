import React, { useState } from 'react';
import { ConversationsTab } from './ConversationsTab.jsx';
import { RoutingTab } from './RoutingTab.jsx';
import { ModelsTab } from './ModelsTab.jsx';

export function Sidebar({
  isOpen,
  onClose,
  onSelectConversation,
  onOpenAddRoute,
  onOpenEditRoute,
  onRefreshModels,
}) {
  const [activeTab, setActiveTab] = useState('conversations');

  return (
    <aside
      id="sidebar"
      className={`sidebar ${isOpen ? 'sidebar--open' : 'sidebar--collapsed'}`}
      aria-label="Navigation and settings sidebar"
    >
      {/* Tab Switcher */}
      <div className="sidebar__tabs">
        <button
          className={`sidebar__tab ${activeTab === 'conversations' ? 'sidebar__tab--active' : ''}`}
          onClick={() => setActiveTab('conversations')}
        >
          <span className="material-symbols-outlined">chat</span>
          Chats
        </button>
        <button
          className={`sidebar__tab ${activeTab === 'routing' ? 'sidebar__tab--active' : ''}`}
          onClick={() => setActiveTab('routing')}
        >
          <span className="material-symbols-outlined">alt_route</span>
          Routing
        </button>
        <button
          className={`sidebar__tab ${activeTab === 'models' ? 'sidebar__tab--active' : ''}`}
          onClick={() => setActiveTab('models')}
        >
          <span className="material-symbols-outlined">inventory_2</span>
          Models
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'conversations' && (
        <ConversationsTab onSelectConversation={onSelectConversation} />
      )}
      {activeTab === 'routing' && (
        <RoutingTab
          onOpenAddRoute={onOpenAddRoute}
          onOpenEditRoute={onOpenEditRoute}
        />
      )}
      {activeTab === 'models' && <ModelsTab onRefresh={onRefreshModels} />}
    </aside>
  );
}
