import type { CharacterTakeoverPayload, Point } from "../../shared/ipc";
import { REACT_VARIANTS, type AnimState, type Mood, type ReactVariant } from "../../shared/types";
import type { Skin } from "./skin";

const WALK_SPEED = 32; // px/s — 천천히 걸어 다닌다
const IDLE_MS: [number, number] = [2_000, 6_000];
const WALK_DISTANCE: [number, number] = [150, 600];
/** 깨어 있다가 잠들기까지 (4~5분) */
const AWAKE_MS: [number, number] = [4 * 60_000, 5 * 60_000];
/** 걷다가 잠깐 앉아 쉬기: 확률과 시간 (5~15초) */
const SIT_CHANCE = 0.35;
const SIT_MS: [number, number] = [5_000, 15_000];
/** 한 번 잠드는 시간 (1~3분). 지나면 스스로 깬다 */
const SLEEP_MS: [number, number] = [60_000, 180_000];
const GRAVITY = 2_600; // px/s²
const MAX_FALL_SPEED = 1_800;
const LAND_MS = 350;
const REACT_MS = 800;
const FORCED_REST_MS = 10 * 60_000;
export const EAT_MS = 4_000;
/** 회전 보간 속도. 모서리를 돌 때와 착지할 때 몸이 부드럽게 돌아간다 */
const ROT_SPEED = 720; // deg/s
/** 놓을 때 벽·천장에 붙는 최대 거리. 바닥이 이보다 가까우면 항상 바닥 */
const WALL_SNAP_PX = 60;
const FLOOR_PRIORITY_PX = 160;

type Edge = "floor" | "right" | "ceiling" | "left";

interface Pose {
  /** 발 위치 (화면 좌표) */
  x: number;
  y: number;
  /** CSS rotate 각도. 0=바닥, -90=오른쪽 벽, -180=천장, -270=왼쪽 벽 */
  rot: number;
}

interface Segment {
  start: number;
  length: number;
  edge: Edge | null;
  locate(t: number): Pose;
}

function randomBetween([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mod(value: number, n: number): number {
  return ((value % n) + n) % n;
}

/** 두 각도의 최단 차이 (-180, 180] */
function angleDelta(from: number, to: number): number {
  return mod(to - from + 180, 360) - 180;
}

/** 모니터 테두리를 따라 도는 경로. 직선 구간은 캐릭터 반폭만큼 안쪽에서 끝나고,
 *  모서리는 그 모서리를 중심으로 하는 원호라 몸이 항상 화면 안쪽을 향한다 */
function buildPath(w: number, width: number, height: number): Segment[] {
  const m = w / 2;
  const arc = (m * Math.PI) / 2;
  const quarter = (t: number): number => (t / arc) * (Math.PI / 2);
  const defs: Array<Omit<Segment, "start">> = [
    { length: width - 2 * m, edge: "floor", locate: (t) => ({ x: m + t, y: height, rot: 0 }) },
    {
      length: arc,
      edge: null,
      locate: (t) => {
        const a = quarter(t);
        return { x: width - m * Math.cos(a), y: height - m * Math.sin(a), rot: -90 * (t / arc) };
      },
    },
    {
      length: height - 2 * m,
      edge: "right",
      locate: (t) => ({ x: width, y: height - m - t, rot: -90 }),
    },
    {
      length: arc,
      edge: null,
      locate: (t) => {
        const a = quarter(t);
        return { x: width - m * Math.sin(a), y: m * Math.cos(a), rot: -90 - 90 * (t / arc) };
      },
    },
    {
      length: width - 2 * m,
      edge: "ceiling",
      locate: (t) => ({ x: width - m - t, y: 0, rot: -180 }),
    },
    {
      length: arc,
      edge: null,
      locate: (t) => {
        const a = quarter(t);
        return { x: m * Math.cos(a), y: m * Math.sin(a), rot: -180 - 90 * (t / arc) };
      },
    },
    { length: height - 2 * m, edge: "left", locate: (t) => ({ x: 0, y: m + t, rot: -270 }) },
    {
      length: arc,
      edge: null,
      locate: (t) => {
        const a = quarter(t);
        return { x: m * Math.sin(a), y: height - m * Math.cos(a), rot: -270 - 90 * (t / arc) };
      },
    },
  ];
  let start = 0;
  return defs.map((d) => {
    const seg = { ...d, start, length: Math.max(0, d.length) };
    start += seg.length;
    return seg;
  });
}

export interface Feet extends Pose {
  dir: 1 | -1;
}

export class Character {
  private state: AnimState = "idle";
  /** 이 창이 캐릭터를 표시 중인지 (멀티 모니터에서는 한 창만 true) */
  private active = false;
  private paused = false;
  /** 테두리 경로 위의 위치 (둘레 좌표) */
  private s = 0;
  private path: Segment[] = [];
  private perimeter = 0;
  /** held/fall 중의 자유 위치 (발 기준) */
  private fx = 0;
  private fy = 0;
  private v = 0;
  private fallEdge: Edge = "floor";
  /** 화면에 그리는 회전과 목표 회전 */
  private rot = 0;
  private targetRot = 0;
  private dir: 1 | -1 = 1;
  private walkRemaining = 0;
  private restOnArrive = false;
  /** 마지막으로 깬 시각과 이번에 깨어 있을 시간 */
  private awakeSince = 0;
  private awakeFor = 0;
  private stateUntil = 0;
  private talking = false;
  private variant: ReactVariant | undefined = undefined;
  private grabOffsetX = 0;
  private grabOffsetY = 0;
  private lastFrame = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly skin: Skin,
  ) {}

  /** 마운트만 하고 숨겨 둔다. 메인이 takeOver()로 켜 준다 */
  start(): void {
    this.skin.mount(this.el);
    this.el.style.width = `${this.skin.width}px`;
    this.el.style.height = `${this.skin.height}px`;
    this.el.hidden = true;
    this.rebuildPath();
    window.addEventListener("resize", () => {
      this.rebuildPath();
      this.s = mod(this.s, this.perimeter);
      this.clampFree();
      this.render();
    });
    requestAnimationFrame(this.loop);
  }

  isActive(): boolean {
    return this.active;
  }

  isSleeping(): boolean {
    return this.state === "rest";
  }

  /** 우클릭 메뉴가 떠 있는 동안 멈춤 */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** 이 창에 캐릭터를 표시한다. 드래그 중 넘어온 경우 held 상태로 이어받는다 */
  takeOver(payload: CharacterTakeoverPayload): void {
    this.active = true;
    this.el.hidden = false;
    if (payload.held) {
      this.grabOffsetX = payload.grabOffset.x;
      this.grabOffsetY = payload.grabOffset.y;
      this.enter("held");
      this.moveTo(payload.pointer);
    } else {
      const floor = this.path[0];
      this.s = floor ? Math.random() * floor.length : 0;
      this.rot = 0;
      this.wakeUp();
      this.enter("idle");
    }
    this.render();
  }

  /** 캐릭터가 다른 창으로 넘어갔다. 숨기고 상태를 초기화한다 */
  release(): void {
    this.active = false;
    this.el.hidden = true;
    this.talking = false;
    this.paused = false;
    this.enter("idle");
  }

  /** 알림 중에는 제자리에 멈추고 talk 모션 (들려 있거나 떨어지는 중이면 그 모션 유지) */
  setTalking(on: boolean): void {
    this.talking = on;
    this.syncSkin();
  }

  /** 화면상 바운딩 박스 (회전 포함). 말풍선 배치용 */
  anchor(): DOMRect {
    return this.el.getBoundingClientRect();
  }

  /** 발 위치·회전·방향. 밥그릇처럼 캐릭터 발치에 붙는 것 배치용 */
  feet(): Feet {
    const pose = this.isFree() ? { x: this.fx, y: this.fy, rot: this.rot } : this.locate(this.s);
    return { ...pose, rot: this.rot, dir: this.dir };
  }

  grabOffset(): Point {
    return { x: this.grabOffsetX, y: this.grabOffsetY };
  }

  /** 들어 올리기: 잡은 지점과 발의 거리를 기억해 커서를 따라가게 한다 */
  pickUp(p: Point): void {
    const pose = this.locate(this.s);
    // 들어 올리면 바로 세운다. 벽에 있던 경우 발 위치를 세운 자세 기준으로 다시 잡는다
    this.fx = pose.x;
    this.fy = pose.y;
    this.rot = this.targetRot = 0;
    this.clampFree();
    this.grabOffsetX = p.x - this.fx;
    this.grabOffsetY = p.y - this.fy;
    this.enter("held");
  }

  moveTo(p: Point): void {
    if (this.state !== "held") return;
    this.fx = p.x - this.grabOffsetX;
    this.fy = p.y - this.grabOffsetY;
    this.clampFree();
  }

  /** 놓으면 기본은 바닥으로 떨어진다. 바닥에서 멀고 벽·천장에 바짝 붙어 있을 때만 그쪽에 붙는다 */
  drop(): void {
    if (this.state !== "held") return;
    const m = this.skin.width / 2;
    const h = this.skin.height;
    const floorDist = window.innerHeight - this.fy;
    const others: Array<[Edge, number]> = [
      ["right", window.innerWidth - (this.fx + m)],
      ["ceiling", this.fy - h],
      ["left", this.fx - m],
    ];
    others.sort((a, b) => a[1] - b[1]);
    const nearest = others[0];
    this.fallEdge =
      floorDist > FLOOR_PRIORITY_PX && nearest && nearest[1] <= WALL_SNAP_PX ? nearest[0] : "floor";
    this.targetRot = { floor: 0, right: -90, ceiling: -180, left: -270 }[this.fallEdge];
    this.v = 0;
    this.enter("fall");
  }

  /** 탭: 랜덤 반응 한 번. 들려 있거나 떨어지는 중이면 무시 */
  react(): void {
    if (this.isFree()) return;
    const variant = REACT_VARIANTS[Math.floor(Math.random() * REACT_VARIANTS.length)];
    this.enter("react", variant);
  }

  /** 길게 누르기: 손을 뗄 때까지 쓰다듬기 */
  startPet(): void {
    if (this.isFree()) return;
    this.enter("pet");
  }

  stopPet(): void {
    if (this.state === "pet") this.enter("idle");
  }

  setMood(mood: Mood): void {
    this.skin.setMood(mood);
  }

  /** 밥 먹기. 시작했으면 true (밥그릇 표시는 호출자가) */
  eat(): boolean {
    if (this.isFree()) return false;
    this.enter("eat");
    this.stateUntil = performance.now() + EAT_MS;
    return true;
  }

  /** 메뉴의 잠자기/깨우기. 쉬는 중이면 깨우고, 아니면 제자리에서 한참 쉰다 */
  toggleSleep(): void {
    if (this.state === "rest") {
      this.wakeUp();
      this.enter("idle");
      return;
    }
    if (this.isFree()) return;
    this.enter("rest");
    this.stateUntil = performance.now() + FORCED_REST_MS;
  }

  private rebuildPath(): void {
    this.path = buildPath(this.skin.width, window.innerWidth, window.innerHeight);
    this.perimeter = this.path.reduce((sum, seg) => sum + seg.length, 0);
  }

  private locate(s: number): Pose {
    const wrapped = mod(s, this.perimeter);
    for (const seg of this.path) {
      if (wrapped < seg.start + seg.length) return seg.locate(wrapped - seg.start);
    }
    const last = this.path[this.path.length - 1];
    return last ? last.locate(last.length) : { x: 0, y: window.innerHeight, rot: 0 };
  }

  /** 착지한 테두리 위의 발 좌표를 둘레 좌표로 */
  private sOnEdge(edge: Edge, x: number, y: number): number {
    const m = this.skin.width / 2;
    const seg = this.path.find((p) => p.edge === edge);
    if (!seg) return 0;
    const t = {
      floor: x - m,
      right: window.innerHeight - m - y,
      ceiling: window.innerWidth - m - x,
      left: y - m,
    }[edge];
    return seg.start + clamp(t, 0, seg.length);
  }

  /** 세운 자세의 몸이 화면 안에 있도록 발 위치를 제한 */
  private clampFree(): void {
    const m = this.skin.width / 2;
    this.fx = clamp(this.fx, m, Math.max(m, window.innerWidth - m));
    this.fy = clamp(this.fy, this.skin.height, Math.max(this.skin.height, window.innerHeight));
  }

  /** 경로에서 벗어난 자유 위치 상태 */
  private isFree(): boolean {
    return this.state === "held" || this.state === "fall";
  }

  /** 입력·물리로 움직이는 상태. 알림(talk)보다 우선해 표시되고 갱신된다 */
  private isInteractive(): boolean {
    switch (this.state) {
      case "held":
      case "fall":
      case "land":
      case "react":
      case "pet":
      case "eat":
        return true;
      default:
        return false;
    }
  }

  private syncSkin(): void {
    if (this.talking && !this.isInteractive()) this.skin.setState("talk");
    else this.skin.setState(this.state, this.variant);
  }

  private enter(state: AnimState, variant?: ReactVariant): void {
    this.state = state;
    this.variant = variant;
    const now = performance.now();
    if (state === "idle") this.stateUntil = now + randomBetween(IDLE_MS);
    if (state === "rest") this.stateUntil = now + randomBetween(SLEEP_MS);
    if (state === "sit") this.stateUntil = now + randomBetween(SIT_MS);
    if (state === "land") this.stateUntil = now + LAND_MS;
    if (state === "react") this.stateUntil = now + REACT_MS;
    this.syncSkin();
  }

  /** 쉴 자리: 직선 구간의 양 끝(모서리 바로 앞) 중 가장 가까운 곳 */
  private nearestRestSpot(): number {
    let best = this.s;
    let bestDist = Infinity;
    for (const seg of this.path) {
      if (seg.edge === null) continue;
      for (const spot of [seg.start, seg.start + seg.length]) {
        const d = Math.abs(angleLike(this.s, spot, this.perimeter));
        if (d < bestDist) {
          bestDist = d;
          best = spot;
        }
      }
    }
    return best;
  }

  private wakeUp(): void {
    this.awakeSince = performance.now();
    this.awakeFor = randomBetween(AWAKE_MS);
  }

  private chooseNext(): void {
    let delta: number;
    if (performance.now() - this.awakeSince >= this.awakeFor) {
      // 잠들 시간: 가까운 구석으로 가서 잔다
      delta = angleLike(this.s, this.nearestRestSpot(), this.perimeter);
      this.restOnArrive = true;
    } else {
      delta = randomBetween(WALK_DISTANCE) * (Math.random() < 0.5 ? -1 : 1);
      this.restOnArrive = false;
    }
    if (Math.abs(delta) < 1) {
      this.enter(this.restOnArrive ? "rest" : "idle");
      return;
    }
    this.dir = delta >= 0 ? 1 : -1;
    this.walkRemaining = Math.abs(delta);
    this.enter("walk");
  }

  private update(dt: number, now: number): void {
    if (this.paused) return;
    if (this.talking && !this.isInteractive()) return;
    switch (this.state) {
      case "idle":
      case "sit":
        if (now >= this.stateUntil) this.chooseNext();
        break;
      case "rest":
        if (now >= this.stateUntil) {
          this.wakeUp();
          this.chooseNext();
        }
        break;
      case "walk": {
        const step = Math.min(WALK_SPEED * dt, this.walkRemaining);
        this.s = mod(this.s + this.dir * step, this.perimeter);
        this.walkRemaining -= step;
        if (this.walkRemaining <= 0) {
          if (this.restOnArrive) this.enter("rest");
          else this.enter(Math.random() < SIT_CHANCE ? "sit" : "idle");
        }
        break;
      }
      case "held":
        // 위치는 moveTo()가 갱신한다
        break;
      case "fall": {
        this.v = Math.min(this.v + GRAVITY * dt, MAX_FALL_SPEED);
        const d = this.v * dt;
        const W = window.innerWidth;
        const H = window.innerHeight;
        let landed = false;
        switch (this.fallEdge) {
          case "floor":
            this.fy += d;
            landed = this.fy >= H;
            if (landed) this.fy = H;
            break;
          case "right":
            this.fx += d;
            landed = this.fx >= W;
            if (landed) this.fx = W;
            break;
          case "ceiling":
            this.fy -= d;
            landed = this.fy <= 0;
            if (landed) this.fy = 0;
            break;
          case "left":
            this.fx -= d;
            landed = this.fx <= 0;
            if (landed) this.fx = 0;
            break;
        }
        if (landed) {
          this.s = this.sOnEdge(this.fallEdge, this.fx, this.fy);
          this.v = 0;
          this.enter("land");
        }
        break;
      }
      case "land":
      case "react":
        if (now >= this.stateUntil) this.enter("idle");
        break;
      case "eat":
        if (now >= this.stateUntil) this.enter("react", "happy");
        break;
      case "pet":
      case "talk":
        break;
    }
  }

  private render(dt = 0): void {
    const pose = this.isFree()
      ? { x: this.fx, y: this.fy, rot: this.targetRot }
      : this.locate(this.s);
    if (!this.isFree()) this.targetRot = pose.rot;
    const delta = angleDelta(this.rot, this.targetRot);
    const maxStep = ROT_SPEED * dt;
    this.rot = Math.abs(delta) <= maxStep ? this.targetRot : this.rot + Math.sign(delta) * maxStep;
    this.rot = mod(this.rot, 360);
    const w = this.skin.width;
    const h = this.skin.height;
    this.el.style.transform = `translate3d(${pose.x - w / 2}px, ${pose.y - h}px, 0) rotate(${this.rot}deg)`;
    this.el.style.setProperty("--dir", String(this.dir));
  }

  private readonly loop = (now: number): void => {
    const dt = this.lastFrame === 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.active) {
      this.update(dt, now);
      this.render(dt);
    }
    requestAnimationFrame(this.loop);
  };
}

/** 둘레 좌표에서 from→to 최단 부호 거리 (-P/2, P/2] */
function angleLike(from: number, to: number, perimeter: number): number {
  return mod(to - from + perimeter / 2, perimeter) - perimeter / 2;
}
