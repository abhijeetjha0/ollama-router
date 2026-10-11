import React from 'react';

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  matchPercent,
  snippet,
}) {
  return (
    <div
      className={`conversation-item ${isActive ? 'conversation-item--active' : ''}`}
      onClick={onSelect}
    >
      <div className="conversation-item__icon">
        <span className="material-symbols-outlined">
          {matchPercent !== undefined ? 'hub' : 'chat_bubble_outline'}
        </span>
      </div>
      <div className="conversation-item__content">
        <div className="conversation-item__header">
          <div className="conversation-item__title" title={conversation.title || 'New Conversation'}>
            {conversation.title || 'New Conversation'}
          </div>
          {matchPercent !== undefined && (
            <span className="conversation-item__match">
              {matchPercent}%
            </span>
          )}
        </div>
        {snippet ? (
          <div className="conversation-item__snippet" title={snippet}>{snippet}</div>
        ) : (
          <div className="conversation-item__meta">
            {conversation.messages?.length || 0} msgs
          </div>
        )}
      </div>
      <button
        className="conversation-item__delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conversation.id);
        }}
        title="Delete conversation"
      >
        <span className="material-symbols-outlined">delete</span>
      </button>
    </div>
  );
}
