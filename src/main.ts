import './style.css';
import { drawingBoard } from './canvas';
import { escapeHtml as h, type Room, type Session } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const storage = { get(key: string) { try { return localStorage.getItem(key); } catch { return null; } }, set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { message('Браузер не сохранил данные: хранилище недоступно или заполнено. Не обновляйте страницу до отправки ответа.'); } }, remove(key: string) { try { localStorage.removeItem(key); } catch { /* Optional persistence. */ } } };
let invited = new URL(location.href).searchParams.get('room')?.toUpperCase() || '';
let session: Session | null = null;
try { const saved: unknown = JSON.parse(storage.get('crocodile-session') || 'null'); if (saved && typeof saved === 'object' && 'code' in saved && typeof saved.code === 'string' && 'token' in saved && typeof saved.token === 'string' && (!invited || invited === saved.code)) session = { code: saved.code, token: saved.token }; } catch { /* Ignore invalid saved session. */ }
let room: Room | null = null, screenKey = '', pending = false, failures = 0, generation = 0;
let board: ReturnType<typeof drawingBoard> | undefined;
const imageUrls = new Set<string>();
const $ = <T extends HTMLElement>(selector: string) => { const element = app.querySelector<T>(selector); if (!element) throw new Error(`Элемент не найден: ${selector}`); return element; };
const draftKey = () => `crocodile-draft:${session?.code}:${room?.gameId}:${room?.stage}`;
const message = (text: string) => { $('#notice').textContent = text; $('#notice').hidden = !text; };
function shell() { app.innerHTML = `<header><a class="brand" href="${location.pathname}"><span class="brand-mark">к.</span> крокодил<span class="brand-caption">ИСПОРЧЕННЫЙ РИСУНОК</span></a><span class="header-note">хорошо рисовать необязательно ↗</span></header><div id="notice" class="notice" role="alert" hidden></div><main id="main"></main><footer><span>Меньше правил. Больше каракулей.</span><span>3–12 друзей · каждый со своего экрана</span></footer>`; }
shell();
class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
function expireSession() {
  const text = app.querySelector<HTMLTextAreaElement>('#answer');
  let drawing: string | undefined;
  try { drawing = board?.image(); } catch { /* An unfinished stroke or pending restoration already has its last saved draft. */ }
  if (text) storage.set(draftKey(), text.value);
  if (drawing) storage.set(draftKey(), `data:image/png;base64,${drawing}`);
  session = null; room = null; board = undefined;
  storage.remove('crocodile-session'); releaseImages(); screenKey = 'expired';
  $('#main').innerHTML = '<section class="reconnect paper"><h2>Не удалось вернуться в комнату</h2><p>Комната больше не существует или ваша сессия истекла. Можно вернуться на главную и создать новую игру.</p><button id="reset-session" class="secondary">На главную</button></section>';
  $('#reset-session').onclick = () => { message(''); home(true); };
}
async function api<T>(path: string, body?: unknown, auth = true): Promise<T> {
  const requestingSession = session;
  const response = await fetch(`/api/game${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(auth && session ? { Authorization: `Bearer ${session.token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const error = new ApiError(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : `Ошибка соединения (${response.status})`, response.status);
    if (auth && requestingSession && session === requestingSession && (error.status === 401 || error.status === 404)) { expireSession(); message(error.message); }
    throw error;
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
function releaseImages() { generation++; for (const url of imageUrls) URL.revokeObjectURL(url); imageUrls.clear(); }
async function loadImages() {
  const current = generation, currentSession = session;
  if (!currentSession) return;
  await Promise.all(Array.from(app.querySelectorAll<HTMLImageElement>('img[data-image]')).map(async img => {
    const imageId = img.dataset.image;
    if (!imageId) return;
    try { const response = await fetch(`/api/game/rooms/${encodeURIComponent(currentSession.code)}/images/${encodeURIComponent(imageId)}`, { headers: { Authorization: `Bearer ${currentSession.token}` }, signal: AbortSignal.timeout(12_000) }); if (!response.ok) throw new Error('Не удалось загрузить рисунок'); const blob = await response.blob(); if (current !== generation || !img.isConnected) return; const url = URL.createObjectURL(blob); imageUrls.add(url); img.src = url; img.classList.add('loaded'); }
    catch { if (current === generation && img.isConnected) { const retry = document.createElement('button'); retry.className = 'secondary image-retry'; retry.textContent = 'Рисунок не загрузился · повторить'; retry.onclick = () => { retry.remove(); void loadImages(); }; img.insertAdjacentElement('afterend', retry); } }
  }));
}
async function action(work: () => Promise<void>) {
  if (pending) return;
  pending = true; app.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(button => button.disabled = true); message('');
  try { await work(); } catch (error) { message(error instanceof Error ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.'); }
  finally { pending = false; app.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(button => button.disabled = false); }
}
function home(reset = false) {
  if (reset) { invited = ''; failures = 0; history.replaceState(null, '', location.pathname); }
  releaseImages(); screenKey = 'home';
  $('#main').innerHTML = `<section class="home"><div class="hero-copy"><div class="eyebrow"><span class="dot"></span> ВЕЧЕР НАЧИНАЕТСЯ С КАРАКУЛИ</div><h1>Мысль.<br>Рисунок.<br><em>Что-о-о?</em></h1><p class="lead">Испорченный телефон, в котором<br class="desktop"> вместо шёпота — ваши рисунки.</p><div class="steps"><span><b>01</b> Придумай</span><i>→</i><span><b>02</b> Нарисуй</span><i>→</i><span><b>03</b> Угадай</span></div></div><div class="home-right"><div class="doodle-card" aria-hidden="true"><span class="tape"></span><span class="doodle-label">Кажется, это… кот на скейте?</span><svg viewBox="0 0 400 220"><g fill="none" stroke="#28563d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M136 126 Q109 106 135 64 L143 34 L168 61 Q184 54 200 61 L228 37 L228 81 Q246 99 225 125 Q240 156 219 168 L144 164 Q120 146 136 126Z"/><path d="M220 154 Q283 172 278 119 Q271 96 258 117 M151 160 L144 181 M204 165 L216 181 M126 186 Q179 199 240 186 M117 177 Q106 189 128 194 M241 186 L254 177"/><circle cx="145" cy="204" r="7"/><circle cx="224" cy="202" r="7"/><path d="M159 91 l1 2 M207 91 l1 2 M179 105 l8 0 -5 7 -3 -7 M182 112 q-9 12 -17 2 M182 112 q8 12 17 0 M149 108 l-25 -4 M150 116 l-23 4 M211 108 l27 -4 M211 117 l25 6 M81 143 l-18 3 M87 161 l-32 4"/></g><path d="M303 54 l9 -20 M317 66 l21 -7" stroke="#e49355" stroke-width="4" stroke-linecap="round"/></svg><span class="handwritten">талант не требуется ✷</span></div><form id="entry" class="entry-card"><div class="eyebrow">${invited ? 'ВАС ПОЗВАЛИ ИГРАТЬ' : 'СОБЕРИТЕ СВОЮ КОМПАНИЮ'}</div><h2>${invited ? 'Заходите, мы ждём!' : 'Ну что, порисуем?'}</h2><label for="name">Как вас называть?</label><input id="name" autocomplete="nickname" maxlength="48" placeholder="Например, Саша" value="${h(storage.get('crocodile-name') || '')}" required><div class="entry-buttons"><button data-action class="primary" type="submit">${invited ? 'Присоединиться' : 'Создать комнату'} <span>↗</span></button></div><details ${invited ? 'open' : ''}><summary>У меня есть код комнаты</summary><div class="join-row"><input id="code" aria-label="Код комнаты" maxlength="12" placeholder="КОД КОМНАТЫ" value="${h(invited)}"><button data-action id="join" type="button" class="secondary">Войти →</button></div></details><p class="small">Без регистрации. Только имя и немного фантазии.</p></form></div></section><section class="how"><span class="eyebrow">КАК ЭТО РАБОТАЕТ</span><p>Каждый придумывает фразу. Сосед её рисует. Следующий угадывает. А в финале вы вместе смотрите, как «кот на скейте» стал «бабушкой на ракете».</p><span class="how-star">✳</span></section>`;
  const enter = (join: boolean) => void action(async () => { const name = $<HTMLInputElement>('#name').value.trim(); if (!name || [...name].length > 24) throw new Error('Введите имя от 1 до 24 символов'); const code = $<HTMLInputElement>('#code').value.trim().toUpperCase(); if (join && !/^[A-Z0-9]{4,12}$/.test(code)) throw new Error('Проверьте код комнаты'); const result = await api<{ token: string; room: Room }>(join ? `/rooms/${code}/join` : '/rooms', { name }, false); session = { code: result.room.code, token: result.token }; storage.set('crocodile-session', JSON.stringify(session)); storage.set('crocodile-name', name); const url = new URL(location.href); url.search = ''; url.searchParams.set('room', session.code); history.replaceState(null, '', url); applyRoom(result.room); });
  $('#entry').onsubmit = event => { event.preventDefault(); enter(!!invited); }; $('#join').onclick = () => enter(true);
}
function playersMarkup(value: Room) { return value.players.map((player, index) => `<div class="player"><span class="avatar avatar-${index % 4}">${h([...player.name][0] || '?')}</span><div><strong>${h(player.name)}${player.id === value.youId ? ' <span class="you">вы</span>' : ''}</strong><small>${player.id === value.hostId ? 'Хозяин комнаты' : 'В игре'}</small></div><span class="player-state ${(value.status === 'lobby' ? player.ready : player.submitted) ? 'done' : ''}">${value.status === 'lobby' ? player.ready ? '✓ Готов' : 'Не готов' : player.submitted ? '✓ Готово' : 'В процессе'}</span></div>`).join(''); }
function roomHeader(value: Room) { return `<div class="room-top"><div><span class="eyebrow">КОМНАТА ${h(value.code)}</span><h1 class="room-title">${value.status === 'lobby' ? 'Все свои — за столом.' : value.status === 'finished' ? 'Вот это поворот!' : `Раунд ${value.stage + 1}<span> / ${value.totalStages}</span>`}</h1></div><div class="room-controls">${value.hostId === value.youId && value.status !== 'lobby' ? '<button data-action id="restart" class="secondary">Новая игра ↻</button>' : ''}${value.status !== 'playing' ? '<button data-action id="leave" class="text-button">Выйти ↗</button>' : ''}</div></div>`; }
function applyRoom(value: Room) {
  if (room?.code === value.code && room.version > value.version) return;
  room = value;
  const key = `${value.code}:${value.gameId}:${value.status}:${value.stage}:${value.task?.kind ?? 'waiting'}:${value.hostId}`;
  if (key === screenKey) { const list = app.querySelector('#players'); if (list) list.innerHTML = playersMarkup(value); updateProgress(value); return; }
  screenKey = key; releaseImages(); board = undefined;
  const main = $('#main');
  if (value.status === 'lobby') {
    const url = new URL(location.href); url.search = ''; url.searchParams.set('room', value.code);
    main.innerHTML = `${roomHeader(value)}<section class="lobby-grid"><div class="paper"><div class="section-heading"><h2>Компания</h2><span id="player-count" class="count">${value.players.length} / 12</span></div><div id="players">${playersMarkup(value)}</div><p id="lobby-hint" class="muted"></p><button data-action id="ready" class="primary full"></button></div><aside class="invite-card"><span class="eyebrow">МЕСТО ДЛЯ ВАШИХ ДРУЗЕЙ</span><h2>Позовите тех,<br>кто поймёт<br><em>ваши каракули.</em></h2><div class="room-code">${h(value.code)}</div><label for="invite">Ссылка-приглашение</label><input id="invite" class="invite-input" value="${h(url.href)}" readonly><button id="copy" class="secondary full">Скопировать ссылку ↗</button><p class="small">Нужно от 3 до 12 игроков. Когда все нажмут «Готов», игра начнётся сама.</p></aside></section>`;
    $('#ready').onclick = () => void action(async () => { if (room && session) applyRoom(await api<Room>(`/rooms/${session.code}/ready`, { ready: !room.players.find(p => p.id === room?.youId)?.ready })); });
    $('#copy').onclick = async () => { const input = $<HTMLInputElement>('#invite'); try { await navigator.clipboard.writeText(input.value); $('#copy').textContent = 'Ссылка скопирована ✓'; } catch { input.focus(); input.select(); message('Ссылка выделена. Скопируйте её и отправьте друзьям.'); } };
  } else if (value.status === 'playing') {
    const task = value.task;
    main.innerHTML = `${roomHeader(value)}<div class="progress-track"><div style="width:${100 * value.stage / value.totalStages}%"></div></div><section class="play-grid"><div class="paper task-paper">${!task ? `<div class="waiting"><div class="waiting-icon">✓</div><span class="eyebrow">ВАША ЧАСТЬ ГОТОВА</span><h2>Каракули переданы.</h2><p>Ждём остальных. Следующий раунд<br>появится здесь автоматически.</p><span class="handwritten">можно размять пальцы ✷</span></div>` : `<div class="eyebrow">${value.stage === 0 ? 'ВСЁ НАЧИНАЕТСЯ С ВАШЕЙ ИДЕИ' : task.kind === 'drawing' ? 'ИЗ СЛОВ — В КАРАКУЛИ' : 'ЧТО ЖЕ ЗДЕСЬ НАРИСОВАНО?'}</div><h2>${value.stage === 0 ? 'Придумайте смешную фразу' : task.kind === 'drawing' ? 'Нарисуйте эту фразу' : 'Опишите рисунок'}</h2>${task.prompt ? `<div class="prompt">«${h(task.prompt)}»</div>` : ''}${task.imageId ? `<div class="prompt-image"><img data-image="${h(task.imageId)}" alt="Рисунок предыдущего игрока, который нужно описать"></div>` : ''}${task.kind === 'text' ? `<form id="text-form"><label class="muted" for="answer">${value.stage === 0 ? 'Кто? Что делает? Где? Чем необычнее, тем веселее.' : 'Только то, что видите. Или что вам кажется.'}</label><textarea id="answer" maxlength="400" rows="4" placeholder="${value.stage === 0 ? 'Крокодил опоздал на йогу…' : 'Мне кажется, это…'}"></textarea><div class="answer-bottom"><span id="char-count" class="small">0 / 200</span><button data-action class="primary" type="submit">Передать дальше →</button></div></form>` : `<div class="tools" aria-label="Инструменты рисования"><div class="colors">${['#253d30','#e36947','#efbd45','#4380bf','#aa74b5'].map((color, index) => `<button class="swatch ${index === 0 ? 'selected' : ''}" data-color="${color}" style="--swatch:${color}" aria-label="${['Тёмно-зелёный','Красный','Жёлтый','Синий','Фиолетовый'][index]}" aria-pressed="${index === 0}"></button>`).join('')}</div><label class="brush-label">Кисть <input id="brush" type="range" min="2" max="32" value="6" aria-label="Размер кисти"></label><button id="eraser" class="tool-button" aria-pressed="false">Ластик</button><button id="undo" class="tool-button" aria-label="Отменить последний штрих">↶</button><button id="clear" class="tool-button">Очистить</button></div><canvas id="canvas" width="1024" height="768" aria-label="Поле для рисования мышью или пальцем"></canvas><div class="answer-bottom"><span class="small">Рисуйте мышью или пальцем</span><button data-action id="send-drawing" class="primary">Передать дальше →</button></div>`}`}</div><aside class="play-aside"><div class="section-heading"><h3>За нашим столом</h3><span id="submitted-count" class="count"></span></div><div id="players">${playersMarkup(value)}</div><div class="aside-note"><span>✳</span><p>Не подглядывайте!<br>Все истории раскроются в финале.</p></div><p class="small">Без таймера. Если кто-то потерял связь, игра дождётся его возвращения.</p></aside></section>`;
    if (task?.kind === 'text') { const input = $<HTMLTextAreaElement>('#answer'); input.value = storage.get(draftKey()) || ''; const count = () => { $('#char-count').textContent = `${[...input.value].length} / 200`; storage.set(draftKey(), input.value); }; input.oninput = count; count(); $('#text-form').onsubmit = event => { event.preventDefault(); void submit({ text: input.value.trim() }); }; }
    if (task?.kind === 'drawing') { board = drawingBoard($<HTMLCanvasElement>('#canvas'), storage.get(draftKey()), image => storage.set(draftKey(), image)); app.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(button => button.onclick = () => { board?.color(button.dataset.color || '#253d30'); app.querySelectorAll('[data-color], #eraser').forEach(other => { other.classList.remove('selected'); other.setAttribute('aria-pressed', 'false'); }); button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); }); $('#brush').oninput = () => board?.size(Number($<HTMLInputElement>('#brush').value)); $('#eraser').onclick = () => { board?.color('#ffffff'); app.querySelectorAll('[data-color]').forEach(other => { other.classList.remove('selected'); other.setAttribute('aria-pressed', 'false'); }); $('#eraser').classList.add('selected'); $('#eraser').setAttribute('aria-pressed','true'); }; $('#undo').onclick = () => board?.undo(); $('#clear').onclick = () => { if (confirm('Очистить рисунок? Можно будет отменить.')) board?.clear(); }; $('#send-drawing').onclick = () => { try { const image = board?.image(); if (image) void submit({ image }); } catch (error) { message(error instanceof Error ? error.message : 'Ошибка рисунка'); } }; }
  } else {
    main.innerHTML = `${roomHeader(value)}<p class="results-intro">От первой мысли до последней каракули. Листайте истории и находите момент, когда всё пошло не так.</p><div class="chains">${(value.chains || []).map((chain, i) => `<section class="chain"><div class="section-heading"><h2><span class="chain-number">${String(i + 1).padStart(2, '0')}</span> История ${h(value.players.find(p => p.id === chain.ownerId)?.name || 'игрока')}</h2><span class="small">${chain.entries.length} шагов</span></div><div class="chain-entries">${chain.entries.map((entry, index) => `<article class="chain-entry"><div class="entry-author"><span>${String(index + 1).padStart(2,'0')}</span>${h(value.players.find(p => p.id === entry.authorId)?.name || 'Игрок')}</div>${entry.kind === 'text' ? `<p>«${h(entry.text || '')}»</p>` : `<img data-image="${h(entry.imageId || '')}" alt="Рисунок игрока ${h(value.players.find(p => p.id === entry.authorId)?.name || '')}">`}</article>`).join('')}</div></section>`).join('')}</div>${value.hostId !== value.youId ? '<p class="muted">Хозяин комнаты может начать новую игру.</p>' : ''}`;
  }
  const restart = app.querySelector<HTMLButtonElement>('#restart'); if (restart) restart.onclick = () => void action(async () => { if (!session || !room || !confirm(room.status === 'playing' ? 'Завершить текущую игру и вернуться в комнату? Рисунки этой игры будут удалены.' : 'Начать заново? Истории текущей игры будут удалены.')) return; applyRoom(await api<Room>(`/rooms/${session.code}/restart`, { gameId: room.gameId })); });
  const leave = app.querySelector<HTMLButtonElement>('#leave'); if (leave) leave.onclick = () => void action(async () => { if (!session) return; await api<void>(`/rooms/${session.code}/leave`, {}); session = null; room = null; storage.remove('crocodile-session'); home(true); });
  updateProgress(value); void loadImages();
}
function updateProgress(value: Room) { const count = app.querySelector('#submitted-count'); if (count) count.textContent = `${value.players.filter(p => p.submitted).length} / ${value.players.length}`; if (value.status === 'lobby') { $('#player-count').textContent = `${value.players.length} / 12`; $('#lobby-hint').textContent = value.players.length < 3 ? `Для старта ${3 - value.players.length === 1 ? 'нужен ещё 1 игрок' : 'нужны ещё 2 игрока'}.` : 'Начнём автоматически, когда все будут готовы.'; $('#ready').textContent = value.players.find(p => p.id === value.youId)?.ready ? '✓ Я готов · отменить' : 'Я готов, поехали →'; } }
function submit(payload: { text?: string; image?: string }) { return action(async () => { if (!room || !session) return; if (payload.text !== undefined && (!payload.text || [...payload.text].length > 200)) throw new Error('Нужно от 1 до 200 символов'); if (payload.image && payload.image.length * 3 / 4 > 512 * 1024) throw new Error('Рисунок слишком большой. Упростите его и отправьте ещё раз.'); const key = draftKey(); const next = await api<Room>(`/rooms/${session.code}/submit`, { gameId: room.gameId, stage: room.stage, ...payload }); storage.remove(key); applyRoom(next); }); }
async function poll() {
  if (session && !pending) {
    const before = session;
    try {
      const value = await api<Room>(`/rooms/${encodeURIComponent(before.code)}`);
      if (session === before) { if (failures) message(''); failures = 0; applyRoom(value); }
    } catch (error) {
      if (session === before) {
        failures++;
        message(`${error instanceof Error ? error.message : 'Нет связи с сервером'}. Повторяем подключение…`);
        if (!room) {
          $('#main').innerHTML = '<section class="reconnect paper"><h2>Возвращаемся за стол…</h2><p>Проверяем комнату. Если она больше не существует, можно начать новую игру.</p><button id="reset-session" class="secondary">На главную</button></section>';
          $('#reset-session').onclick = () => { session = null; room = null; storage.remove('crocodile-session'); message(''); home(true); };
        }
      }
    }
  }
  window.setTimeout(() => void poll(), Math.min(1000 * 2 ** Math.min(failures, 4), 15000));
}
if (!session) home(); else $('#main').innerHTML = '<section class="reconnect paper"><h2>Возвращаемся за стол…</h2></section>';
void poll();
