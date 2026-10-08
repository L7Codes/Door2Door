import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { $, ICON } from './dom';
import { watchGps, type Fix, type GpsState } from './geo';
import { handleFlowAction, initFlow, knock, knockHint } from './flow';
import { tally } from './logic';
import { DoorMap } from './map';
import { store } from './store';
import { initSheet, notice, sheet } from './ui';
import { applyTheme, handleViewAction, initViews, openHouse, openRename, openSettings, renderRoads } from './views';

let fix: Fix | null = null;
let gps: GpsState = 'waiting';
let view: 'map' | 'roads' = 'map';
let doorMap: DoorMap;

function renderTally(): void {
  const t = tally(store.houses, Date.now());
  const cell = (n: number, label: string): string => `<div><b>${n}</b><span>${label}</span></div>`;
  $('tally').innerHTML = cell(t.doors, 'doors') + cell(t.answered, 'answered') + cell(t.booked, 'booked') + cell(t.sales, 'sales');
}

function renderNotice(): void {
  if (gps === 'blocked') return notice('Location is off. In iPhone Settings, allow Location for Safari or Door2Door.');
  if (gps === 'unsupported') return notice('This browser cannot give a GPS position.');
  const last = store.meta['lastBackup'] as number | undefined;
  const stale = !last || Date.now() - last > 7 * 86400000;
  if (store.houses.length >= 5 && stale) return notice('Save a backup so your houses are safe. Tap here.', () => void openSettings());
  notice(null);
}

function changed(): void {
  doorMap.drawPins();
  renderTally();
  if (view === 'roads') renderRoads();
  $('k-sub').textContent = knockHint();
  renderNotice();
}

function setView(v: 'map' | 'roads'): void {
  view = v;
  const map = v === 'map';
  $('map').hidden = !map;
  $('roads').hidden = map;
  document.querySelector<HTMLElement>('.fab-col')!.hidden = !map;
  const nav = $('nav-roads');
  nav.setAttribute('aria-pressed', String(!map));
  nav.innerHTML = map ? `${ICON.roads}<span>Roads</span>` : `${ICON.map}<span>Map</span>`;
  if (map) setTimeout(() => doorMap.refresh(), 30);
  else renderRoads();
}

async function boot(): Promise<void> {
  await store.load();
  applyTheme();
  doorMap = new DoorMap($('map'), openHouse);
  const last = store.houses[store.houses.length - 1];
  if (last) doorMap.centreOn(last.lat, last.lng, 18);

  $('btn-layers').innerHTML = ICON.layers;
  $('btn-layers').setAttribute('aria-pressed', String(doorMap.satellite));
  $('btn-locate').innerHTML = ICON.locate;
  $('nav-menu').innerHTML = `${ICON.menu}<span>Menu</span>`;

  initSheet();
  initFlow({ getFix: () => fix, getCentre: () => doorMap.centre(), changed });
  initViews({
    changed,
    goto: (h) => {
      setView('map');
      doorMap.centreOn(h.lat, h.lng);
      openHouse(h.id);
    }
  });
  sheet.onAction((a, el) => {
    if (a === 'close') return sheet.close();
    if (handleFlowAction(a, el)) return;
    handleViewAction(a, el);
  });

  $('btn-layers').onclick = () => $('btn-layers').setAttribute('aria-pressed', String(doorMap.toggleBase()));
  $('btn-locate').onclick = () => fix && doorMap.centreOn(fix.lat, fix.lng);
  $('nav-roads').onclick = () => setView(view === 'map' ? 'roads' : 'map');
  $('nav-menu').onclick = () => void openSettings();
  $('knock').onclick = () => {
    if (view !== 'map') setView('map');
    void knock();
  };
  $('roads').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const g = t.closest<HTMLElement>('[data-goto]');
    const r = t.closest<HTMLElement>('[data-rename]');
    if (g) {
      const h = store.house(g.dataset['goto'] ?? '');
      if (h) {
        setView('map');
        doorMap.centreOn(h.lat, h.lng);
        openHouse(h.id);
      }
    } else if (r) openRename(r.dataset['rename'] ?? '');
  });

  watchGps(
    (f) => {
      fix = f;
      doorMap.setFix(f);
      $('k-sub').textContent = knockHint();
    },
    (s) => {
      gps = s;
      renderNotice();
    }
  );

  setView('map');
  changed();
  void navigator.storage?.persist?.();
  registerSW({ immediate: true });
  setInterval(renderTally, 60000);
}

void boot();
