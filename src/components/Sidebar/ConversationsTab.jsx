import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../context/StoreContext.jsx';
import { ConversationItem } from './ConversationItem.jsx';
import { ollama } from '../../ollama.js';
import { cosineSimilarity, embeddingCache } from '../../vector.js';

export function ConversationsTab({ onSelectConversation }) {
  const { state, store } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearchingState, setIsSearchingState] = useState(false);
  const debounceTimerRef = useRef(null);

  const conversations = state.conversations || [];
  const activeId = state.activeConversationId;

  // Handle semantic and substring search
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setIsSearchingState(false);
      return;
    }

    setIsSearchingState(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      const embeddingModel = store.state.embeddingModel || '';

      // If no embedding model, fallback to substring match
      if (!embeddingModel) {
        const queryLower = query.toLowerCase();
        const matches = conversations
          .filter(c =>
            c.title.toLowerCase().includes(queryLower) ||
            c.messages.some(m => m.content.toLowerCase().includes(queryLower))
          )
          .map(conv => ({ conv, score: null, snippet: null }));
        setSearchResults(matches);
        setIsSearchingState(false);
        return;
      }

      try {
        let queryEmbedding = embeddingCache.get(embeddingModel, query);
        if (!queryEmbedding) {
          queryEmbedding = await ollama.embed(embeddingModel, query);
          if (Array.isArray(queryEmbedding)) {
            embeddingCache.set(embeddingModel, query, queryEmbedding);
          }
        }

        if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
          throw new Error('Query embedding generation failed');
        }

        const scored = [];
        for (const conv of conversations) {
          let maxScore = 0;
          let bestSnippet = '';

          // Title match
          let titleEmb = embeddingCache.get(embeddingModel, conv.title);
          if (!titleEmb) {
            try {
              titleEmb = await ollama.embed(embeddingModel, conv.title);
              if (Array.isArray(titleEmb)) embeddingCache.set(embeddingModel, conv.title, titleEmb);
            } catch {}
          }
          if (titleEmb) {
            const sim = cosineSimilarity(queryEmbedding, titleEmb);
            if (sim > maxScore) {
              maxScore = sim;
              bestSnippet = conv.title;
            }
          }

          // Latest 10 messages match
          for (const msg of (conv.messages || []).slice(-10)) {
            if (!msg.content || msg.content.length < 5) continue;
            const textToScore = msg.content.slice(0, 300);
            let msgEmb = embeddingCache.get(embeddingModel, textToScore);
            if (!msgEmb) {
              try {
                msgEmb = await ollama.embed(embeddingModel, textToScore);
                if (Array.isArray(msgEmb)) embeddingCache.set(embeddingModel, textToScore, msgEmb);
              } catch {}
            }
            if (msgEmb) {
              const sim = cosineSimilarity(queryEmbedding, msgEmb);
              if (sim > maxScore) {
                maxScore = sim;
                bestSnippet = msg.content.slice(0, 70) + '…';
              }
            }
          }

          if (maxScore > 0.30) {
            scored.push({ conv, score: maxScore, snippet: bestSnippet });
          }
        }

        scored.sort((a, b) => (b.score || 0) - (a.score || 0));
        setSearchResults(scored);
      } catch {
        // Fallback to substring search
        const queryLower = query.toLowerCase();
        const matches = conversations
          .filter(c =>
            c.title.toLowerCase().includes(queryLower) ||
            c.messages.some(m => m.content.toLowerCase().includes(queryLower))
          )
          .map(conv => ({ conv, score: null, snippet: null }));
        setSearchResults(matches);
      } finally {
        setIsSearchingState(false);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchQuery, conversations, store.state.embeddingModel]);

  const handleNewChat = () => {
    const conv = store.createConversation();
    store.selectConversation(conv.id);
    onSelectConversation?.();
  };

  const handleSelect = (id) => {
    store.selectConversation(id);
    onSelectConversation?.();
  };

  const handleDelete = (id) => {
    store.deleteConversation(id);
  };

  const isSearching = searchQuery.trim().length > 0;
  const itemsToRender = isSearching ? searchResults : conversations.map(c => ({ conv: c }));

  return (
    <div className="sidebar__panel sidebar__panel--active">
      <button id="btn-new-chat" className="btn btn--primary btn--full" onClick={handleNewChat}>
        <span className="material-symbols-outlined">add</span>
        New Chat
      </button>

      <div className="sidebar__search">
        <div className="search-input-wrapper">
          <span className="material-symbols-outlined search-input-icon">search</span>
          <input
            id="chat-search-input"
            className="search-input"
            type="text"
            placeholder="Search chats semantically…"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="search-clear-btn"
              onClick={() => {
                setSearchQuery('');
                setSearchResults(null);
                setIsSearchingState(false);
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>
        {isSearching && (
          <div className="search-status-badge">
            {isSearchingState ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined spinning" style={{ fontSize: 11 }}>
                  progress_activity
                </span>
                Searching semantically…
              </span>
            ) : (
              <span>
                {itemsToRender ? itemsToRender.length : 0} match
                {itemsToRender && itemsToRender.length !== 1 ? 'es' : ''} found
              </span>
            )}
          </div>
        )}
      </div>

      <div className="conversation-list">
        {!itemsToRender || itemsToRender.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <span className="material-symbols-outlined">
                {isSearching ? 'search' : 'chat'}
              </span>
            </div>
            <div className="empty-state__text">
              {isSearching ? (
                <>No chats matched "{searchQuery}"<br />Try different terms.</>
              ) : (
                <>No conversations yet.<br />Start a new chat to begin routing.</>
              )}
            </div>
          </div>
        ) : (
          itemsToRender.map(({ conv, score, snippet }) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeId}
              onSelect={() => handleSelect(conv.id)}
              onDelete={handleDelete}
              matchPercent={score !== null && score !== undefined ? Math.round(score * 100) : undefined}
              snippet={snippet}
            />
          ))
        )}
      </div>
    </div>
  );
}
