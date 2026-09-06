export function drawingBoard(canvas: HTMLCanvasElement, initial: string | null, save: (image: string) => void) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает рисование');
  const ctx = context;
  let color = '#253d30', size = 6, active: number | null = null, ready = !initial;
  const history: string[] = [];
  function blank() { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  function snapshot() { return canvas.toDataURL('image/png'); }
  function restore(data: string) { const image = new Image(); ready = false; image.onload = () => { blank(); ctx.drawImage(image, 0, 0); ready = true; }; image.onerror = () => { ready = true; }; image.src = data; }
  blank();
  if (initial) restore(initial);
  function point(event: PointerEvent) { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height] as const; }
  function remember() { history.push(snapshot()); if (history.length > 15) history.shift(); }
  canvas.onpointerdown = event => { if (!ready || active !== null) return; event.preventDefault(); remember(); active = event.pointerId; canvas.setPointerCapture(event.pointerId); const [x, y] = point(event); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y); };
  canvas.onpointermove = event => { if (active !== event.pointerId) return; const [x, y] = point(event); ctx.lineTo(x, y); ctx.stroke(); };
  function end(event: PointerEvent) { if (active !== event.pointerId) return; active = null; save(snapshot()); }
  canvas.onpointerup = end; canvas.onpointercancel = end; canvas.onlostpointercapture = end;
  return { color(value: string) { color = value; }, size(value: number) { size = value; }, clear() { if (!ready) return; remember(); blank(); save(snapshot()); }, undo() { if (!ready) return; const last = history.pop(); if (last) { restore(last); save(last); } }, image() { if (!ready || active !== null) throw new Error('Закончите штрих и попробуйте ещё раз'); return snapshot().split(',')[1]; } };
}
