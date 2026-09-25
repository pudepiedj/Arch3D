import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { planBounds } from '../model/plan';
import { WalkWorld } from '../model/walk';
import { detectRooms } from '../model/rooms';
import { getLevel, levelElevation } from '../model/building';
import type { Building, Level } from '../model/types';
import { buildBuildingObject, createMaterials, disposeObject } from './build';

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
  cutaway = true;
  private keys = new Set<string>();
  private clock = new THREE.Clock();
  private framed = false;
  mode: ViewMode = 'orbit';
  onModeChange?: (m: ViewMode) => void;
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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xcfe3f3);
    this.scene.fog = new THREE.Fog(0xcfe3f3, 60, 180);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2a6, 1.4));
    // Fill light so ceilings and rooms away from windows are not gloomy.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(200, 64),
      new THREE.MeshStandardMaterial({ color: 0x9fb98f, roughness: 1 }),
    );
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

  private rebuild() {
    const b = this.building;
    if (!b) return;
    if (this.planObj) {
      this.scene.remove(this.planObj);
      disposeObject(this.planObj);
    }
    const cut = this.mode === 'orbit' && this.cutaway ? this.activeId : undefined;
    this.planObj = buildBuildingObject(b, this.mats, cut);
    this.scene.add(this.planObj);
    this.world = new WalkWorld(b);

    const bounds = buildingBounds(b);
    if (bounds) {
      const cx = (bounds.min.x + bounds.max.x) / 2;
      const cy = (bounds.min.y + bounds.max.y) / 2;
      const top = b.levels.reduce((z, l) => z + l.height, 0);
      const r = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, top) / 2 + 4;
      this.sun.position.set(cx + r * 0.8, r * 1.6, cy + r * 0.5);
      this.sun.target.position.set(cx, 0, cy);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -r * 1.3;
      cam.right = cam.top = r * 1.3;
      cam.near = 0.5;
      cam.far = r * 5;
      cam.updateProjectionMatrix();
      if (!this.framed) {
        this.frame();
        this.framed = true;
      }
    }
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
    const start = rooms[0]?.centroid ?? (b ? { x: (b.min.x + b.max.x) / 2, y: b.max.y + 3 } : { x: 0, y: 0 });
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

  private tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.mode === 'orbit') this.orbit.update();
    else this.walk(dt);
    this.renderer.render(this.scene, this.camera);
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
      const lvl = this.world.levelAt(this.foot);
      if (lvl && lvl !== this.walkLevelId) {
        this.walkLevelId = lvl;
        this.onWalkLevelChange?.(lvl);
      }
    }
  }

  private resize() {
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
