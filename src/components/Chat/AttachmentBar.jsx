import React from 'react';
import { useStore } from '../../context/StoreContext.jsx';

export function AttachmentBar() {
  const { state, store } = useStore();
  const images = state.activeImages || [];
  const documents = state.activeDocuments || [];

  if (images.length === 0 && documents.length === 0) return null;

  return (
    <>
      {images.length > 0 && (
        <div id="attached-images-container" className="attached-images-container">
          {images.map((img) => (
            <div key={img.id} className="image-chip">
              <img src={img.dataUrl} className="image-chip__thumb" alt={img.name} />
              <span className="image-chip__name" title={img.name}>
                {img.name}
              </span>
              <button
                className="image-chip__remove"
                onClick={() => store.removeImage(img.id)}
                title="Remove image"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  close
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div id="attached-docs-container" className="attached-docs-container">
          {documents.map((doc) => (
            <div key={doc.id} className="doc-chip">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                description
              </span>
              <span className="doc-chip__name" title={doc.name}>
                {doc.name}
              </span>
              <span className="doc-chip__chunks">{doc.chunksCount} chunks</span>
              <button
                className="doc-chip__remove"
                onClick={() => store.removeDocument(doc.id)}
                title="Remove file"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  close
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
