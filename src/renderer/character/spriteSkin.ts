import type { AnimState, Mood } from "../../shared/types";
import { HEARTS_HTML, type Skin } from "./skin";

/** docs/sprite-guide.md 의 skin.json 형식 */
export interface SkinManifest {
  name: string;
  frameWidth: number;
  frameHeight: number;
  displaySize: number;
  animations: Record<string, { file: string; frames: number; fps: number; loop: boolean }>;
}

/** 스프라이트 스트립 기반 스킨. 없는 동작은 가이드의 대체 규칙으로 idle 등을 대신 쓴다 */
export class SpriteSkin implements Skin {
  readonly width: number;
  readonly height: number;
  private host: HTMLElement | null = null;
  private sprite: HTMLElement | null = null;
  private current = "";
  private frame = 0;
  private timer = 0;
  private mood: Mood = "normal";
  private state: AnimState = "idle";
  private variant: string | undefined;

  constructor(
    private readonly manifest: SkinManifest,
    /** 파일명 → 번들된 이미지 URL */
    private readonly urls: Record<string, string>,
  ) {
    this.width = manifest.displaySize;
    this.height = Math.round((manifest.displaySize * manifest.frameHeight) / manifest.frameWidth);
  }

  mount(host: HTMLElement): void {
    const wrap = document.createElement("div");
    wrap.className = "character-skin";
    const sprite = document.createElement("div");
    // chii-body 클래스를 달아 기존 CSS의 몸통 모션(걷기 바운스, 들림, 착지 찌그러짐 등)을 그대로 받는다
    sprite.className = "sprite chii-body";
    wrap.append(sprite);
    wrap.insertAdjacentHTML("beforeend", HEARTS_HTML);
    host.replaceChildren(wrap);
    this.host = host;
    this.sprite = sprite;
    this.play("idle");
  }

  setState(state: AnimState, variant?: string): void {
    if (!this.host) return;
    this.state = state;
    this.variant = variant;
    this.host.dataset.anim = state;
    if (variant === undefined) delete this.host.dataset.variant;
    else this.host.dataset.variant = variant;
    this.play(this.resolve());
  }

  setMood(mood: Mood): void {
    this.mood = mood;
    if (this.host) {
      this.host.dataset.mood = mood;
      this.play(this.resolve());
    }
  }

  /** 상태·변형·기분을 실제 존재하는 애니메이션 이름으로 */
  private resolve(): string {
    const anims = this.manifest.animations;
    const has = (key: string): boolean => key in anims;
    const base = this.state === "react" && this.variant ? `react-${this.variant}` : this.state;
    const candidates = [base];
    if (this.state === "react") {
      candidates.push(...Object.keys(anims).filter((k) => k.startsWith("react-")));
    }
    candidates.push("idle");
    const found = candidates.find(has) ?? "idle";
    if (this.mood === "hungry" && has(`${found}-hungry`)) return `${found}-hungry`;
    return found;
  }

  private play(name: string): void {
    if (!this.sprite || name === this.current) return;
    const anim = this.manifest.animations[name];
    if (!anim) return;
    this.current = name;
    this.frame = 0;
    window.clearInterval(this.timer);
    const { frameWidth, frameHeight } = this.manifest;
    const scale = this.width / frameWidth;
    const el = this.sprite;
    el.style.width = `${this.width}px`;
    el.style.height = `${frameHeight * scale}px`;
    el.style.backgroundImage = `url("${this.urls[anim.file] ?? ""}")`;
    el.style.backgroundSize = `${frameWidth * scale * anim.frames}px ${frameHeight * scale}px`;
    const draw = (): void => {
      el.style.backgroundPosition = `${-this.frame * frameWidth * scale}px 0`;
    };
    draw();
    if (anim.frames <= 1) return;
    this.timer = window.setInterval(() => {
      if (this.frame + 1 >= anim.frames) {
        if (!anim.loop) {
          window.clearInterval(this.timer);
          return;
        }
        this.frame = 0;
      } else {
        this.frame += 1;
      }
      draw();
    }, 1000 / anim.fps);
  }
}
