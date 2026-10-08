import { app, powerMonitor } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { IPC, type PetStatePayload } from "../shared/ipc";
import type { Overlays } from "./overlays";
import { getSettings } from "./settings";

/**
 * 배고픔 수치(0~100). 활동 중일 때만 오르고(자리 비움 제외), 밥을 주면 0이 된다.
 * 설정에서 끄면 0으로 고정된다. WITHCHII_FAST=1 이면 분 단위가 초 단위로 줄어든다.
 */
const FAST = process.env.WITHCHII_FAST === "1";
const TICK_MS = FAST ? 1_000 : 15_000;
/** 수치 1이 오르는 데 걸리는 활동 시간 → 100까지 약 6.7시간 */
const STEP_MS = FAST ? 4_000 : 4 * 60_000;
const IDLE_THRESHOLD_S = 300;
const HUNGRY_AT = 60;
const MAX = 100;

export interface PetState {
  hunger(): number;
  feed(): void;
  /** 설정이 바뀌었을 때 즉시 반영 */
  refresh(): void;
}

function filePath(): string {
  return join(app.getPath("userData"), "state.json");
}

function load(): number {
  try {
    const raw = JSON.parse(readFileSync(filePath(), "utf8")) as { hunger?: unknown };
    if (typeof raw.hunger === "number") return Math.min(MAX, Math.max(0, raw.hunger));
  } catch {
    // 첫 실행이거나 파일이 깨진 경우
  }
  return 0;
}

function save(hunger: number): void {
  const path = filePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ hunger }));
}

export function createPetState(overlays: Overlays): PetState {
  let hunger = getSettings().hungerEnabled ? load() : 0;
  let elapsedMs = 0;

  function payload(): PetStatePayload {
    return { hunger, hungry: hunger >= HUNGRY_AT };
  }

  function push(): void {
    overlays.sendToOwner(IPC.petState, payload());
  }

  function set(next: number): void {
    const clamped = Math.min(MAX, Math.max(0, next));
    if (clamped === hunger) return;
    hunger = clamped;
    save(hunger);
  }

  function tick(): void {
    if (!getSettings().hungerEnabled) {
      set(0);
      elapsedMs = 0;
    } else if (powerMonitor.getSystemIdleTime() < IDLE_THRESHOLD_S) {
      elapsedMs += TICK_MS;
      if (elapsedMs >= STEP_MS) {
        set(hunger + Math.floor(elapsedMs / STEP_MS));
        elapsedMs %= STEP_MS;
      }
    }
    // 창이 바뀌어도(멀티 모니터) 최신 상태를 받도록 매 tick 보낸다
    push();
  }

  setInterval(tick, TICK_MS);

  return {
    hunger: () => hunger,
    feed() {
      set(0);
      elapsedMs = 0;
      push();
      overlays.sendToOwner(IPC.characterCommand, { type: "eat" });
    },
    refresh() {
      if (!getSettings().hungerEnabled) set(0);
      push();
    },
  };
}
