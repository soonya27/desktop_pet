const AUTO_CLOSE_MS = 20_000;
const SNOOZE_MIN = 5;
const EDGE_MARGIN = 8;
const GAP_ABOVE_CHARACTER = 14;

export type BubbleDone = (snoozeMin?: number) => void;

export class Bubble {
  private onDone: BubbleDone | null = null;
  private autoCloseTimer = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly textEl: HTMLElement,
    private readonly actionsEl: HTMLElement,
    okBtn: HTMLButtonElement,
    snoozeBtn: HTMLButtonElement,
  ) {
    okBtn.addEventListener("click", () => this.finish(undefined));
    snoozeBtn.addEventListener("click", () => this.finish(SNOOZE_MIN));
  }

  isOpen(): boolean {
    return !this.el.hidden;
  }

  show(message: string, anchor: DOMRect, onDone: BubbleDone): void {
    if (this.isOpen()) this.finish(undefined);
    this.onDone = onDone;
    this.textEl.textContent = message;
    this.actionsEl.hidden = false;
    this.el.hidden = false;
    this.position(anchor);
    this.autoCloseTimer = window.setTimeout(() => this.finish(undefined), AUTO_CLOSE_MS);
  }

  /** 버튼 없는 짧은 말풍선 (배고파 등). 알림 말풍선이 떠 있으면 건너뛴다 */
  showHint(message: string, anchor: DOMRect, durationMs: number): void {
    if (this.isOpen()) return;
    this.textEl.textContent = message;
    this.actionsEl.hidden = true;
    this.el.hidden = false;
    this.position(anchor);
    this.autoCloseTimer = window.setTimeout(() => this.finish(undefined), durationMs);
  }

  dismiss(): void {
    if (this.isOpen()) this.finish(undefined);
  }

  /** 캐릭터 위에 띄우되, 위에 자리가 없으면(천장) 아래에 띄운다 */
  private position(anchor: DOMRect): void {
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    const center = anchor.left + anchor.width / 2;
    const maxLeft = window.innerWidth - width - EDGE_MARGIN;
    const left = Math.min(maxLeft, Math.max(EDGE_MARGIN, center - width / 2));
    const above = anchor.top - GAP_ABOVE_CHARACTER - height >= EDGE_MARGIN;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${above ? anchor.top - GAP_ABOVE_CHARACTER - height : anchor.bottom + GAP_ABOVE_CHARACTER}px`;
    this.el.classList.toggle("is-below", !above);
    this.el.style.setProperty("--tail-x", `${center - left}px`);
  }

  private finish(snoozeMin: number | undefined): void {
    window.clearTimeout(this.autoCloseTimer);
    this.el.hidden = true;
    const done = this.onDone;
    this.onDone = null;
    done?.(snoozeMin);
  }
}
