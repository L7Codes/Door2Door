export type Status = 'none' | 'noanswer' | 'no' | 'follow' | 'appt' | 'sale' | 'empty' | 'reserved' | 'movingin' | 'left';

export interface Road {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
}

export interface House {
  id: string;
  roadId: string | null;
  num: string;
  lat: number;
  lng: number;
  status: Status;
  name: string;
  phone: string;
  note: string;
  /** Appointment time, or for an empty-house stage the check-back date. */
  appt: string;
  ts: number;
  /** Stage trail like "empty:2026-10-09|reserved:2026-11-06". */
  hist?: string;
  /** 'biz' for a shop or office; missing means a home. */
  kind?: 'home' | 'biz';
  bname?: string;
  btype?: string;
}

/** Where you last knocked: drives the "still on this road?" guess. */
export interface Cursor {
  roadId: string;
  lat: number;
  lng: number;
  nums: string[];
}

export interface Snapshot {
  houses: House[];
  roads: Road[];
  cursor: Cursor | null;
  days?: DayRecord[];
}

/** One day of knocking, frozen so it survives later edits to houses. */
export interface DayRecord {
  date: string; // YYYY-MM-DD, local
  doors: number;
  noanswer: number;
  answered: number;
  no: number;
  follow: number;
  appt: number;
  sale: number;
  left?: number;
  stages: number;
  roads: number;
  first: number;
  last: number;
  finished: boolean;
}

export interface Lookup {
  num: string;
  road: string;
  area: string;
  postcode: string;
  /** Shop or business name the map knows at this spot, if any. */
  place?: string;
}

export const STATUS_LABEL: Record<Status, string> = {
  none: 'Not checked',
  noanswer: 'No answer',
  no: 'Not interested',
  follow: 'Follow-up',
  appt: 'Appointment',
  sale: 'Sale',
  empty: 'Not sold',
  reserved: 'Sold, not in yet',
  movingin: 'Moving in',
  left: 'Left my number'
};

export const STATUS_ORDER: Status[] = ['noanswer', 'no', 'follow', 'appt', 'sale', 'empty', 'reserved', 'movingin', 'left', 'none'];

/** Empty-house stages: what you saw from the pavement, and how many days until you should look again. */
export const STAGE_DAYS: Partial<Record<Status, number>> = { empty: 42, reserved: 21, movingin: 7 };
/** Statuses that carry a check-back date: the empty-house stages, plus someone who took your number. */
export const REMIND_DAYS: Partial<Record<Status, number>> = { ...STAGE_DAYS, left: 56 };
export const hasDate = (s: Status): boolean => s in REMIND_DAYS;
export const isStage = (s: Status): boolean => s in STAGE_DAYS;

export const BIZ_TYPES = ['Convenience store', 'Off-licence', 'Barber', 'Hairdresser', 'Nail salon', 'Beauty salon', 'Takeaway', 'Pub or bar', 'Office', 'Other'];

/** What an outcome is called for this house: a shop's "No answer" is the manager being out. */
export const statusLabel = (h: { status: Status; kind?: string }): string =>
  h.kind === 'biz' && h.status === 'noanswer' ? 'Manager not in' : STATUS_LABEL[h.status];
