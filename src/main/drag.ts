import type { WebContents } from "electron";
import { IPC, type DragMovePayload, type DragStartPayload, type Point } from "../shared/ipc";
import type { Overlays } from "./overlays";

/**
 * 드래그 중 커서가 다른 디스플레이로 넘어가면 캐릭터 소유권을 그 창으로 옮긴다.
 * 포인터 이벤트는 드래그를 시작한 창(입력 창)이 계속 받으므로, 입력 창과 표시 창이 달라질 수 있다.
 */
export interface DragCoordinator {
  start(sender: WebContents, payload: DragStartPayload): void;
  move(sender: WebContents, payload: DragMovePayload): void;
  end(sender: WebContents): void;
}

export function createDragCoordinator(overlays: Overlays): DragCoordinator {
  let inputDisplayId: number | null = null;
  let grabOffset: Point = { x: 0, y: 0 };

  return {
    start(sender, payload) {
      inputDisplayId = overlays.displayIdOf(sender);
      grabOffset = payload.grabOffset;
    },
    move(sender, payload) {
      const inputId = overlays.displayIdOf(sender);
      if (inputId === null || inputId !== inputDisplayId) return;
      const screenPoint = overlays.toScreen(inputId, payload.pointer);
      const targetId = overlays.displayIdAt(screenPoint);
      const pointer = overlays.toLocal(targetId, screenPoint);
      if (targetId !== overlays.ownerDisplayId()) {
        overlays.setOwner(targetId, { held: true, pointer, grabOffset });
        return;
      }
      // 입력 창이 곧 표시 창이면 렌더러가 스스로 움직이므로 중계하지 않는다
      if (targetId !== inputId) overlays.send(targetId, IPC.characterDragMove, { pointer });
    },
    end(sender) {
      const inputId = overlays.displayIdOf(sender);
      if (inputId === null || inputId !== inputDisplayId) return;
      if (overlays.ownerDisplayId() !== inputId) overlays.sendToOwner(IPC.characterDrop);
      inputDisplayId = null;
    },
  };
}
