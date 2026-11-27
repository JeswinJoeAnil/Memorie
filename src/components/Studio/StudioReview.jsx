import React, { useEffect, useState } from 'react';
import { Link2, Download, Check } from 'lucide-react';
import { studioInviteLink } from '../../utils/roomCode.js';
import { PROTOCOL_TYPES as T } from '../../studio/room/roomProtocol.js';

export function InviteButton({ code }) {
  const [status, setStatus] = useState('');
  const link = studioInviteLink(code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus('copied');
    } catch {
      setStatus('select');
    }
  };
  return <span className="studio-invite">
    <button type="button" className="studio-copy-btn" onClick={copy}>
      {status === 'copied' ? <Check size={15}/> : <Link2 size={15}/>}
      {status === 'copied' ? 'Link copied' : 'Invite by link'}
    </button>
    {status === 'select' && <input aria-label="Room invitation link" readOnly value={link} onFocus={e => e.target.select()} autoFocus />}
  </span>;
}

export async function makePrint(photos) {
  const images = await Promise.all(photos.map(async src => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  }));
  const width = 960;
  const height = Math.round(width * images[0].height / images[0].width);
  const paper = document.createElement('canvas');
  paper.width = width + 64;
  paper.height = 32 + images.length * (height + 18) + 94;
  const ctx = paper.getContext('2d');
  ctx.fillStyle = '#fbf5eb';
  ctx.fillRect(0, 0, paper.width, paper.height);
  images.forEach((image, i) => ctx.drawImage(image, 32, 32 + i * (height + 18), width, height));
  ctx.fillStyle = '#4c2334';
  ctx.font = 'italic 46px Georgia';
  ctx.fillText('Memorie Studio', 32, paper.height - 32);
  ctx.font = '22px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(String(images.length).padStart(2, '0') + ' FRAMES', paper.width - 32, paper.height - 36);
  return new Promise((resolve, reject) => paper.toBlob(blob => {
    if (!blob) return reject(new Error('Could not develop print'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }, 'image/jpeg', 0.92));
}

// Request one bounded part at a time. Repeating a request after a dropped
// connection resumes at the last confirmed offset without duplicating bytes.
export function useSharedPrint({ id, hostId, isHost, master, sendTo, onData }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!id) return;
    let parts = [];
    let finished = false;
    const request = () => {
      if (!isHost && !finished) sendTo(hostId, { type: T.PRINT_REQUEST, id, index: parts.length });
    };
    const off = onData((message, from) => {
      if (message.id !== id) return;
      if (isHost && message.type === T.PRINT_REQUEST && master.current?.id === id) {
        const data = master.current.src;
        const count = Math.ceil(data.length / 32768);
        if (message.index < count) sendTo(from, { type: T.PRINT_PART, id, index: message.index, count,
          chunk: data.slice(message.index * 32768, (message.index + 1) * 32768) });
      } else if (!isHost && !finished && from === hostId && message.type === T.PRINT_PART && message.index === parts.length) {
        parts.push(message.chunk);
        if (parts.length === message.count) {
          const src = parts.join('');
          finished = true;
          parts = [];
          if (src.startsWith('data:image/jpeg;base64,')) setResult({ id, src });
        } else request();
      }
    });
    request();
    const retry = isHost ? null : setInterval(request, 2000);
    return () => { off(); clearInterval(retry); };
  }, [id, hostId, isHost, master, sendTo, onData]);
  return isHost ? master.current?.src : result && result.id === id ? result.src : null;
}

export function StudioReview({ src, photos, frameCount, request, delivery, onRequest, isHost, onRetake, onEditor, onNext, onUndo }) {
  return <section className="studio-proof" aria-label="Photo strip review">
    <div className="studio-proof-paper">{src ? <img src={src} alt="Finished Memorie Studio photo strip" /> : <p role="status">Receiving your print…</p>}</div>
    <div className="studio-proof-tools">
      <h2 className="studio-editorial-title">Your contact sheet</h2>
      <p>{isHost ? 'Keep the strip or choose a frame to shoot again.' : 'Save this strip while the room is open.'}</p>
      {src && <a className="studio-join-btn" download="memorie-studio.jpg" href={src}><Download size={16}/> Save strip</a>}
      {!isHost && src && <label className="studio-retake-request">Request a retake
        <select value={request || ''} onChange={event => onRequest(Number(event.target.value))}>
          <option value="">Choose a frame</option>
          {Array.from({length: frameCount || 0}, (_, i) => <option key={i} value={i + 1}>Frame {i + 1}</option>)}
        </select>
      </label>}
      {isHost && <>
        {delivery.length > 0 && <p role="status">{delivery.filter(Boolean).length} of {delivery.length} guests received this print.</p>}
        <div className="studio-proof-frames">{photos.map((photo, i) =>
          <button key={i} onClick={() => onRetake(i)} aria-label={'Retake frame ' + (i + 1)}>
            <img src={photo} alt=""/><span>Retake {i + 1}</span>
          </button>)}</div>
        {onUndo && <button className="studio-back-btn" onClick={onUndo}>Restore previous take</button>}
        <button className="studio-copy-btn" onClick={onNext}>Another round</button>
        <button className="studio-back-btn" onClick={onEditor}>Open strip editor</button>
      </>}
    </div>
  </section>;
}
