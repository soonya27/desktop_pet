/**
 * 기본은 클릭 통과(ignore). 커서가 캐릭터/말풍선 위에 있을 때만 창이 포인터를 받도록 토글한다.
 * 캐릭터가 멈춰 있는 커서 밑으로 지나갈 수도 있으므로 주기적으로 다시 검사한다.
 * lock() 중(누르고 있는 동안)에는 커서 위치와 무관하게 포인터를 계속 받는다.
 */
const RECHECK_MS = 150;

export interface ClickThrough {
  lock(): void;
  unlock(): void;
}

export function setupClickThrough(interactive: readonly HTMLElement[]): ClickThrough {
  let ignoring = true;
  let locked = false;
  let lastX = -1;
  let lastY = -1;

  const apply = (ignore: boolean): void => {
    if (ignore === ignoring) return;
    ignoring = ignore;
    window.chii.setIgnoreMouse(ignore);
  };

  const isInteractiveAt = (x: number, y: number): boolean => {
    const target = document.elementFromPoint(x, y);
    return target !== null && interactive.some((el) => !el.hidden && el.contains(target));
  };

  const recheck = (): void => {
    if (locked) {
      apply(false);
      return;
    }
    if (lastX < 0) {
      apply(true);
      return;
    }
    apply(!isInteractiveAt(lastX, lastY));
  };

  document.addEventListener("pointermove", (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    recheck();
  });

  document.addEventListener("pointerleave", () => {
    lastX = -1;
    lastY = -1;
    recheck();
  });

  window.setInterval(recheck, RECHECK_MS);

  return {
    lock() {
      locked = true;
      recheck();
    },
    unlock() {
      locked = false;
      recheck();
    },
  };
}
