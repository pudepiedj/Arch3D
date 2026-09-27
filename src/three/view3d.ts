import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { planBounds } from '../model/plan';
import { WalkWorld } from '../model/walk';
import { detectRooms } from '../model/rooms';
import { getLevel, levelElevation } from '../model/building';
import type { Building, Level } from '../model/types';
import { type SunPosition, seasonAt, siteOf, sunDirection, sunPosition } from '../model/sun';
import { type Season, buildBuildingObject, createMaterials, disposeObject } from './build';
import { buildDrains } from './drains3d';

export type ViewMode = 'orbit' | 'walk';

const EYE = 1.6;
const SPEED = 1.8;

export class View3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
  private orbit: OrbitControls;
  private look: PointerLockControls;
  private mats = createMaterials();
  private planObj: THREE.Object3D | null = null;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  /** The floors hidden by the cutaway, kept only to cast their shadows during a sun study. */
  private shadowObj: THREE.Object3D | null = null;
  private shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  /** Sun study: the sun where it really is at `sunTime`; otherwise a fixed, flattering light. */
  sunStudy = false;
  sunTime = new Date();
  private season: Season = { leaf: 1, autumn: false };
  /** Underground view: the ground and floors see-through, the drains shown, the camera free to go below. */
  underground = false;
  private groundMat!: THREE.MeshStandardMaterial;
  private drainsObj: { below: THREE.Group; surface: THREE.Group } | null = null;
  /** Doors shown shut, which swing open in walk mode as the walker reaches them. */
  private doors: { pivot: THREE.Object3D; x: number; y: number; floor: number; open: number }[] = [];
  private world: WalkWorld | null = null;
  /** Height of the walker's feet, and the smoothed eye height that follows it. */
  private foot = 0;
  private eyeY = EYE;
  /** Level the walker is standing on; reported so the plan can follow them up the stairs. */
  private walkLevelId = '';
  onWalkLevelChange?: (levelId: string) => void;
  private plan: Level | null = null;
  private building: Building | null = null;
  private activeId = '';
  /** Elevation of the level being edited/walked. */
  private floorY = 0;
  /** Hide the levels above the active one in orbit view. */
  cutaway = false;
  private keys = new Set<string>();
  private timer = new THREE.Timer();
  private framed = false;
  mode: ViewMode = 'orbit';
  onModeChange?: (m: ViewMode) => void;
  /** The 3D graphics were lost (true) or given back (false). */
  onContextLost?: (lost: boolean) => void;
  lost = false;
  onLockChange?: (locked: boolean) => void;

  // Touch walking: left half of the view is a joystick, right half turns the head.
  private touchMove: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
  private touchLook: { id: number; x: number; y: number } | null = null;
  private yaw = 0;
  private pitch = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    // If the graphics crash or run out of memory the browser takes the 3D view away: say so
    // (rather than leaving it blank), and carry on if the browser gives it back.
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.onContextLost?.(true);
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.rebuild();
      this.onContextLost?.(false);
    });

    this.scene.background = new THREE.Color(0xcfe3f3);
    this.scene.fog = new THREE.Fog(0xcfe3f3, 60, 180);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb9b2a6, 1.4);
    // Fill light so ceilings and rooms away from windows are not gloomy.
    this.ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(this.hemi, this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x9fb98f, roughness: 1, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(200, 64), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.camera.position.set(12, 14, 20);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.02;

    this.look = new PointerLockControls(this.camera, this.renderer.domElement);
    this.look.addEventListener('lock', () => this.onLockChange?.(true));
    this.look.addEventListener('unlock', () => this.onLockChange?.(false));

    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('click', () => {
      if (this.mode === 'walk' && !this.isTouch && !this.look.isLocked) this.look.lock();
    });
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    window.addEventListener('keydown', (e) => {
      if (this.mode === 'walk' && !isTyping(e)) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private isTouch = false;

  /**
   * Show a building while `activeId` is the level being edited. In orbit view with
   * `cutaway` on, the levels above it are hidden and its ceilings removed, like a doll's house.
   */
  setBuilding(b: Building, activeId: string) {
    const levelChanged = this.activeId !== activeId;
    this.building = b;
    this.activeId = activeId;
    this.plan = getLevel(b, activeId) ?? b.levels[0];
    this.floorY = levelElevation(b, this.plan.id);
    this.rebuild();
    // Switching floors teleports the walker, unless they got there by climbing the stairs.
    if (this.mode === 'walk' && levelChanged && activeId !== this.walkLevelId) this.placeWalker();
  }

  setCutaway(on: boolean) {
    this.cutaway = on;
    this.rebuild();
  }

  /**
   * Show what is below ground: the ground, floors and patios become see-through, the drains
   * appear, and the orbit view can go beneath the surface.
   */
  setUnderground(on: boolean) {
    this.underground = on;
    const see = (m: THREE.Material, opacity: number) => {
      m.transparent = on;
      m.opacity = on ? opacity : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    };
    see(this.groundMat, 0.25);
    for (const m of [this.mats.floor, this.mats.paving, this.mats.decking, this.mats.gravel, this.mats.paveEdge, this.mats.deckEdge]) see(m, 0.4);
    if (this.drainsObj) this.drainsObj.below.visible = on;
    this.orbit.maxPolarAngle = on ? Math.PI - 0.05 : Math.PI / 2 - 0.02;
    if (!on && this.camera.position.y < 0.5) this.frame();
  }

  /** Turn the sun study on or off. */
  setSunStudy(on: boolean) {
    this.sunStudy = on;
    // Sharper shadows for studying them.
    // (Not on a tablet, whose graphics memory is smaller.)
    const sharp = on && !matchMedia('(pointer: coarse)').matches ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sharp, sharp);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.rebuild();
  }

  /** Move the sun (and the seasons) to a moment. */
  setSunTime(t: Date) {
    this.sunTime = t;
    const b = this.building;
    const next = b ? seasonAt(t, siteOf(b).latitude) : this.season;
    const leafChanged = Math.round(next.leaf * 10) !== Math.round(this.season.leaf * 10) || next.autumn !== this.season.autumn;
    if (leafChanged) this.rebuild();
    else this.placeSun();
  }

  /** The sun's position now, for the read-out. */
  sunNow(): SunPosition | null {
    if (!this.building) return null;
    const site = siteOf(this.building);
    return sunPosition(this.sunTime, site.latitude, site.longitude);
  }

  private rebuild() {
    const b = this.building;
    if (!b) return;
    for (const o of [this.planObj, this.shadowObj]) {
      if (!o) continue;
      this.scene.remove(o);
      disposeObject(o);
    }
    this.shadowObj = null;
    this.season = seasonAt(this.sunTime, siteOf(b).latitude);
    const cut = this.mode === 'orbit' && this.cutaway ? this.activeId : undefined;
    this.planObj = buildBuildingObject(b, this.mats, cut, this.season);
    this.scene.add(this.planObj);
    this.planObj.updateMatrixWorld(true);
    this.doors = [];
    this.planObj.traverse((o) => {
      if (!o.name.startsWith('door:')) return;
      const c = o.userData.centre as { x: number; y: number };
      const floor = o.getWorldPosition(new THREE.Vector3()).y;
      this.doors.push({ pivot: o, x: c.x, y: c.y, floor, open: o.userData.openAngle as number });
    });
    // The floors the cutaway hides still shade the garden in a sun study: keep them as
    // invisible shadow casters.
    if (cut && this.sunStudy) {
      this.shadowObj = buildBuildingObject(b, this.mats, undefined, this.season);
      this.shadowObj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = this.shadowOnly;
        m.castShadow = true;
        m.receiveShadow = false;
      });
      this.scene.add(this.shadowObj);
    }
    this.world = new WalkWorld(b);
    for (const g of [this.drainsObj?.below, this.drainsObj?.surface]) {
      if (!g) continue;
      this.scene.remove(g);
      disposeObject(g);
    }
    this.drainsObj = b.drains ? buildDrains(b.drains) : null;
    if (this.drainsObj) {
      this.drainsObj.below.visible = this.underground;
      this.scene.add(this.drainsObj.below, this.drainsObj.surface);
    }
    this.placeSun();
    if (buildingBounds(b) && !this.framed) {
      this.frame();
      this.framed = true;
    }
  }

  /**
   * Point the sun and fit its shadow camera tightly round everything that casts or catches
   * a shadow (house, trees, patios, plus a margin of garden), seen from the sun.
   */
  private placeSun() {
    const b = this.building;
    const obj = this.shadowObj ?? this.planObj;
    if (!b || !obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    box.min.y = 0;
    box.expandByVector(new THREE.Vector3(4, 0, 4));
    const centre = box.getCenter(new THREE.Vector3());

    let dir: THREE.Vector3;
    let up = 1;
    if (this.sunStudy) {
      const site = siteOf(b);
      const pos = sunPosition(this.sunTime, site.latitude, site.longitude);
      const d = sunDirection(pos, site.north);
      dir = new THREE.Vector3(d.x, d.z, d.y);
      // Fade out through sunset; a low sun is warmer.
      up = THREE.MathUtils.smoothstep(Math.sin(pos.elevation), -0.01, 0.08);
      const warm = THREE.MathUtils.smoothstep(Math.sin(pos.elevation), 0, 0.35);
      this.sun.color.setRGB(1, 0.72 + 0.28 * warm, 0.5 + 0.5 * warm);
      this.sun.intensity = 2.8 * up;
      this.hemi.intensity = 0.35 + 0.75 * up;
      this.ambient.intensity = 0.25 + 0.3 * up;
    } else {
      dir = new THREE.Vector3(0.8, 1.6, 0.5).normalize();
      this.sun.color.setRGB(1, 1, 1);
      this.sun.intensity = 2.2;
      this.hemi.intensity = 1.4;
      this.ambient.intensity = 0.9;
    }
    const sky = new THREE.Color(0x1d2940).lerp(new THREE.Color(0xcfe3f3), up);
    (this.scene.background as THREE.Color).copy(sky);
    this.scene.fog!.color.copy(sky);
    this.sun.castShadow = up > 0.01;

    const size = box.getSize(new THREE.Vector3()).length();
    const at = centre.clone().addScaledVector(dir.normalize(), size);
    this.sun.position.copy(at);
    this.sun.target.position.copy(centre);
    this.sun.target.updateMatrixWorld();
    // The box's corners in the sun's view give the shadow camera's extent.
    const view = new THREE.Matrix4().lookAt(at, centre, new THREE.Vector3(0, 1, 0)).setPosition(at).invert();
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      c.applyMatrix4(view);
      lo.min(c);
      hi.max(c);
    }
    const cam = this.sun.shadow.camera;
    cam.left = lo.x;
    cam.right = hi.x;
    cam.bottom = lo.y;
    cam.top = hi.y;
    cam.near = Math.max(0.1, -hi.z - 1);
    cam.far = -lo.z + 1;
    cam.updateProjectionMatrix();
  }

  /** The 3D view as it is now, as a PNG data URL. */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** Orbit camera looking at the whole plan. */
  frame() {
    const b = this.building && buildingBounds(this.building);
    if (!b) return;
    const cx = (b.min.x + b.max.x) / 2;
    const cy = (b.min.y + b.max.y) / 2;
    const r = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 4);
    this.orbit.target.set(cx, this.floorY + 0.8, cy);
    this.camera.position.set(cx + r * 0.7, this.floorY + r * 0.9, cy + r * 1.1);
    this.camera.lookAt(this.orbit.target);
  }

  setMode(mode: ViewMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.keys.clear();
    if (mode === 'walk') {
      this.orbit.enabled = false;
      this.placeWalker();
    } else {
      if (this.look.isLocked) this.look.unlock();
      this.orbit.enabled = true;
      this.frame();
    }
    // Walking shows every floor; orbiting may cut away the floors above.
    this.rebuild();
    this.onModeChange?.(mode);
  }

  /** Start walking in the middle of the biggest room, facing its longest direction. */
  private placeWalker() {
    const rooms = this.plan ? detectRooms(this.plan) : [];
    rooms.sort((a, b) => b.area - a.area);
    const b = this.plan && planBounds(this.plan);
    let start = rooms[0]?.centroid ?? (b ? { x: (b.min.x + b.max.x) / 2, y: b.max.y + 3 } : { x: 0, y: 0 });
    // Not inside the piano (or anything else) standing in the middle of the room.
    if (this.world) start = this.world.clearSpot(start, this.floorY);
    this.foot = this.world ? this.world.groundAt(start, this.floorY) : this.floorY;
    this.eyeY = this.foot + EYE;
    this.walkLevelId = this.activeId;
    this.camera.position.set(start.x, this.eyeY, start.y);
    this.yaw = rooms[0] ? 0 : Math.PI;
    this.pitch = 0;
    this.applyYawPitch();
  }

  private applyYawPitch() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private onPointerDown(e: PointerEvent) {
    this.isTouch = e.pointerType !== 'mouse';
    if (this.mode !== 'walk' || e.pointerType === 'mouse') return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    if (leftHalf && !this.touchMove) this.touchMove = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    else if (!this.touchLook) this.touchLook = { id: e.pointerId, x: e.clientX, y: e.clientY };
    // Keep the camera's current orientation as the starting point.
    const eul = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = eul.y;
    this.pitch = eul.x;
  }

  private onPointerMove(e: PointerEvent) {
    if (this.touchMove?.id === e.pointerId) {
      this.touchMove.dx = e.clientX - this.touchMove.x;
      this.touchMove.dy = e.clientY - this.touchMove.y;
    } else if (this.touchLook?.id === e.pointerId) {
      this.yaw -= (e.clientX - this.touchLook.x) * 0.005;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.touchLook.y) * 0.005, -1.4, 1.4);
      this.touchLook.x = e.clientX;
      this.touchLook.y = e.clientY;
      this.applyYawPitch();
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (this.touchMove?.id === e.pointerId) this.touchMove = null;
    if (this.touchLook?.id === e.pointerId) this.touchLook = null;
  }

  /** While an orbit movie is being made: where the camera is on its circle. */
  private flight: { centre: THREE.Vector3; radius: number; height: number; start: number; seconds: number } | null = null;

  /**
   * Make a movie of the camera circling the whole house once, from about 30 degrees up,
   * in the current light. Low resolution (640 x 360) so the file is small enough to send.
   * Resolves with the video, and its file extension (mp4 where the browser can, else webm).
   */
  async recordOrbit(seconds = 12, onProgress?: (f: number) => void): Promise<{ blob: Blob; ext: string }> {
    const canvas = this.renderer.domElement;
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
    if (!type || !canvas.captureStream) throw new Error('This browser cannot record video from the page.');
    // The whole house, from outside.
    const wasMode = this.mode;
    const wasCutaway = this.cutaway;
    if (wasMode === 'walk') this.setMode('orbit');
    if (wasCutaway) this.setCutaway(false);
    const box = new THREE.Box3().setFromObject(this.planObj!);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const fitRadius = Math.max(size.x, size.z, size.y * 1.6) / 2;
    const distance = (fitRadius / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 0.9;
    const up = THREE.MathUtils.degToRad(30);
    const saved = { pos: this.camera.position.clone(), target: this.orbit.target.clone() };
    // Record at a small size, whatever the window is.
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(640, 360, false);
    this.camera.aspect = 640 / 360;
    this.camera.updateProjectionMatrix();
    this.orbit.enabled = false;
    this.flight = { centre, radius: distance * Math.cos(up), height: distance * Math.sin(up), start: performance.now(), seconds };
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_500_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((ok) => (recorder.onstop = () => ok()));
    recorder.start(500);
    await new Promise<void>((ok) => {
      const step = () => {
        const f = (performance.now() - this.flight!.start) / (seconds * 1000);
        onProgress?.(Math.min(1, f));
        if (f >= 1) ok();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    recorder.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    // Put everything back as it was.
    this.flight = null;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.resize();
    this.camera.position.copy(saved.pos);
    this.orbit.target.copy(saved.target);
    this.orbit.enabled = this.mode === 'orbit';
    if (wasCutaway) this.setCutaway(true);
    if (wasMode === 'walk') this.setMode('walk');
    return { blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }

  private tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.flight) {
      const f = this.flight;
      const a = ((performance.now() - f.start) / (f.seconds * 1000)) * Math.PI * 2;
      this.camera.position.set(f.centre.x + Math.cos(a) * f.radius, f.centre.y + f.height, f.centre.z + Math.sin(a) * f.radius);
      this.camera.lookAt(f.centre);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.mode === 'orbit') this.orbit.update();
    else this.walk(dt);
    this.swingDoors(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** In walk mode, shut doors open as the walker comes within reach and close behind them. */
  private swingDoors(dt: number) {
    const p = this.camera.position;
    for (const d of this.doors) {
      const near =
        this.mode === 'walk' && Math.abs(this.foot - d.floor) < 1 && Math.hypot(p.x - d.x, p.z - d.y) < 1.5;
      const target = near ? d.open : 0;
      const r = d.pivot.rotation;
      if (Math.abs(r.y - target) > 1e-3) r.y += (target - r.y) * Math.min(1, dt * 5);
    }
  }

  private walk(dt: number) {
    let fwd = 0;
    let strafe = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyD')) strafe += 1;
    if (k.has('KeyA')) strafe -= 1;
    // Arrow keys turn when the mouse isn't captured.
    if (!this.look.isLocked) {
      const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
      if (turn) {
        const eul = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
        this.yaw = eul.y + turn * dt * 1.8;
        this.pitch = eul.x;
        this.applyYawPitch();
      }
    } else {
      if (k.has('ArrowLeft')) strafe -= 1;
      if (k.has('ArrowRight')) strafe += 1;
    }
    if (this.touchMove) {
      fwd += THREE.MathUtils.clamp(-this.touchMove.dy / 60, -1, 1);
      strafe += THREE.MathUtils.clamp(this.touchMove.dx / 60, -1, 1);
    }
    const speed = SPEED * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2 : 1);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const move = dir.multiplyScalar(fwd).add(right.multiplyScalar(strafe));
    if (move.lengthSq() > 1) move.normalize();
    move.multiplyScalar(speed * dt);

    if (this.world) {
      const res = this.world.move({ x: this.camera.position.x, y: this.camera.position.z }, this.foot, { x: move.x, y: move.z });
      this.foot = res.foot;
      // Ease the eye towards its new height so steps feel like steps, not jumps.
      this.eyeY += (this.foot + EYE - this.eyeY) * Math.min(1, dt * 10);
      this.camera.position.set(res.p.x, this.eyeY, res.p.y);
      // Only switch floors once the walker is actually standing on one (not mid-stair), so
      // pausing near the top step doesn't flick the plan back and forth.
      const lvl = this.world.levelStandingOn(this.foot);
      if (lvl && lvl !== this.walkLevelId) {
        this.walkLevelId = lvl;
        this.onWalkLevelChange?.(lvl);
      }
    }
  }

  private resize() {
    if (this.flight) return; // recording a movie at its own size
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function buildingBounds(b: Building) {
  let out: ReturnType<typeof planBounds> = null;
  for (const l of b.levels) {
    const pb = planBounds(l);
    if (!pb) continue;
    if (!out) out = pb;
    else {
      out.min.x = Math.min(out.min.x, pb.min.x);
      out.min.y = Math.min(out.min.y, pb.min.y);
      out.max.x = Math.max(out.max.x, pb.max.x);
      out.max.y = Math.max(out.max.y, pb.max.y);
    }
  }
  return out;
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
