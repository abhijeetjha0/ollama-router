import React from 'react';

export function RouteCard({ route, onEdit, onDelete }) {
  const keywords = route.keywords || [];
  const color = route.color || '#6366f1';

  return (
    <div className="route-card" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="route-card__header">
        <div className="route-card__category">
          <span className="route-card__dot" style={{ background: color }}></span>
          <span className="route-card__name">{route.category}</span>
        </div>
        <div className="route-card__actions">
          <button
            className="route-card__action"
            onClick={() => onEdit(route.id)}
            title="Edit route"
          >
            <span className="material-symbols-outlined">edit</span>
          </button>
          <button
            className="route-card__action route-card__action--delete"
            onClick={() => onDelete(route.id)}
            title="Delete route"
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
      <div className="route-card__desc">{route.description || '—'}</div>
      <div className="route-card__model">
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
          arrow_forward
        </span>
        <span>{route.model || 'No model assigned'}</span>
      </div>
      {keywords.length > 0 && (
        <div className="route-card__keywords">
          {keywords.slice(0, 4).map((kw, idx) => (
            <span key={idx} className="route-card__keyword">
              {kw}
            </span>
          ))}
          {keywords.length > 4 && (
            <span className="route-card__keyword">+{keywords.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}
