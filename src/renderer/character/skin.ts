import type { AnimState, Mood } from "../../shared/types";

/** 캐릭터 그리기 담당. 나중에 스프라이트 시트 스킨으로 교체할 수 있도록 분리 */
export interface Skin {
  readonly width: number;
  readonly height: number;
  mount(host: HTMLElement): void;
  /** variant: react 상태의 반응 종류 등 같은 상태 안의 변형 */
  setState(state: AnimState, variant?: string): void;
  setMood(mood: Mood): void;
}

const PLACEHOLDER_SVG = `
<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <g class="chii-body">
    <ellipse class="chii-foot chii-foot-l" cx="29" cy="74" rx="9" ry="4.5" fill="#e8a870" />
    <ellipse class="chii-foot chii-foot-r" cx="51" cy="74" rx="9" ry="4.5" fill="#e8a870" />
    <path d="M40 10 C62 10 72 30 70 48 C68 66 56 73 40 73 C24 73 12 66 10 48 C8 30 18 10 40 10 Z"
      fill="#ffd27f" stroke="#c98a3a" stroke-width="2" />
    <path d="M42 11 C44 4 50 2 56 5" fill="none" stroke="#c98a3a" stroke-width="2.4" stroke-linecap="round" />
    <ellipse class="chii-blush" cx="23" cy="50" rx="5" ry="3" fill="#ff9aa2" opacity="0.7" />
    <ellipse class="chii-blush" cx="57" cy="50" rx="5" ry="3" fill="#ff9aa2" opacity="0.7" />
    <g class="chii-eye">
      <ellipse cx="30" cy="40" rx="3.6" ry="5" fill="#3a2a1a" />
      <circle cx="31.4" cy="38" r="1.3" fill="#fff" />
    </g>
    <g class="chii-eye">
      <ellipse cx="50" cy="40" rx="3.6" ry="5" fill="#3a2a1a" />
      <circle cx="51.4" cy="38" r="1.3" fill="#fff" />
    </g>
    <path class="chii-mouth chii-mouth-smile" d="M36 52 Q40 56 44 52" fill="none" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round" />
    <path class="chii-mouth chii-mouth-sad" d="M36 55 Q40 51 44 55" fill="none" stroke="#8a5a2b" stroke-width="2" stroke-linecap="round" />
  </g>
</svg>`;

/** 쓰다듬기 하트. 스킨 종류와 무관하게 CSS로 그린다 */
export const HEARTS_HTML = `<div class="chii-hearts"><span></span><span></span><span></span></div>`;

export class PlaceholderSkin implements Skin {
  readonly width = 80;
  readonly height = 80;
  private host: HTMLElement | null = null;

  mount(host: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "character-skin";
    wrap.innerHTML = PLACEHOLDER_SVG + HEARTS_HTML;
    host.replaceChildren(wrap);
    this.host = host;
  }

  setState(state: AnimState, variant?: string): void {
    if (!this.host) return;
    this.host.dataset.anim = state;
    if (variant === undefined) delete this.host.dataset.variant;
    else this.host.dataset.variant = variant;
  }

  setMood(mood: Mood): void {
    if (this.host) this.host.dataset.mood = mood;
  }
}
