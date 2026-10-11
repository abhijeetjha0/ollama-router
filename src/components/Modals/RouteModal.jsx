import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../context/StoreContext.jsx';
import { Modal } from '../Common/Modal.jsx';
import { router } from '../../router.js';

const COLOR_SWATCHES = [
  '#6366f1',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#f97316',
];

export function RouteModal({ isOpen, onClose, routeId }) {
  const { state, store } = useStore();

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [overlapInfo, setOverlapInfo] = useState(null);
  const debounceRef = useRef(null);

  const chatModels = (state.availableModels || []).filter(m => m.isChatModel);
  const isEditing = Boolean(routeId);

  // Initialize or reset form when modal opens or routeId changes
  useEffect(() => {
    if (isOpen) {
      if (routeId) {
        const route = (state.routes || []).find(r => r.id === routeId);
        if (route) {
          setCategory(route.category || '');
          setDescription(route.description || '');
          setKeywords((route.keywords || []).join(', '));
          setModel(route.model || (chatModels[0]?.name || ''));
          setColor(route.color || '#6366f1');
        }
      } else {
        setCategory('');
        setDescription('');
        setKeywords('');
        setModel(chatModels[0]?.name || state.defaultModel || '');
        setColor('#6366f1');
      }
      setOverlapInfo(null);
    }
  }, [isOpen, routeId, state.routes, state.defaultModel]);

  // Debounced live overlap check
  useEffect(() => {
    if (!isOpen) return;
    const desc = description.trim();
    if (desc.length < 5) {
      setOverlapInfo(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const overlaps = await router.checkRouteOverlap(
          desc,
          store.state.routes,
          routeId,
          store.state.embeddingModel || ''
        );

        if (overlaps.length > 0) {
          const top = overlaps[0];
          setOverlapInfo({
            isWarning: top.similarity >= 65,
            message: top.similarity >= 65
              ? `⚠️ High Semantic Overlap (${top.similarity}%) with existing "${top.category}" route. Consider differentiating the description.`
              : `✓ Unique description (highest overlap: ${top.similarity}% with "${top.category}").`,
          });
        } else {
          setOverlapInfo(null);
        }
      } catch {
        setOverlapInfo(null);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [description, isOpen, routeId, store.state.routes, store.state.embeddingModel]);

  const handleSave = () => {
    const trimmedCat = category.trim();
    if (!trimmedCat) return;

    const routeData = {
      category: trimmedCat,
      description: description.trim() || `Requests related to ${trimmedCat}`,
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      model,
      color,
    };

    if (isEditing) {
      store.updateRoute(routeId, routeData);
    } else {
      store.addRoute(routeData);
    }

    onClose();
  };

  const footer = (
    <>
      <button className="btn btn--ghost" onClick={onClose}>
        Cancel
      </button>
      <button className="btn btn--primary" onClick={handleSave}>
        Save Rule
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Routing Rule' : 'Add Routing Rule'}
      footer={footer}
    >
      <div className="setting-group">
        <label htmlFor="route-category">Category / Rule Name</label>
        <input
          id="route-category"
          type="text"
          className="input"
          placeholder="e.g., Code, Creative, Math, Science"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>

      <div className="setting-group">
        <label htmlFor="route-desc">
          Route Description{' '}
          <span className="hint">(Used for semantic classification & overlap detection)</span>
        </label>
        <textarea
          id="route-desc"
          className="input input--textarea"
          placeholder="Describe what requests belong to this category…"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {overlapInfo && (
          <div
            className={`route-overlap-alert ${
              overlapInfo.isWarning
                ? 'route-overlap-alert--warning'
                : 'route-overlap-alert--ok'
            }`}
            style={{ display: 'block' }}
          >
            {overlapInfo.message}
          </div>
        )}
      </div>

      <div className="setting-group">
        <label htmlFor="route-keywords">
          Keywords <span className="hint">(comma-separated fallback)</span>
        </label>
        <input
          id="route-keywords"
          type="text"
          className="input"
          placeholder="e.g., python, javascript, function, bug, code"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
      </div>

      <div className="setting-group">
        <label htmlFor="route-model">Route to Chat Model</label>
        <select
          id="route-model"
          className="select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {chatModels.length > 0 ? (
            chatModels.map(m => (
              <option key={m.name} value={m.name}>
                {m.name} {m.isCodeModel ? '(Code)' : m.isVisionModel ? '(Vision)' : m.isFunctionModel ? '(Tools)' : `(${m.parameterSize || 'Chat'})`}
              </option>
            ))
          ) : (
            <option value="">No chat models available</option>
          )}
        </select>
      </div>

      <div className="setting-group">
        <label htmlFor="route-color">Badge Color</label>
        <div className="color-picker">
          {COLOR_SWATCHES.map((swatchColor) => (
            <button
              key={swatchColor}
              type="button"
              className={`color-swatch ${color === swatchColor ? 'color-swatch--active' : ''}`}
              style={{ background: swatchColor }}
              onClick={() => setColor(swatchColor)}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
