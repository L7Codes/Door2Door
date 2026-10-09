import { $, esc } from './dom';
import { dueEmpty, houseLabel, inDays, shortDate } from './logic';
import { store } from './store';
import { hasDate, statusLabel } from './types';
import type { House } from './types';

export interface Todo {
  /** Appointments, soonest first (past ones stay until you change their status). */
  appts: House[];
  /** Interested people you need to call or text, oldest first. */
  calls: House[];
  /** Houses whose check-back date has arrived. */
  due: House[];
  /** Check-backs still to come, soonest first. */
  soon: House[];
}

const byDate = (a: House, b: House): number => (a.appt < b.appt ? -1 : a.appt > b.appt ? 1 : 0);

export function buildTodo(houses: House[], now = Date.now()): Todo {
  const dueIds = new Set(dueEmpty(houses, now).map((h) => h.id));
  return {
    appts: houses.filter((h) => h.status === 'appt').sort(byDate),
    calls: houses.filter((h) => h.status === 'follow').sort((a, b) => a.ts - b.ts),
    due: houses.filter((h) => dueIds.has(h.id)).sort(byDate),
    soon: houses.filter((h) => hasDate(h.status) && h.appt && !dueIds.has(h.id)).sort(byDate)
  };
}

/** How many things need you today: appointments today or overdue, calls waiting, check-backs due. */
export function todoCount(t: Todo, now = Date.now()): number {
  const today = inDays(0, now);
  return t.appts.filter((h) => h.appt.slice(0, 10) <= today).length + t.calls.length + t.due.length;
}

const label = (h: House): string => houseLabel(h, store.road(h.roadId));

const phoneOk = (p: string): string => p.replace(/[^\d+]/g, '');

function when(h: House): string {
  if (h.status === 'appt') {
    const d = new Date(h.appt);
    return Number.isNaN(d.getTime())
      ? h.appt
      : d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return `check back ${shortDate(h.appt)}`;
}

function ago(ts: number, now: number): string {
  const d = Math.floor((now - ts) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

function item(h: House, sub: string): string {
  const tel = phoneOk(h.phone);
  const acts = tel
    ? `<a class="btn sm" href="tel:${esc(tel)}">Call</a><a class="btn sm" href="sms:${esc(tel)}">Text</a>`
    : '';
  return `<article class="todo"><button class="todo-main" data-goto="${h.id}"><span class="dot s-${h.status}"></span>
    <span class="t-body"><b>${esc(label(h))}</b><span>${esc([h.name, sub].filter(Boolean).join(' · '))}</span>${h.note ? `<em>${esc(h.note)}</em>` : ''}</span></button>
    ${acts ? `<div class="t-acts">${acts}</div>` : ''}</article>`;
}

function section(title: string, hint: string, items: string[]): string {
  if (!items.length) return '';
  return `<section><h3>${esc(title)} <span>${items.length}</span></h3><p class="hint">${esc(hint)}</p>${items.join('')}</section>`;
}

export function renderTodo(now = Date.now()): void {
  const t = buildTodo(store.houses, now);
  const html = [
    section('Appointments', 'Booked in, soonest first.', t.appts.map((h) => item(h, when(h)))),
    section('Call or text back', 'Interested and waiting on you.', t.calls.map((h) => item(h, `got their details ${ago(h.ts, now)}`))),
    section('Check back now', 'These are due. Go and knock.', t.due.map((h) => item(h, `${statusLabel(h)}, ${when(h)}`))),
    section('Coming up', 'Not due yet.', t.soon.map((h) => item(h, `${statusLabel(h)}, ${when(h)}`)))
  ].join('');
  $('todo').innerHTML = html || '<div class="empty"><h2>Nothing to do yet</h2><p>Appointments, follow-ups and houses to check back on will show here.</p></div>';
}
