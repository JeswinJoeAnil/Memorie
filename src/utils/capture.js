// Leave room for six distinct photos and edit metadata inside a 10 MB draft.
async function encodePhoto(canvas) {
  let quality = 0.9;
  let blob;
  do {
    blob = await new Promise((resolve, reject) => canvas.toBlob(
      image => image ? resolve(image) : reject(new Error('Could not encode this photo.')),
      'image/jpeg', quality
    ));
    quality -= 0.1;
  } while (blob.size > 1_550_000 && quality >= 0.4);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function sizeCanvas(canvas, width, height) {
  if (!width || !height) throw new Error('The photo has no readable dimensions.');
  const scale = Math.min(1, 1600 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
}

export async function importPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 24 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, WebP or AVIF photo under 24 MB.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 64_000_000) throw new Error('Choose a photo under 64 megapixels.');
    const canvas = document.createElement('canvas');
    sizeCanvas(canvas, image.naturalWidth, image.naturalHeight);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return encodePhoto(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function encodeVideoFrameToStrip(canvas, video, mirrorOn) {
  sizeCanvas(canvas, video.videoWidth, video.videoHeight);
  const context = canvas.getContext('2d');
  context.save();
  if (mirrorOn) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.restore();

  await new Promise((r) => requestAnimationFrame(r));

  return encodePhoto(canvas);
}
