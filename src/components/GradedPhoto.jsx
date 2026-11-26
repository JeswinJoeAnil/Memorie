import React, { useEffect, useState } from 'react';
import { photoDimensions } from '../constants/assets.js';
import { gradePhoto } from '../utils/gradePhoto.js';

// Components sharing a photo and filter also share its pending render and bitmap.
const filters = new WeakMap();
function acquirePreview(src, filter) {
  if (!filters.has(filter)) filters.set(filter, new Map());
  const photos = filters.get(filter);
  let entry = photos.get(src);
  if (!entry) {
    const controller = new AbortController();
    const promise = gradePhoto(src, filter, 640, controller.signal)
      .then(canvas => new Promise((resolve, reject) => canvas.toBlob(blob =>
        blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Could not encode preview')))));
    entry = { promise, controller, users: 0 };
    photos.set(src, entry);
  }
  entry.users++;
  return {
    promise: entry.promise,
    release() {
      if (--entry.users === 0) {
        entry.controller.abort();
        photos.delete(src);
        entry.promise.then(url => URL.revokeObjectURL(url)).catch(() => {});
      }
    },
  };
}

export function GradedPhoto({ src, filter, index, as: Element = 'img', ...props }) {
  const [preview, setPreview] = useState(null);
  const graded = Boolean(filter.css && filter.css !== 'none' || filter.pixel);
  useEffect(() => {
    if (!graded) return;
    let live = true;
    const entry = acquirePreview(src, filter);
    entry.promise.then(url => {
      if (live) setPreview({ src, filter, url });
    }).catch(err => { if (live) console.error('Photo preview failed', err); });
    return () => {
      live = false;
      entry.release();
    };
  }, [src, filter, graded]);
  const current = preview?.src === src && preview.filter === filter;
  const dimensions = photoDimensions.get(src);
  return <Element width={dimensions?.width} height={dimensions?.height}
    srcSet={current ? undefined : dimensions?.srcSet} sizes={dimensions ? '320px' : undefined}
    {...props} data-photo-index={index} src={current ? preview.url : src} />;
}
