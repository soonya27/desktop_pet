import type { Point } from "../../shared/ipc";

/** 캐릭터 위 포인터 입력을 탭 / 길게 누르기 / 드래그로 구분한다 */
export interface GestureHandlers {
  /** 버튼을 누른 순간 (모든 제스처 공통) */
  onPress(): void;
  /** 버튼을 뗀 순간 (모든 제스처 공통, 아래 핸들러들보다 먼저) */
  onRelease(): void;
  onTap(): void;
  /** 움직이지 않고 HOLD_MS 이상 누르고 있음 (쓰다듬기) */
  onHoldStart(): void;
  onHoldEnd(): void;
  onDragStart(p: Point): void;
  onDragMove(p: Point): void;
  onDragEnd(): void;
}

const DRAG_THRESHOLD_PX = 4;
const HOLD_MS = 400;

export function attachGestures(el: HTMLElement, handlers: GestureHandlers): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let holding = false;
  let holdTimer = 0;

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || pointerId !== null) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    holding = false;
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
    handlers.onPress();
    holdTimer = window.setTimeout(() => {
      if (pointerId === null || dragging) return;
      holding = true;
      handlers.onHoldStart();
    }, HOLD_MS);
  });

  el.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    const p: Point = { x: e.clientX, y: e.clientY };
    if (!dragging) {
      if (Math.hypot(p.x - startX, p.y - startY) < DRAG_THRESHOLD_PX) return;
      window.clearTimeout(holdTimer);
      if (holding) {
        holding = false;
        handlers.onHoldEnd();
      }
      dragging = true;
      handlers.onDragStart({ x: startX, y: startY });
    }
    handlers.onDragMove(p);
  });

  const finish = (e: PointerEvent, cancelled: boolean): void => {
    if (e.pointerId !== pointerId) return;
    window.clearTimeout(holdTimer);
    pointerId = null;
    handlers.onRelease();
    if (dragging) handlers.onDragEnd();
    else if (holding) handlers.onHoldEnd();
    else if (!cancelled) handlers.onTap();
    dragging = false;
    holding = false;
  };

  el.addEventListener("pointerup", (e) => finish(e, false));
  el.addEventListener("pointercancel", (e) => finish(e, true));
}
