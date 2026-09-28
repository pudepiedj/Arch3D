// The sun study panel over the 3D view: pick a date and a time of day (or play through
// the day) and see where the sun and the shadows fall; set where the house is and which
// way it faces.

import { DEFAULT_SITE, compassPoint, siteOf, sunTimes } from '../model/sun';
import type { View3D } from '../three/view3d';
import type { Store } from './store';

const DAY = 86400000;
/** Per device: whether the real sun is on, and the moment it was set to. */
const REMEMBER = 'arch3d.sun';
const KEY_DATES: [string, number, number][] = [
  ['21 Mar', 2, 20],
  ['21 Jun', 5, 21],
  ['23 Sep', 8, 23],
  ['21 Dec', 11, 21],
];

export class SunPanel {
  /** Playing through the day, or through the year (at the same time each day), or neither. */
  private playing: 'day' | 'year' | null = null;
  private yearBtn!: HTMLButtonElement;
  private last = 0;
  private dateInput!: HTMLInputElement;
  private timeInput!: HTMLInputElement;
  private readout!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private siteFields = new Map<'latitude' | 'longitude' | 'north', HTMLInputElement>();
  private message!: HTMLElement;
  private lightBtn!: HTMLButtonElement;
  private nowBtn!: HTMLButtonElement;
  /** Following the clock (set by Now) rather than a moment chosen by hand. */
  private live = false;

  constructor(
    private el: HTMLElement,
    private view: View3D,
    private store: Store,
  ) {
    this.build();
    // Come back as it was left: the real sun at the moment last set (on this device).
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBER) ?? 'null') as { on: boolean; time: number; live?: boolean } | null;
      this.live = !!saved?.live;
      if (this.live) this.view.setSunTime(new Date());
      else if (saved?.time) this.view.setSunTime(new Date(saved.time));
      if (saved?.on) this.view.setSunStudy(true);
    } catch {
      // Nothing remembered: plain light, the time now.
    }
    this.sync();
    // Live: keep the sun on the clock, checked twice a minute.
    setInterval(() => {
      if (!this.live) return;
      this.view.setSunTime(new Date());
      this.remember();
      if (this.open) this.sync();
    }, 30000);
    store.subscribe(() => {
      if (!this.el.hidden && !this.el.contains(document.activeElement)) this.sync();
    });
  }

  get open() {
    return !this.el.hidden;
  }

  /**
   * Open or close the panel. Opening it turns the real sun on; closing it leaves the sun
   * where it was set (use Plain light in the panel to go back to the fixed light).
   */
  show(on: boolean) {
    this.el.hidden = !on;
    if (!on) this.stop();
    if (on && !this.view.sunStudy) this.setReal(true);
    if (on) this.sync();
  }

  /** The real sun (true) or the plain, fixed light (false). */
  private setReal(on: boolean) {
    this.view.setSunStudy(on);
    this.remember();
    this.sync();
  }

  private remember() {
    try {
      localStorage.setItem(REMEMBER, JSON.stringify({ on: this.view.sunStudy, time: this.view.sunTime.getTime(), live: this.live }));
    } catch {
      // Not remembered; no matter.
    }
  }

  private get time() {
    return this.view.sunTime;
  }

  /** Move the sun to a moment; `live` keeps it following the clock from there (Now). */
  private setTime(t: Date, live = false) {
    this.live = live;
    this.view.setSunTime(t);
    if (!this.view.sunStudy) this.view.setSunStudy(true);
    this.remember();
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
    this.nowBtn = this.button('Now', () => this.setTime(new Date(), true));
    this.nowBtn.title = 'The sun as it is now, following the clock until you choose another date or time';
    quick.append(this.nowBtn);
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
    this.playBtn = this.button('▶ Play the day', () => (this.playing === 'day' ? this.stop() : this.play()));
    this.yearBtn = this.button('▶ Play the year', () => (this.playing === 'year' ? this.stop() : this.playYear()));
    this.lightBtn = this.button('Plain light', () => this.setReal(!this.view.sunStudy));
    this.lightBtn.title = 'Switch between the real sun for this date and time, and a plain fixed light that shows the model well at any hour';
    play.append(this.playBtn, this.yearBtn, this.lightBtn);
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

  /**
   * Through the year at this time of day, about three weeks a second (a year in some twenty
   * seconds): the sun climbing and falling, the shadows lengthening, and the trees coming
   * into leaf, turning and going bare.
   */
  private playYear() {
    this.stop();
    this.playing = 'year';
    this.yearBtn.textContent = '❚❚ Pause';
    // At night there is nothing to see: show midday instead.
    const pos = this.view.sunNow();
    if (!pos || pos.elevation <= 0) {
      const t = this.time;
      this.setTime(new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0));
    }
    this.last = performance.now();
    // Days into the year, counted in fractions but shown a whole day at a time, always at
    // the same time of day.
    const start = this.time;
    const year = start.getFullYear();
    const hour = start.getHours();
    const minute = start.getMinutes();
    let day = (new Date(year, start.getMonth(), start.getDate()).getTime() - new Date(year, 0, 1).getTime()) / DAY;
    const step = (now: number) => {
      if (this.playing !== 'year') return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const before = Math.floor(day);
      day = (day + dt * 18) % 365;
      // Round the year and back to January, in the same year.
      if (Math.floor(day) !== before) this.setTime(new Date(year, 0, 1 + Math.floor(day), hour, minute));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private play() {
    this.stop();
    this.playing = 'day';
    this.playBtn.textContent = '❚❚ Pause';
    this.last = performance.now();
    const step = (now: number) => {
      if (this.playing !== 'day') return;
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
    this.playing = null;
    this.playBtn.textContent = '▶ Play the day';
    this.yearBtn.textContent = '▶ Play the year';
  }

  /** Put the controls and read-out in step with the current time and site. */
  private sync() {
    this.lightBtn.textContent = this.view.sunStudy ? 'Plain light' : 'Real sun';
    this.nowBtn.classList.toggle('on', this.live);
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
    if (this.live) lines.push('Live: following the clock');
    if (!this.view.sunStudy) lines.push('Plain light is on: press Real sun (or move a slider) to see the sun for this time');
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
