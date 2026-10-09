import { houseLabel } from './logic';
import { hasDate, statusLabel } from './types';
import type { House, Road } from './types';

/** What the visit is for, in words you will understand in a calendar a month from now. */
export function purpose(h: House): string {
  const biz = h.kind === 'biz';
  switch (h.status) {
    case 'appt': return 'Appointment booked';
    case 'left': return 'Check back: I left my number, nothing heard';
    case 'empty': return biz ? 'Check back: empty unit' : 'Check back: not sold yet';
    case 'reserved': return 'Check back: sold, not moved in yet';
    case 'movingin': return 'Check back: about to move in, knock now';
    case 'refit': return 'Check back: shop being renovated';
    case 'opening': return 'Check back: new shop coming';
    default: return `Check back: ${statusLabel(h)}`;
  }
}

/** Notes with anything that looks like a phone number or email taken out. Names and phone fields are never used. */
export function safeNote(note: string): string {
  return note
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes must be folded for the calendar format. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const pad = (n: number): string => String(n).padStart(2, '0');
const stamp = (d: Date): string => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

export function eventFor(h: House, road: Road | null, now: Date, withNotes: boolean): string[] | null {
  if (!hasDate(h.status) && h.status !== 'appt') return null;
  if (!h.appt) return null;
  const timed = h.status === 'appt' && h.appt.includes('T');
  const day = h.appt.slice(0, 10).replace(/-/g, '');
  if (!/^\d{8}$/.test(day)) return null;
  const where = houseLabel(h, road).replace(/^Business, /, '');
  const title = `${h.kind === 'biz' && h.bname ? h.bname : h.num ? h.num : 'Door'}${h.pc ? ' ' + h.pc : road ? ' ' + road.name : ''}: ${purpose(h)}`;
  const note = withNotes ? safeNote(h.note) : '';
  const lines = ['BEGIN:VEVENT', `UID:${h.id}-${h.status}@door2door`, `DTSTAMP:${stamp(now)}`, `SUMMARY:${esc(title)}`];
  if (timed) {
    const [d, t] = h.appt.split('T');
    const start = `${d.replace(/-/g, '')}T${t.slice(0, 5).replace(':', '')}00`;
    const end = new Date(`${d}T${t.slice(0, 5)}:00`);
    end.setHours(end.getHours() + 1);
    lines.push(`DTSTART:${start}`, `DTEND:${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T${pad(end.getHours())}${pad(end.getMinutes())}00`);
  } else {
    const next = new Date(`${h.appt.slice(0, 10)}T12:00:00`);
    next.setDate(next.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`);
  }
  lines.push(`LOCATION:${esc([where, h.pc].filter(Boolean).join(', '))}`);
  lines.push(`DESCRIPTION:${esc([purpose(h), note, 'Added from Door2Door'].filter(Boolean).join('\n'))}`);
  // Appointments matter most: remind 24 hours, 12 hours and 2 hours before. Check-backs get one 9am reminder.
  for (const t of timed ? ['-P1D', '-PT12H', '-PT2H'] : ['PT9H'])
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(purpose(h))}`, `TRIGGER:${t}`, 'END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

export function buildIcs(houses: House[], roads: Road[], withNotes = true, now = new Date()): { text: string; count: number } {
  const body: string[] = [];
  let count = 0;
  for (const h of houses) {
    const ev = eventFor(h, roads.find((r) => r.id === h.roadId) ?? null, now, withNotes);
    if (ev) {
      body.push(...ev);
      count++;
    }
  }
  const all = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Door2Door//EN', 'CALSCALE:GREGORIAN', ...body, 'END:VCALENDAR'];
  return { text: all.map(fold).join('\r\n') + '\r\n', count };
}

