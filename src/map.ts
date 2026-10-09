import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { store } from './store';
import { esc } from './dom';
import type { Fix } from './geo';

const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 21,
  maxNativeZoom: 19,
  attribution: '&copy; OpenStreetMap'
});
const sat = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery &copy; Esri' }
);

const SHOP =
  '<i class="bz"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-1.5-5h-15L3 9Zm1 0v11h16V9"/></svg></i>';

export class DoorMap {
  readonly map: L.Map;
  private pins = L.layerGroup();
  private me: L.Marker | null = null;
  private ring: L.Circle | null = null;
  private centred = false;
  satellite = true;
  filter: 'all' | 'home' | 'biz' = 'all';

  constructor(el: HTMLElement, private onPin: (id: string) => void) {
    this.map = L.map(el, { zoomControl: false, attributionControl: true }).setView([51.5626, 0.5603], 18);
    this.map.attributionControl.setPrefix(false);
    this.pins.addTo(this.map);
    const saved = store.meta['satellite'];
    this.satellite = typeof saved === 'boolean' ? saved : true;
    const f = store.meta['filter'];
    if (f === 'home' || f === 'biz') this.filter = f;
    this.applyBase();
  }

  private applyBase(): void {
    if (this.satellite) {
      if (this.map.hasLayer(street)) this.map.removeLayer(street);
      sat.addTo(this.map);
    } else {
      if (this.map.hasLayer(sat)) this.map.removeLayer(sat);
      street.addTo(this.map);
    }
  }

  cycleFilter(): 'all' | 'home' | 'biz' {
    this.filter = this.filter === 'all' ? 'home' : this.filter === 'home' ? 'biz' : 'all';
    void store.setMeta('filter', this.filter);
    this.drawPins();
    return this.filter;
  }

  toggleBase(): boolean {
    this.satellite = !this.satellite;
    this.applyBase();
    void store.setMeta('satellite', this.satellite);
    return this.satellite;
  }

  setFix(f: Fix): void {
    const ll: L.LatLngExpression = [f.lat, f.lng];
    if (!this.me) {
      this.me = L.marker(ll, {
        icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18] }),
        interactive: false,
        zIndexOffset: 1000
      }).addTo(this.map);
      this.ring = L.circle(ll, { radius: f.acc, weight: 1, color: '#2a7bdb', fillOpacity: 0.08, interactive: false }).addTo(this.map);
    } else {
      this.me.setLatLng(ll);
      this.ring?.setLatLng(ll).setRadius(f.acc);
    }
    if (!this.centred) {
      this.centred = true;
      this.map.setView(ll, 19);
    }
  }

  centreOn(lat: number, lng: number, zoom = 19): void {
    this.map.setView([lat, lng], zoom);
  }

  centre(): { lat: number; lng: number } {
    const c = this.map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  refresh(): void {
    this.map.invalidateSize();
  }

  drawPins(): void {
    this.pins.clearLayers();
    for (const h of store.houses) {
      const biz = h.kind === 'biz';
      if ((this.filter === 'home' && biz) || (this.filter === 'biz' && !biz)) continue;
      const label = biz ? esc((h.bname || h.num || 'B').slice(0, 2).toUpperCase()) : h.num ? esc(h.num) : '?';
      const long = label.length > 3 ? ' long' : '';
      const icon = L.divIcon({
        className: '',
        html: `<div class="pin s-${h.status}${long}"><span>${label}</span>${biz ? SHOP : ''}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      L.marker([h.lat, h.lng], { icon, keyboard: false }).on('click', () => this.onPin(h.id)).addTo(this.pins);
    }
  }
}
