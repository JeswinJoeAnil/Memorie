import { domToCanvas } from 'modern-screenshot';
import { gradePhoto } from './gradePhoto.js';

export async function renderExport({ photos, filter, stripElement, type }) {
  if (!stripElement) throw new Error('Strip preview is unavailable.');
  await document.fonts.ready;
  const width = stripElement.offsetWidth;
  const height = stripElement.offsetHeight;
  const sources = [];
  for (const photo of photos) {
    if (filter.css || filter.pixel) {
      const canvas = await gradePhoto(photo, filter, 1600);
      sources.push(canvas.toDataURL('image/jpeg', 0.97));
    } else sources.push(photo);
  }
  return domToCanvas(stripElement, {
    width, height,
    backgroundColor: type === 'jpg' ? '#fff' : null,
    scale: Math.min(900 / width, 3500 / height),
    style: { transform: 'none', margin: '0', boxShadow: 'none' },
    filter: node => !node.matches?.('.deco-handle, .deco-corner'),
    onCloneEachNode(node) {
      if (node instanceof HTMLImageElement && node.hasAttribute('data-photo-index')) {
        node.src = sources[Number(node.dataset.photoIndex)];
      }
      if (node.classList?.contains('active-deco')) {
        node.style.outline = 'none';
        node.style.boxShadow = 'none';
      }
    },
  });
}
