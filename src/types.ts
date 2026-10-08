export type Status = 'none' | 'noanswer' | 'no' | 'follow' | 'appt' | 'sale';

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
  appt: string;
  ts: number;
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
  sale: 'Sale'
};

export const STATUS_ORDER: Status[] = ['noanswer', 'no', 'follow', 'appt', 'sale', 'none'];
