// The sun study panel over the 3D view: pick a date and a time of day (or play through
// the day) and see where the sun and the shadows fall; set where the house is and which
// way it faces.

import { DEFAULT_SITE, compassPoint, siteOf, sunTimes } from '../model/sun';
import type { View3D } from '../three/view3d';
import type { Store } from './store';

const DAY = 86400000;
const KEY_DATES: [string, number, number][] = [
  ['21 Mar', 2, 20],
  ['21 Jun', 5, 21],
  ['23 Sep', 8, 23],
  ['21 Dec', 11, 21],
];

export class SunPanel {
  private playing = false;
  private last = 0;
  private dateInput!: HTMLInputElement;
  private timeInput!: HTMLInputElement;
  private readout!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private siteFields = new Map<'latitude' | 'longitude' | 'north', HTMLInputElement>();
  private message!: HTMLElement;

  constructor(
    private el: HTMLElement,
    private view: View3D,
    private store: Store,
  ) {
    this.build();
    store.subscribe(() => {
      if (!this.el.hidden && !this.el.contains(document.activeElement)) this.sync();
    });
  }

  get open() {
    return !this.el.hidden;
  }

  show(on: boolean) {
    this.el.hidden = !on;
    if (!on) this.stop();
    this.view.setSunStudy(on);
    if (on) this.sync();
  }

  private get time() {
    return this.view.sunTime;
  }

  private setTime(t: Date) {
    this.view.setSunTime(t);
    this.sync();
  }

  private build() {
    const el = this.el;
    el.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = 'Sun and shadows';
    el.append(h);

    // Date: a day of this year.
    const dateRow = this.row('Date');
    this.dateInput = this.range(0, 364, 1);
    this.dateInput.addEventListener('input', () => {
      const t = this.time;
      const d = new Date(t.getFullYear(), 0, 1 + Number(this.dateInput.value), t.getHours(), t.getMinutes());
      this.setTime(d);
    });
    dateRow.append(this.dateInput);
    const quick = document.createElement('div');
    quick.className = 'buttons';
    for (const [label, m, d] of KEY_DATES) {
      quick.append(this.button(label, () => {
        const t = this.time;
        this.setTime(new Date(t.getFullYear(), m, d, t.getHours(), t.getMinutes()));
      }));
    }
    quick.append(this.button('Now', () => this.setTime(new Date())));
    el.append(quick);

    // Time of day, in 5 minute steps.
    const timeRow = this.row('Time');
    this.timeInput = this.range(0, 24 * 60 - 5, 5);
    this.timeInput.addEventListener('input', () => {
      const t = this.time;
      const v = Number(this.timeInput.value);
      this.setTime(new Date(t.getFullYear(), t.getMonth(), t.getDate(), Math.floor(v / 60), v % 60));
    });
    timeRow.append(this.timeInput);
    const play = document.createElement('div');
    play.className = 'buttons';
    this.playBtn = this.button('▶ Play the day', () => (this.playing ? this.stop() : this.play()));
    play.append(this.playBtn);
    el.append(play);

    this.readout = document.createElement('p');
    this.readout.className = 'readout';
    el.append(this.readout);

    // Where the house is.
    const site = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = 'Location and orientation';
    site.append(sum);
    const fields: ['latitude' | 'longitude' | 'north', string, number, number, string, string][] = [
      ['latitude', 'Latitude', -89, 89, '°', 'Degrees north (negative for south)'],
      ['longitude', 'Longitude', -180, 180, '°', 'Degrees east (negative for west)'],
      ['north', 'Plan top faces', -180, 360, '°', 'Compass bearing the top of the plan faces: 0 north, 90 east, 180 south, 270 west'],
    ];
    for (const [key, label, min, max, unit, title] of fields) {
      const row = document.createElement('label');
      row.className = 'field';
      row.title = title;
      const span = document.createElement('span');
      span.textContent = label;
      const input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      input.step = key === 'north' ? '1' : '0.0001';
      input.min = String(min);
      input.max = String(max);
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) return;
        this.setSite({ [key]: Math.min(max, Math.max(min, v)) });
        input.blur();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        e.stopPropagation();
      });
      const u = document.createElement('em');
      u.textContent = unit;
      row.append(span, input, u);
      site.append(row);
      this.siteFields.set(key, input);
    }
    const locate = document.createElement('div');
    locate.className = 'buttons';
    locate.append(this.button('Use this device’s location', () => this.locate()));
    site.append(locate);
    this.message = document.createElement('p');
    this.message.className = 'note';
    this.message.textContent =
      'Find the latitude and longitude on any online map (right-click or long-press a point). ' +
      'For the orientation, see which way the top of the plan faces; the plan shows a north arrow.';
    site.append(this.message);
    el.append(site);
  }

  private setSite(change: Partial<{ latitude: number; longitude: number; north: number }>) {
    const b = this.store.building;
    b.site = { ...siteOf(b), ...change };
    this.store.commit();
    // Leaves depend on the hemisphere; the sun on everything.
    this.view.setSunTime(this.time);
    this.sync();
  }

  private locate() {
    if (!navigator.geolocation || !window.isSecureContext) {
      this.message.textContent =
        'This device won’t give its location to a page on the local network (it needs https). ' +
        'Type the latitude and longitude in instead: find them on any online map.';
      return;
    }
    this.message.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        this.setSite({ latitude: round(p.coords.latitude, 4), longitude: round(p.coords.longitude, 4) });
        this.message.textContent = 'Location set from this device.';
      },
      (err) => {
        this.message.textContent = `Couldn’t get the location (${err.message}). Type it in instead.`;
      },
      { timeout: 15000 },
    );
  }

  private play() {
    this.playing = true;
    this.playBtn.textContent = '❚❚ Pause';
    this.last = performance.now();
    const step = (now: number) => {
      if (!this.playing) return;
      // 1.5 hours a second: a summer's day in about ten seconds.
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const t = this.time;
      let next = new Date(t.getTime() + dt * 1.5 * 3600000);
      const site = siteOf(this.store.building);
      const { rise, set } = sunTimes(t, site.latitude, site.longitude);
      // Loop through the daylight hours only.
      if (set && rise && next > set) next = new Date(rise);
      if (next.getDate() !== t.getDate()) next = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 5, 0);
      this.setTime(next);
      requestAnimationFrame(step);
    };
    const site = siteOf(this.store.building);
    const { rise, set } = sunTimes(this.time, site.latitude, site.longitude);
    if (rise && set && (this.time < rise || this.time > set)) this.setTime(new Date(rise));
    requestAnimationFrame(step);
  }

  private stop() {
    this.playing = false;
    this.playBtn.textContent = '▶ Play the day';
  }

  /** Put the controls and read-out in step with the current time and site. */
  private sync() {
    const t = this.time;
    const start = new Date(t.getFullYear(), 0, 1);
    this.dateInput.value = String(Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - start.getTime()) / DAY));
    this.timeInput.value = String(t.getHours() * 60 + t.getMinutes());
    const site = siteOf(this.store.building);
    for (const [key, input] of this.siteFields) input.value = String(site[key]);

    const pos = this.view.sunNow();
    const { rise, set } = sunTimes(t, site.latitude, site.longitude);
    const date = t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const lines = [`${date}, ${hm(t)}`];
    if (pos && pos.elevation > 0) {
      const deg = (r: number) => Math.round((r * 180) / Math.PI);
      lines.push(`Sun ${deg(pos.elevation)}° up, in the ${compassPoint(pos.azimuth)} (${deg(pos.azimuth)}°)`);
    } else lines.push('The sun is below the horizon');
    lines.push(rise && set ? `Sunrise ${hm(rise)} · sunset ${hm(set)}` : 'No sunrise or sunset today');
    if (!this.store.building.site) lines.push(`Location not set: showing ${DEFAULT_SITE.latitude}° N (London)`);
    this.readout.replaceChildren(...lines.map((l) => Object.assign(document.createElement('span'), { textContent: l })));
  }

  private row(label: string): HTMLElement {
    const row = document.createElement('label');
    row.className = 'slider';
    const span = document.createElement('span');
    span.textContent = label;
    row.append(span);
    this.el.append(row);
    return row;
  }

  private range(min: number, max: number, step: number): HTMLInputElement {
    const r = document.createElement('input');
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    return r;
  }

  private button(text: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }
}

const hm = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const round = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n;
