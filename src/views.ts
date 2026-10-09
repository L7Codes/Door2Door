import { $, esc } from './dom';
import { makeBackup, parseBackup, saveFile, toCsv } from './backup';
import { addHist, inDays, mergeSnapshots, shortDate } from './logic';
import { allDays, dateLabel, hhmm, homesOf, markShown, pct, saveDay, summaryText, today } from './day';
import { store } from './store';
import { sheet, toast } from './ui';
import type { House, Road, Status } from './types';
import { BIZ_TYPES, hasDate, REMIND_DAYS, STATUS_LABEL, statusesFor, statusLabel } from './types';
import type { DayRecord } from './types';

interface Hooks {
  changed: () => void;
  goto: (h: House) => void;
  movePin: (id: string) => void;
}
let hooks: Hooks;
let pending: ReturnType<typeof parseBackup> = null;

export function initViews(h: Hooks): void {
  hooks = h;
}

const statusButtons = (id: string, kind?: string): string =>
  statusesFor(kind)
    .map((s) => `<button class="btn sm s-${s}" data-a="set-status" data-id="${id}" data-s="${s}">${statusLabel({ status: s, kind })}</button>`)
    .join('');

function histLine(h: House): string {
  const parts = (h.hist ?? '').split('|').filter(Boolean);
  if (parts.length < 2) return '';
  const txt = parts
    .map((p) => {
      const [st, d] = p.split(':');
      return `${STATUS_LABEL[st as Status] ?? st} ${shortDate(d ?? '')}`;
    })
    .join(' → ');
  return `<p class="hist">${esc(txt)}</p>`;
}

export function openHouse(id: string): void {
  const h = store.house(id);
  if (!h) return;
  const r = store.road(h.roadId);
  const biz = h.kind === 'biz';
  sheet.show(`<h2><span class="dot s-${h.status}"></span>${biz ? esc(h.bname || 'Business') : `<span class="plate">${esc(h.num || '?')}</span>`} ${esc(biz ? (h.num ? h.num + ' ' : '') + (r?.name ?? '') : (r?.name ?? 'Unnamed road'))}</h2>
    <p>${esc(statusLabel(h))}${hasDate(h.status) ? (h.appt ? ' · check back ' + esc(shortDate(h.appt)) : '') : h.appt ? ' · ' + esc(h.appt.replace('T', ' ')) : ''}</p>
    ${histLine(h)}
    <div class="row tight">${statusButtons(id, h.kind)}</div>
    ${hasDate(h.status) ? `<label for="e-date">Check back on</label><input id="e-date" type="date" value="${esc(h.appt.slice(0, 10))}">` : ''}
    <div class="seg" role="group" aria-label="Home or business"><button data-a="set-kind" data-id="${id}" data-k="home" aria-pressed="${!biz}">Home</button><button data-a="set-kind" data-id="${id}" data-k="biz" aria-pressed="${biz}">Business</button></div>
    ${biz ? `<label for="e-bname">Business name</label><input id="e-bname" autocomplete="off" autocapitalize="words" value="${esc(h.bname ?? '')}">
      <label for="e-btype">Type of business</label><input id="e-btype" list="biz-types" autocomplete="off" value="${esc(h.btype ?? '')}"><datalist id="biz-types">${BIZ_TYPES.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>` : ''}
    <label for="e-name">${biz ? 'Who you spoke to' : 'Name'}</label><input id="e-name" autocomplete="off" value="${esc(h.name)}">
    <label for="e-phone">Phone</label><input id="e-phone" inputmode="tel" autocomplete="off" value="${esc(h.phone)}">
    <label for="e-note">Note</label><textarea id="e-note" rows="2">${esc(h.note)}</textarea>
    <label for="e-num">${biz ? 'Unit or number' : 'House number'}</label><input id="e-num" autocomplete="off" autocapitalize="characters" value="${esc(h.num)}">
    <div class="row"><button class="btn pri big" data-a="save-edit" data-id="${id}">Save</button><button class="btn big" data-a="close">Close</button></div>
    <div class="row"><button class="btn" data-a="move-pin" data-id="${id}">Move pin on map</button><button class="btn quiet" data-a="delete" data-id="${id}">Delete this house</button></div>`);
}

export function openRename(id: string): void {
  const r = store.road(id);
  if (!r) return;
  sheet.show(`<h2>Rename road</h2><p>Every house on it updates.</p><label for="rr">Road name</label><input id="rr" autocomplete="off" autocapitalize="words" value="${esc(r.name)}">
    <div class="row"><button class="btn pri big" data-a="save-rename" data-id="${id}">Save</button><button class="btn big" data-a="close">Cancel</button></div>`);
}

export function handleViewAction(a: string, el: HTMLElement): boolean {
  if (handleDayAction(a, el)) return true;
  const id = el.dataset['id'] ?? '';
  const val = (x: string): string => ($(x) as HTMLInputElement).value;
  switch (a) {
    case 'set-status': {
      const h = store.house(id);
      if (h) {
        const st = el.dataset['s'] as Status;
        const appt = hasDate(st) ? inDays(REMIND_DAYS[st] ?? 0) : hasDate(h.status) ? '' : h.appt;
        void store.putHouse({ ...h, status: st, appt, hist: addHist(h.hist, st), ts: Date.now() }).then(() => {
          hooks.changed();
          openHouse(id);
        });
      }
      return true;
    }
    case 'save-edit': {
      const h = store.house(id);
      if (h) {
        void store
          .putHouse({ ...h, name: val('e-name'), phone: val('e-phone'), note: val('e-note'), num: val('e-num').trim().toUpperCase(), appt: hasDate(h.status) && document.getElementById('e-date') ? val('e-date') : h.appt, bname: document.getElementById('e-bname') ? val('e-bname').trim() : h.bname, btype: document.getElementById('e-btype') ? val('e-btype').trim() : h.btype })
          .then(() => {
            hooks.changed();
            sheet.close();
            toast('Saved');
          });
      }
      return true;
    }
    case 'delete':
      if (el.dataset['armed']) {
        void store.deleteHouse(id).then(() => {
          hooks.changed();
          sheet.close();
          toast('Deleted');
        });
      } else {
        el.dataset['armed'] = '1';
        el.textContent = 'Tap again to delete';
      }
      return true;
    case 'set-kind': {
      const h = store.house(id);
      if (h) {
        const kind = el.dataset['k'] === 'biz' ? 'biz' : 'home';
        void store.putHouse({ ...h, kind, ts: Date.now() }).then(() => {
          hooks.changed();
          openHouse(id);
        });
      }
      return true;
    }
    case 'move-pin':
      hooks.movePin(id);
      return true;
    case 'rename-road':
      openRename(id);
      return true;
    case 'save-rename': {
      const r = store.road(id);
      const v = val('rr').trim();
      if (r && v) void store.putRoad({ ...r, name: v }).then(() => { hooks.changed(); sheet.close(); toast('Road renamed'); });
      return true;
    }
    case 'save-backup':
      void saveFile(`door2door-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', makeBackup(store.snapshot())).then((ok) => {
        if (ok) {
          void store.setMeta('lastBackup', Date.now());
          hooks.changed();
          toast('Backup saved');
        }
      });
      return true;
    case 'save-csv':
      void saveFile('door2door.csv', 'text/csv', toCsv(store.snapshot()));
      return true;
    case 'restore':
      $('restore-file').click();
      return true;
    case 'restore-replace':
    case 'restore-merge':
      if (pending) {
        const incoming = pending;
        const next = a === 'restore-merge' ? mergeSnapshots(store.snapshot(), incoming) : incoming;
        void store.replaceAll(next).then(() => {
          pending = null;
          hooks.changed();
          sheet.close();
          toast(`Restored ${next.houses.length} houses`);
        });
      }
      return true;
    case 'clear-cache':
      void clearTileCache().then(() => {
        toast('Map cache cleared');
        openSettings();
      });
      return true;
    case 'theme':
      void store.setMeta('theme', el.dataset['t']).then(() => {
        applyTheme();
        openSettings();
      });
      return true;
    default:
      return false;
  }
}

export function onRestoreFile(file: File): void {
  void file.text().then((text) => {
    const snap = parseBackup(text);
    if (!snap) {
      toast('That file is not a Door2Door backup');
      return;
    }
    pending = snap;
    sheet.show(`<h2>Restore backup</h2><p>The backup has ${snap.houses.length} houses on ${snap.roads.length} roads. You currently have ${store.houses.length} houses.</p>
      <div class="row"><button class="btn pri big" data-a="restore-merge">Merge both</button><button class="btn big" data-a="restore-replace">Replace mine</button></div>
      <div class="row"><button class="btn quiet" data-a="close">Cancel</button></div>`);
  });
}

async function clearTileCache(): Promise<void> {
  if (!('caches' in window)) return;
  for (const k of await caches.keys()) if (k.startsWith('tiles-')) await caches.delete(k);
}

export function applyTheme(): void {
  const t = store.meta['theme'];
  if (t === 'light' || t === 'dark') document.documentElement.dataset['theme'] = t;
  else delete document.documentElement.dataset['theme'];
}

const mb = (n: number): string => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(0)} MB`);

export async function openSettings(): Promise<void> {
  const last = store.meta['lastBackup'] as number | undefined;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  let used = '';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage) used = `Door2Door is using about ${mb(est.usage)} on this phone, nearly all of it saved map tiles.`;
  } catch {
    /* estimate is optional */
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  const theme = (store.meta['theme'] as string | undefined) ?? 'auto';
  const t = (v: string, label: string): string => `<button class="btn sm${theme === v ? ' pri' : ''}" data-a="theme" data-t="${v}">${label}</button>`;
  sheet.show(`<h2>Settings</h2>
    ${store.durable ? '' : '<p class="warn">This browser is not letting Door2Door save data. Open it in Safari, not a private tab.</p>'}
    ${standalone ? '' : '<p class="warn">Tap the Share button in Safari, then Add to Home Screen. Installed, your data is much less likely to be cleared.</p>'}
    <h3>Your data</h3>
    <p>${store.houses.length} houses on ${store.roads.filter((r) => store.houses.some((h) => h.roadId === r.id)).length} roads. ${days === null ? 'Never backed up.' : days === 0 ? 'Backed up today.' : `Last backup ${days} day${days === 1 ? '' : 's'} ago.`}</p>
    <div class="row"><button class="btn pri" data-a="save-backup">Save backup</button><button class="btn" data-a="restore">Restore</button></div>
    <p class="hint">Choose Save to Files, then iCloud Drive, so a copy lives outside your phone.</p>
    <div class="row"><button class="btn" data-a="save-csv">Export for spreadsheet</button></div>
    <h3>Storage</h3><p>${used || 'Houses take almost no space.'}</p>
    <div class="row"><button class="btn" data-a="clear-cache">Clear saved map tiles</button></div>
    <h3>Appearance</h3><div class="row tight">${t('auto', 'Match phone')}${t('light', 'Light')}${t('dark', 'Dark')}</div>
    <div class="row"><button class="btn big" data-a="close">Done</button></div>
    <input type="file" id="restore-file" accept="application/json,.json" hidden>`);
  $('restore-file').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) onRestoreFile(f);
  });
}

export function renderRoads(): void {
  const el = $('roads');
  const groups: { road: Road | null; houses: House[] }[] = [];
  for (const r of store.roads) {
    const hs = store.houses.filter((h) => h.roadId === r.id);
    if (hs.length) groups.push({ road: r, houses: hs });
  }
  const loose = store.houses.filter((h) => !h.roadId || !store.road(h.roadId));
  if (loose.length) groups.push({ road: null, houses: loose });
  if (!groups.length) {
    el.innerHTML = '<div class="empty"><h2>No houses yet</h2><p>Go to the map and tap Knock here at your first door.</p></div>';
    return;
  }
  groups.sort((a, b) => Math.max(...b.houses.map((h) => h.ts)) - Math.max(...a.houses.map((h) => h.ts)));
  el.innerHTML = groups
    .map(({ road, houses }) => {
      const c = (s: Status): number => houses.filter((h) => h.status === s).length;
      const sorted = [...houses].sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
      return `<article class="road"><header><h3>${esc(road?.name ?? 'Needs a road')}</h3>
        <p>${esc(road?.area ?? '')} ${road ? '' : 'Pins dropped without a road name.'}</p>
        <p class="counts">${houses.length} knocked · ${c('follow')} follow-up · ${c('appt')} booked · ${c('sale')} sold${c('empty') + c('reserved') + c('movingin') + c('refit') + c('opening') ? ` · ${c('empty') + c('reserved') + c('movingin') + c('refit') + c('opening')} empty or not open` : ''}</p></header>
        ${sorted.map((h) => `<button class="hrow" data-goto="${h.id}"><span class="dot s-${h.status}"></span><b>${esc(h.kind === 'biz' ? (h.bname || 'Shop') : (h.num || '?'))}</b><span class="what">${esc([hasDate(h.status) && h.appt ? `${statusLabel(h)}, check back ${shortDate(h.appt)}` : statusLabel(h), h.name, h.note].filter(Boolean).join(' · '))}</span></button>`).join('')}
        ${road ? `<button class="btn sm" data-rename="${road.id}">Rename road</button>` : ''}</article>`;
    })
    .join('');
}

// ---------- Your day

const row = (n: number | string, label: string, cls = ''): string => `<div class="drow ${cls}"><b>${n}</b><span>${label}</span></div>`;

function splitLine(r: DayRecord): string {
  const b = r.biz;
  if (!b || !b.doors) return '';
  const h = homesOf(r);
  const part = (name: string, c: { doors: number; noanswer: number; answered: number; appt: number; sale: number }, none: string, some: string): string =>
    `<div class="split"><b>${name}</b><span>${c.doors} · ${c.noanswer} ${none} · ${c.answered} ${some} · ${c.appt} booked · ${c.sale} sold</span></div>`;
  return `<div class="splits">${part('Homes', h, 'no answer', 'answered')}${part('Shops', b, 'manager out', 'spoke to someone')}</div>`;
}

function dayBody(r: DayRecord): string {
  const withSomeone = r.doors - r.stages;
  const nudge = r.sale ? 'A sale on the board.' : r.appt ? 'Appointments booked. That is the job.' : r.doors >= 100 ? 'Big day on the doors.' : r.doors ? 'Doors knocked is progress.' : '';
  return `<div class="dbig"><b>${r.doors}</b><span>doors knocked</span></div>
    ${nudge ? `<p class="nudge">${nudge}</p>` : ''}
    <div class="dgrid">${row(r.noanswer, 'No answer', 's-noanswer')}${row(r.answered, 'Answered', 'ans')}</div>
    <div class="dgrid four">${row(r.no, 'Not interested', 's-no')}${row(r.follow, 'Follow-up', 's-follow')}${row(r.left ?? 0, 'Left my number', 's-left')}${row(r.appt, 'Appointments', 's-appt')}${row(r.sale, 'Sales', 's-sale')}</div>
    ${splitLine(r)}
    ${r.stages ? `<p class="dline">${r.stages} empty, renovating or new-build place${r.stages === 1 ? '' : 's'} logged to check back on.</p>` : ''}
    ${r.doors ? `<p class="dline">${pct(r.answered, withSomeone)}% of doors with someone in were answered. ${r.roads} road${r.roads === 1 ? '' : 's'}, ${hhmm(r.first)} to ${hhmm(r.last)}.</p>` : '<p class="dline">No doors yet.</p>'}`;
}

export function openDay(): void {
  const r = today();
  const past = allDays().filter((d) => d.date !== r.date && d.doors > 0).slice(0, 14);
  sheet.show(`<h2>Today</h2><p>${esc(dateLabel(r.date))}. Counts from midnight.</p>${dayBody(r)}
    <div class="row"><button class="btn pri big" data-a="day-finish">Day knocking done</button><button class="btn big" data-a="day-share" data-date="${r.date}">Send summary</button></div>
    ${past.length ? `<label>Past days</label><div class="pastdays">${past.map((d) => `<button class="hrow" data-a="day-open" data-date="${d.date}"><b>${esc(dateLabel(d.date).replace(/^(\w{3})\w*/, '$1'))}</b><span class="what">${d.doors} doors · ${d.answered} answered · ${d.appt} booked · ${d.sale} sold</span></button>`).join('')}</div>` : ''}
    <div class="row"><button class="btn quiet" data-a="close">Close</button></div>`);
}

export function openPastDay(date: string, intro = ''): void {
  const r = allDays().find((d) => d.date === date);
  if (!r) return;
  sheet.show(`<h2>${esc(intro || dateLabel(r.date))}</h2>${intro ? `<p>${esc(dateLabel(r.date))}</p>` : ''}${dayBody(r)}
    <div class="row"><button class="btn big" data-a="day-share" data-date="${r.date}">Send summary</button><button class="btn big" data-a="close">Close</button></div>`);
}

export async function showYesterday(r: DayRecord): Promise<void> {
  await markShown(r.date);
  openPastDay(r.date, 'Your last day');
}

async function shareText(text: string): Promise<void> {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Summary copied');
  } catch {
    toast('Could not copy. Take a screenshot instead.');
  }
}

export function handleDayAction(a: string, el: HTMLElement): boolean {
  const date = el.dataset['date'] ?? '';
  switch (a) {
    case 'day-finish': {
      const r = { ...today(), finished: true };
      void saveDay(r).then(() => {
        toast('Day saved');
        openPastDay(r.date, 'Day done');
      });
      return true;
    }
    case 'day-open':
      openPastDay(date);
      return true;
    case 'day-share': {
      const r = date === today().date ? today() : allDays().find((d) => d.date === date);
      if (r) void shareText(summaryText(r));
      return true;
    }
    default:
      return false;
  }
}
