export type Status = 'none' | 'noanswer' | 'no' | 'follow' | 'appt' | 'sale' | 'empty' | 'reserved' | 'movingin';

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
  movingin: 'Moving in'
};

export const STATUS_ORDER: Status[] = ['noanswer', 'no', 'follow', 'appt', 'sale', 'empty', 'reserved', 'movingin', 'none'];

/** Empty-house stages: what you saw from the pavement, and how many days until you should look again. */
export const STAGE_DAYS: Partial<Record<Status, number>> = { empty: 42, reserved: 21, movingin: 7 };
export const isStage = (s: Status): boolean => s in STAGE_DAYS;
