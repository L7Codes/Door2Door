import { $, esc } from './dom';
import { freshPosition, lookup, type Fix } from './geo';
import { addHist, cursorFor, distance, guessNext, inDays, shortDate, matchRoad, nearbyRoads, normaliseRoad, uid } from './logic';
import { store } from './store';
import { sheet, toast } from './ui';
import type { House, Lookup, Road, Status } from './types';
import { isStage, STAGE_DAYS, STATUS_LABEL } from './types';

interface Flow {
  lat: number;
  lng: number;
  acc: number;
  roadId: string | null;
  roadName: string;
  detected: string;
  area: string;
  guess: Lookup | null;
  num: string;
  name: string;
  phone: string;
  note: string;
  stale: boolean;
}

interface Deps {
  getFix: () => Fix | null;
  getCentre: () => { lat: number; lng: number };
  changed: () => void;
}

let deps: Deps;
let flow: Flow | null = null;
const SAME_ROAD_M = 150;
/** Only guess the next number when you are standing right next to the last door you knocked. */
const NEXT_DOOR_M = 10;

export function initFlow(d: Deps): void {
  deps = d;
}

export function active(): boolean {
  return flow !== null;
}

/** Text for the Knock button: what the app expects the next door to be. */
export function knockHint(): string {
  const fix = deps.getFix();
  const c = store.cursor;
  const road = c ? store.road(c.roadId) : null;
  if (fix && c && road) {
    const d = distance(c.lat, c.lng, fix.lat, fix.lng);
    if (d < NEXT_DOOR_M) return `${road.name}, next ${guessNext(c.nums)}`;
    if (d < SAME_ROAD_M) return road.name;
  }
  return '';
}

export async function knock(): Promise<void> {
  if (flow) return;
  let fix = deps.getFix();
  if (!fix) {
    sheet.show(
      `<h2>Waiting for GPS</h2><p>Stand still for a few seconds. If it never arrives, allow location for Door2Door in Settings.</p>
       <div class="row"><button class="btn" data-a="close">Close</button><button class="btn pri" data-a="nogps">Drop pin on map centre</button></div>`,
      () => (flow = null)
    );
    flow = blank(deps.getCentre().lat, deps.getCentre().lng, 0);
    return;
  }
  // Never trust an old reading: if the last one is more than 3 seconds old, ask the phone for a new one.
  let stale = false;
  sheet.show('<h2>Finding your position…</h2><p>Getting a fresh GPS reading.</p>', () => (flow = null));
  flow = blank(fix.lat, fix.lng, fix.acc);
  if (fix.ts !== undefined && Date.now() - fix.ts > 3000) {
    const fresh = await freshPosition();
    if (!flow) return;
    if (fresh) fix = fresh;
    else stale = Date.now() - fix.ts > 20000;
  }
  flow = blank(fix.lat, fix.lng, fix.acc);
  flow.stale = stale;
  sheet.swap('<h2>Checking address…</h2><p>Looking for a house at your position.</p>');
  const l = await lookup(fix.lat, fix.lng);
  if (!flow) return;
  flow.detected = l?.road ?? '';
  flow.area = l?.area ?? '';
  if (l && l.num && l.road) {
    flow.guess = l;
    stepConfirm();
  } else decideRoad();
}

function blank(lat: number, lng: number, acc: number): Flow {
  return { lat, lng, acc, roadId: null, roadName: '', detected: '', area: '', guess: null, num: '', name: '', phone: '', note: '', stale: false };
}

const roughNote = (f: Flow): string =>
  f.stale
    ? `<p class="warn">GPS has not updated for a while, so this pin may land in the wrong place. You can move it later from the house.</p>`
    : f.acc > 40 ? `<p class="warn">GPS is rough (±${Math.round(f.acc)}m). Check the number matches the door.</p>` : '';

function stepConfirm(): void {
  const f = flow!;
  const g = f.guess!;
  sheet.swap(`<h2>Are you at ${esc(g.num)} ${esc(g.road)}?</h2><p>${esc(g.area)}</p>${roughNote(f)}
    <div class="row"><button class="btn pri big" data-a="confirm-yes">Yes</button><button class="btn big" data-a="confirm-no">No</button></div>`);
}

function decideRoad(): void {
  const f = flow!;
  const c = store.cursor;
  const cur = c ? store.road(c.roadId) : null;
  const d = c ? distance(c.lat, c.lng, f.lat, f.lng) : Infinity;
  // Right next to the last knock on the same road: offer the guessed number.
  if (c && cur && d < NEXT_DOOR_M && (!f.detected || matchNames(cur.name, f.detected))) {
    f.roadId = cur.id;
    f.num = String(guessNext(c.nums));
    stepSame();
    return;
  }
  // Anywhere else: fresh check, ask for the number (no guessing).
  if (f.detected) f.roadName = f.detected;
  else if (cur && d < 60) f.roadName = cur.name;
  stepNewRoad();
}

const matchNames = (a: string, b: string): boolean => normaliseRoad(a) === normaliseRoad(b);

function stepSame(): void {
  const f = flow!;
  const r = store.road(f.roadId)!;
  sheet.swap(`<h2>Still on ${esc(r.name)}?</h2><p>${esc(r.area)}</p>${roughNote(f)}
    <div class="stepper"><button class="btn" data-a="n-2">−2</button><div class="num" aria-live="polite">${esc(f.num)}</div><button class="btn" data-a="n+2">+2</button></div>
    <div class="row tight"><button class="btn sm" data-a="n-1">−1</button><button class="btn sm" data-a="n+1">+1</button><button class="btn sm" data-a="flip">Other side</button><button class="btn sm" data-a="type-num">Type</button></div>
    <div class="row"><button class="btn pri big" data-a="same-yes">Yes, ${esc(f.num)}</button><button class="btn big" data-a="new-road">New road</button></div>
    <div class="row"><button class="btn quiet" data-a="drop">Just drop a pin, fix later</button></div>`);
}

function stepNewRoad(): void {
  const f = flow!;
  const near = nearbyRoads(store.roads, store.houses, f.lat, f.lng);
  const chips = near.map((r) => `<button class="chip" data-a="pick-road" data-id="${r.id}">${esc(r.name)}</button>`).join('');
  const found = f.roadName && f.detected;
  sheet.swap(`<h2>${found ? `Is this ${esc(f.roadName)}?` : 'Which road?'}</h2>
    <p>${f.area ? esc(f.area) + '. ' : ''}${found ? 'The map says this road. Change it if it is wrong, then add the number.' : 'You only type this once per road.'}</p>${roughNote(f)}
    ${chips ? `<label>Roads you used nearby</label><div class="chips">${chips}</div>` : ''}
    <label for="road">Road name</label><input id="road" autocomplete="off" autocapitalize="words" enterkeyhint="next" value="${esc(f.roadName)}">
    <label for="num">House number</label><input id="num" inputmode="numeric" autocomplete="off" enterkeyhint="done" value="${esc(f.num)}">
    <div class="row"><button class="btn pri big" data-a="road-done">Continue</button><button class="btn big" data-a="close">Cancel</button></div>
    <div class="row"><button class="btn quiet" data-a="drop">Just drop a pin, fix later</button></div>`);
  setTimeout(() => (document.getElementById(f.roadName ? 'num' : 'road') as HTMLInputElement | null)?.focus(), 80);
}

function stepTypeNum(): void {
  const f = flow!;
  sheet.swap(`<h2>House number</h2><label for="num">Number or plot (letters allowed, like 14A)</label>
    <input id="num" autocomplete="off" autocapitalize="characters" value="${esc(f.num)}">
    <div class="row"><button class="btn pri big" data-a="num-done">OK</button><button class="btn big" data-a="back">Back</button></div>`);
  setTimeout(() => {
    const i = document.getElementById('num') as HTMLInputElement | null;
    i?.focus();
    i?.select();
  }, 80);
}

function stepOutcome(): void {
  const f = flow!;
  const r = store.road(f.roadId);
  const was = f.roadId && f.num !== '' ? store.houses.find((h) => h.roadId === f.roadId && h.num === f.num) : undefined;
  const wasNote = was && isStage(was.status) ? `Last time: ${STATUS_LABEL[was.status]}${was.appt ? ', check back ' + shortDate(was.appt) : ''}. ` : '';
  sheet.swap(`<h2><span class="plate">${esc(f.num || '?')}</span> ${esc(r?.name ?? '')}</h2><p>${esc(wasNote)}What happened?</p>
    <div class="row"><button class="btn big s-noanswer" data-a="save" data-s="noanswer">No answer</button><button class="btn big" data-a="answered">Answered</button></div>
    <div class="row"><button class="btn big s-empty" data-a="empty">Empty house / not moved in</button></div>
    <div class="row"><button class="btn quiet" data-a="back-id">Change address</button></div>`);
}

function stepEmpty(): void {
  const row = (st: Status, title: string, hint: string): string =>
    `<button class="btn big s-${st} stage" data-a="empty-save" data-s="${st}"><b>${title}</b><span>${hint}</span></button>`;
  sheet.swap(`<h2>Empty house</h2><p>What did you see? It sets when to remind you.</p>
    <div class="stack">${row('empty', 'Not sold', 'For sale, show home. Check back in 6 weeks')}
    ${row('reserved', 'Sold, not in yet', 'Sold sign, or you were told. 3 weeks')}
    ${row('movingin', 'Moving in', 'Furniture, van, curtains, car. 1 week')}</div>
    <div class="row"><button class="btn quiet" data-a="outcome">Back</button></div>`);
}

function stepAnswered(): void {
  sheet.swap(`<h2>Answered</h2><p>Were they interested?</p>
    <div class="row"><button class="btn big s-no" data-a="not-int">Not interested</button><button class="btn big s-follow" data-a="interested">Interested</button></div>
    <div class="row"><button class="btn quiet" data-a="outcome">Back</button></div>`);
}

function stepNotInterested(): void {
  const reasons = ['Already has alarm', 'No money', 'Not the owner', 'Not now', 'Just no'];
  sheet.swap(`<h2>Not interested</h2><p>Tap a reason, or save without one.</p>
    <div class="chips">${reasons.map((x) => `<button class="chip" data-a="reason" data-r="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="row"><button class="btn big s-no" data-a="save" data-s="no">Save</button><button class="btn big" data-a="answered">Back</button></div>`);
}

function stepInterested(): void {
  const f = flow!;
  sheet.swap(`<h2>Interested</h2>
    <label for="f-name">Name</label><input id="f-name" autocomplete="off" autocapitalize="words" value="${esc(f.name)}">
    <label for="f-phone">Phone</label><input id="f-phone" inputmode="tel" autocomplete="off" value="${esc(f.phone)}">
    <label for="f-note">Note</label><input id="f-note" autocomplete="off" value="${esc(f.note)}">
    <div class="row"><button class="btn big s-follow" data-a="save-form" data-s="follow">Save follow-up</button><button class="btn big s-appt" data-a="to-appt">Book appointment</button></div>
    <div class="row"><button class="btn big s-sale" data-a="save-form" data-s="sale">Sale made</button></div>`);
}

function stepAppt(): void {
  const d = new Date(Date.now() + 86400000);
  d.setHours(18, 0, 0, 0);
  const v = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  sheet.swap(`<h2>Appointment</h2><label for="f-appt">Date and time</label><input id="f-appt" type="datetime-local" value="${v}">
    <div class="row"><button class="btn big s-appt" data-a="save-appt">Save appointment</button><button class="btn big" data-a="interested">Back</button></div>`);
}

function readForm(): void {
  const f = flow!;
  const v = (id: string): string | null => (document.getElementById(id) as HTMLInputElement | null)?.value ?? null;
  f.name = v('f-name') ?? f.name;
  f.phone = v('f-phone') ?? f.phone;
  f.note = v('f-note') ?? f.note;
}

function ensureRoad(name: string): Road {
  const f = flow!;
  const have = matchRoad(store.roads, store.houses, name, f.lat, f.lng);
  if (have) return have;
  const r: Road = { id: uid(), name: name.trim(), area: f.area, lat: f.lat, lng: f.lng };
  void store.putRoad(r);
  return r;
}

async function commit(status: Status, extra: { note?: string; appt?: string } = {}): Promise<void> {
  const f = flow!;
  const prevCursor = store.cursor ? structuredClone(store.cursor) : null;
  const dup = f.roadId && f.num !== '' ? store.houses.find((h) => h.roadId === f.roadId && h.num === f.num) : undefined;
  const prev = dup ? structuredClone(dup) : null;
  const house: House = {
    id: dup?.id ?? uid(),
    roadId: f.roadId,
    num: f.num,
    lat: dup?.lat ?? f.lat,
    lng: dup?.lng ?? f.lng,
    status,
    name: f.name || dup?.name || '',
    phone: f.phone || dup?.phone || '',
    note: extra.note ?? (f.note || dup?.note || ''),
    appt: extra.appt ?? (dup && isStage(dup.status) ? '' : dup?.appt ?? ''),
    ts: Date.now(),
    hist: addHist(dup?.hist, status)
  };
  await store.putHouse(house);
  if (f.roadId) await store.setCursor(cursorFor(store.cursor, f.roadId, f.num, f.lat, f.lng));
  sheet.close();
  deps.changed();
  const label = `${house.num ? house.num + ' ' : ''}${STATUS_LABEL[status]}`;
  toast(prev ? `${label} (updated)` : `${label} saved`, {
    label: 'Undo',
    run: () => {
      void (async () => {
        if (prev) await store.putHouse(prev);
        else await store.deleteHouse(house.id);
        await store.setCursor(prevCursor);
        deps.changed();
      })();
    }
  });
}

export function handleFlowAction(a: string, el: HTMLElement): boolean {
  if (!flow) return false;
  const f = flow;
  const n = parseInt(f.num, 10) || 0;
  switch (a) {
    case 'nogps':
      decideRoad();
      return true;
    case 'confirm-yes': {
      const r = ensureRoad(f.guess!.road);
      f.roadId = r.id;
      f.num = f.guess!.num;
      stepOutcome();
      return true;
    }
    case 'confirm-no':
      decideRoad();
      return true;
    case 'n+2': f.num = String(n + 2); stepSame(); return true;
    case 'n-2': f.num = String(Math.max(1, n - 2)); stepSame(); return true;
    case 'n+1': f.num = String(n + 1); stepSame(); return true;
    case 'n-1': f.num = String(Math.max(1, n - 1)); stepSame(); return true;
    case 'flip': f.num = String(n % 2 === 0 ? Math.max(1, n - 1) : n + 1); stepSame(); return true;
    case 'type-num': stepTypeNum(); return true;
    case 'num-done': {
      const v = ($('num') as HTMLInputElement).value.trim();
      if (v) f.num = v.toUpperCase();
      if (f.roadId) stepSame();
      else stepNewRoad();
      return true;
    }
    case 'back':
      if (f.roadId) stepSame();
      else stepNewRoad();
      return true;
    case 'back-id':
      f.roadId ? stepSame() : stepNewRoad();
      return true;
    case 'same-yes': stepOutcome(); return true;
    case 'new-road': f.roadId = null; f.num = ''; stepNewRoad(); return true;
    case 'pick-road': {
      const r = store.road(el.dataset['id'] ?? '');
      if (r) {
        f.roadName = r.name;
        ($('road') as HTMLInputElement).value = r.name;
        ($('num') as HTMLInputElement).focus();
      }
      return true;
    }
    case 'road-done': {
      const name = ($('road') as HTMLInputElement).value.trim();
      if (!name) {
        $('road').focus();
        return true;
      }
      f.num = ($('num') as HTMLInputElement).value.trim().toUpperCase();
      f.roadId = ensureRoad(name).id;
      f.roadName = name;
      stepOutcome();
      return true;
    }
    case 'drop': {
      const name = f.roadName || f.detected;
      f.roadId = name ? ensureRoad(name).id : null;
      void commit('none', { note: 'Check this one later' });
      return true;
    }
    case 'outcome': stepOutcome(); return true;
    case 'empty': stepEmpty(); return true;
    case 'empty-save': {
      const st = (el.dataset['s'] ?? 'empty') as Status;
      void commit(st, { appt: inDays(STAGE_DAYS[st] ?? 0) });
      return true;
    }
    case 'answered': stepAnswered(); return true;
    case 'not-int': stepNotInterested(); return true;
    case 'reason': void commit('no', { note: el.dataset['r'] ?? '' }); return true;
    case 'save': void commit((el.dataset['s'] ?? 'noanswer') as Status); return true;
    case 'interested': readForm(); stepInterested(); return true;
    case 'to-appt': readForm(); stepAppt(); return true;
    case 'save-form': readForm(); void commit((el.dataset['s'] ?? 'follow') as Status); return true;
    case 'save-appt': readForm(); void commit('appt', { appt: ($('f-appt') as HTMLInputElement).value }); return true;
    default:
      return false;
  }
}
