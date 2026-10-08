import type { ReminderKind } from "./types";

export const IPC = {
  setIgnoreMouse: "overlay:setIgnoreMouse",
  reminderShow: "reminder:show",
  reminderAck: "reminder:ack",
  // 렌더러(입력 창) → 메인: 드래그 좌표 중계
  dragStart: "drag:start",
  dragMove: "drag:move",
  dragEnd: "drag:end",
  // 메인 → 렌더러: 캐릭터 소유권 이동 (멀티 모니터)
  characterTakeover: "character:takeover",
  characterRelease: "character:release",
  characterDragMove: "character:dragMove",
  characterDrop: "character:drop",
  // 캐릭터 우클릭 메뉴
  characterContextMenu: "character:contextMenu",
  characterCommand: "character:command",
  // 배고픔 상태 (메인 → 캐릭터가 있는 창)
  petState: "pet:state",
} as const;

export interface Point {
  x: number;
  y: number;
}

export interface ReminderShowPayload {
  kind: ReminderKind;
  message: string;
}

export interface ReminderAckPayload {
  kind: ReminderKind;
  snoozeMin?: number;
}

/** pointer: 보낸 창 기준 로컬 좌표, grabOffset: 캐릭터 좌상단에서 잡은 지점까지의 거리 */
export interface DragStartPayload {
  pointer: Point;
  grabOffset: Point;
}

export interface DragMovePayload {
  pointer: Point;
}

export type CharacterTakeoverPayload =
  { held: false } | { held: true; pointer: Point; grabOffset: Point };

/** 메인의 컨텍스트 메뉴에서 캐릭터에게 내리는 명령 */
/** 우클릭 시 렌더러가 알려주는 현재 상태. 메뉴 라벨(잠자기/깨우기)에 쓴다 */
export interface ContextMenuRequest {
  sleeping: boolean;
}

export type CharacterCommand = { type: "toggleSleep" } | { type: "eat" } | { type: "resume" };

export interface PetStatePayload {
  /** 0~100 */
  hunger: number;
  hungry: boolean;
}

/** preload가 window.chii로 노출하는 API */
export interface ChiiApi {
  setIgnoreMouse(ignore: boolean): void;
  onReminderShow(listener: (payload: ReminderShowPayload) => void): void;
  ackReminder(payload: ReminderAckPayload): void;
  dragStart(payload: DragStartPayload): void;
  dragMove(payload: DragMovePayload): void;
  dragEnd(): void;
  onCharacterTakeover(listener: (payload: CharacterTakeoverPayload) => void): void;
  onCharacterRelease(listener: () => void): void;
  onCharacterDragMove(listener: (payload: DragMovePayload) => void): void;
  onCharacterDrop(listener: () => void): void;
  openCharacterMenu(request: ContextMenuRequest): void;
  onCharacterCommand(listener: (command: CharacterCommand) => void): void;
  onPetState(listener: (state: PetStatePayload) => void): void;
}
