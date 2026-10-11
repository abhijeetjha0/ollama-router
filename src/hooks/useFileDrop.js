import { useState, useCallback } from 'react';
import { useStore } from '../context/StoreContext.jsx';
import { processDocumentFile } from '../rag.js';

export async function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] : '';
      resolve({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
        base64,
        createdAt: Date.now(),
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useFileDrop(onIndexingProgress) {
  const { state, store } = useStore();
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const embeddingModel = store.state.embeddingModel || '';

    const hasDocumentFiles = fileList.some(f =>
      !f.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)
    );

    if (hasDocumentFiles && !embeddingModel) {
      alert('No embedding model is configured. Please select an embedding model in the Router Engine settings before uploading documents for Mini-RAG indexing.');
      return;
    }

    for (const file of fileList) {
      try {
        if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
          const img = await processImageFile(file);
          store.addImage(img);
        } else {
          if (onIndexingProgress) {
            onIndexingProgress(`Indexing "${file.name}" with ${embeddingModel}…`);
          }

          const doc = await processDocumentFile(file, embeddingModel, (p) => {
            if (onIndexingProgress) {
              onIndexingProgress(`Indexing "${file.name}" (${p.current}/${p.total} chunks · ${p.percent}%)…`);
            }
          });
          store.addDocument(doc);
          if (onIndexingProgress) {
            onIndexingProgress(null);
          }
        }
      } catch (err) {
        alert(`Could not process "${file.name}": ${err.message}`);
        if (onIndexingProgress) {
          onIndexingProgress(null);
        }
      }
    }
  }, [store, onIndexingProgress]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const onPaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  }, [handleFiles]);

  return {
    isDragging,
    handleFiles,
    onDragOver,
    onDragLeave,
    onDrop,
    onPaste,
  };
}
