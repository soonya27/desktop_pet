"""Gemini 목업 시트 → 스프라이트 스트립 + skin.json
사용법: python3 -I scripts/extract-sprites.py src/renderer/assets/skins/chii/raw src/renderer/assets/skins/chii
(행 좌표는 아래 GEOMETRY 표에 수동 지정. 자세한 설명은 docs/sprite-guide.md)"""
import sys, json, statistics
from collections import deque
from PIL import Image, ImageFilter

raw_dir, out_dir = sys.argv[1], sys.argv[2]
FW, FH, BODY_H, FOOT_Y = 160, 200, 140, 196

# 파일 → 행 순서대로 애니메이션 이름 (None = 건너뜀). drop: 버릴 프레임 번호(1부터)
SHEETS = {
  "Gemini_Generated_Image_yxt6dzyxt6dzyxt6.png":      [("idle", {"n": 4}), ("walk", {"n": 6}), ("rest", {"n": 4})],
  "Gemini_Generated_Image_5fafkc5fafkc5faf.png":      [None, None, ("talk", {"n": 4})],
  "Gemini_Generated_Image_5fafkc5fafkc5faf (1).png":  [("held", {"n": 4})],
  "Gemini_Generated_Image_5fafkc5fafkc5faf (2).png":  [None, None, ("fall", {"n": 4, "drop": [1]})],
  "Gemini_Generated_Image_5fafkc5fafkc5faf (3).png":  [("land", {"n": 4})],
  "Gemini_Generated_Image_daje7mdaje7mdaje.png":      [("react-happy", {"n": 7}), ("react-surprised", {"n": 7}), ("react-dizzy", {"n": 7})],
  "Gemini_Generated_Image_daje7mdaje7mdaje (1).png":  [("pet", {"n": 4}), ("eat", {"n": 6})],
  "Gemini_Generated_Image_daje7mdaje7mdaje (2).png":  [("idle-hungry", {"n": 4}), ("walk-hungry", {"n": 6}), ("rest-hungry", {"n": 6})],
}
ANIM = {  # fps, loop
  "idle": (4, True), "walk": (10, True), "rest": (3, True), "talk": (6, True), "held": (6, True),
  "fall": (8, True), "land": (12, False), "react-happy": (10, False), "react-surprised": (10, False),
  "react-dizzy": (10, False), "pet": (5, True), "eat": (8, True),
  "idle-hungry": (4, True), "walk-hungry": (10, True), "rest-hungry": (3, True),
}

def cluster(vals, gap):
    groups = []
    for v in vals:
        if groups and v - groups[-1][-1] <= gap: groups[-1].append(v)
        else: groups.append([v])
    return groups

def detect(im):
    """체커보드의 회색 사각형을 팽창시켜 한 덩어리로 만든 뒤, 연결 영역의 바운딩 박스를 프레임 행으로 쓴다"""
    from collections import deque as _dq
    D = 3
    rgb = im.convert("RGB"); W, H = rgb.size
    small = rgb.resize((W // D, H // D), Image.BOX); sw, sh = small.size; sp = small.load()
    mask = Image.new("L", (sw, sh), 0); mp = mask.load()
    for y in range(sh):
        for x in range(sw):
            r, g, b = sp[x, y]
            if abs(r - g) < 14 and abs(g - b) < 14 and 170 < g < 232: mp[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(7)); mp = mask.load()
    seen = [[False] * sh for _ in range(sw)]
    boxes = []
    for y in range(sh):
        for x in range(sw):
            if mp[x, y] == 0 or seen[x][y]: continue
            q = _dq([(x, y)]); seen[x][y] = True
            x0 = x1 = x; y0 = y1 = y
            while q:
                cx, cy = q.popleft()
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for nx, ny in ((cx+1,cy),(cx-1,cy),(cx,cy+1),(cx,cy-1)):
                    if 0 <= nx < sw and 0 <= ny < sh and not seen[nx][ny] and mp[nx, ny]:
                        seen[nx][ny] = True; q.append((nx, ny))
            if (x1 - x0) * D > W * 0.25 and (y1 - y0) * D > 80:
                boxes.append((x0 * D, y0 * D, (x1 + 1) * D, (y1 + 1) * D))
    boxes.sort(key=lambda b: b[1])
    for b in boxes: print(f"  row box x={b[0]}..{b[2]} y={b[1]}..{b[3]}")
    return boxes

def make_is_bg(im):
    """프레임 가장자리 링(순수 체커보드)에서 어두운/밝은 사각형 색을 샘플링해 배경 판정 기준을 만든다.
    깨끗한 시트는 밝은 색이 (254,254,254)라 몸통(252,244,242)이 제외되고,
    배고픔 시트처럼 밝은 색이 크림색이면 몸통도 배경처럼 보이지만 닫힌 외곽선이 채우기를 막는다"""
    import statistics
    W, H = im.size; px = im.load(); R = 6
    ring = [px[x, y] for x in range(W) for y in list(range(R)) + list(range(H - R, H))] + \
           [px[x, y] for y in range(H) for x in list(range(R)) + list(range(W - R, W))]
    ring = [c[:3] for c in ring if max(c[:3]) >= 120]          # 테두리 선 조각 제외
    dark = [c for c in ring if max(c) < 230] or [(197, 197, 197)]
    bright = [c for c in ring if max(c) >= 230] or [(254, 254, 254)]
    dm = tuple(int(statistics.median(ch)) for ch in zip(*dark))
    bm = tuple(int(statistics.median(ch)) for ch in zip(*bright))
    def is_bg(p):
        r, g, b = p[:3]
        near_dark = all(abs(c - m) <= 40 for c, m in zip((r, g, b), dm))
        near_bright = all(abs(c - m) <= 9 for c, m in zip((r, g, b), bm))
        return near_dark or near_bright
    return is_bg, dm, bm

def key(im):
    """1) 테두리에서 시작하는 영역 채우기 (외곽선·바닥선이 막아 몸 안으로 안 들어감)
       2) 긴 직선(테두리·바닥선)은 양옆이 모두 배경인 곳만 지운다 → 발이 선 위에 있어도 틈이 생기지 않음
       3) 잉크도 색도 없는 떨어진 조각(체커보드 찌꺼기) 제거  4) 가장자리 정리"""
    im = im.convert("RGB"); W, H = im.size; px = im.load()
    is_bg, _dm, _bm = make_is_bg(im)
    bg = [[False] * H for _ in range(W)]; q = deque()
    def seed(x, y):
        if is_bg(px[x, y]) and not bg[x][y]: bg[x][y] = True; q.append((x, y))
    for x in range(W): seed(x, 0); seed(x, H - 1)
    for y in range(H): seed(0, y); seed(W - 1, y)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < W and 0 <= ny < H and not bg[nx][ny] and is_bg(px[nx, ny]):
                bg[nx][ny] = True; q.append((nx, ny))
    dark = lambda x, y: max(px[x, y]) < 150
    def both_bg(x, y, dx, dy):
        a, b = (x + dx * 3, y + dy * 3), (x - dx * 3, y - dy * 3)
        # 프레임 밖은 배경으로 간주 (테두리 선이 가장자리에 걸쳐 있는 경우)
        return all(not (0 <= px_ < W and 0 <= py_ < H) or bg[px_][py_] for px_, py_ in (a, b))
    # 가로 긴 선
    for y in range(H):
        run = 0
        for x in range(W + 1):
            if x < W and dark(x, y): run += 1
            else:
                if run >= 40:
                    for xx in range(x - run, x):
                        if both_bg(xx, y, 0, 1):
                            for yy in (y - 1, y, y + 1):
                                if 0 <= yy < H: bg[xx][yy] = True
                run = 0
    # 세로 긴 선
    for x in range(W):
        run = 0
        for y in range(H + 1):
            if y < H and dark(x, y): run += 1
            else:
                if run >= 40:
                    for yy in range(y - run, y):
                        if both_bg(x, yy, 1, 0):
                            for xx in (x - 1, x, x + 1):
                                if 0 <= xx < W: bg[xx][yy] = True
                run = 0
    # 선을 지우면서 새로 열린 영역(발 사이 등 갇혀 있던 체커)을 다시 채운다
    q = deque((x, y) for x in range(W) for y in range(H) if bg[x][y])
    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < W and 0 <= ny < H and not bg[nx][ny] and is_bg(px[nx, ny]):
                bg[nx][ny] = True; q.append((nx, ny))
    # 배경에 닿아 있는 체커색(밝고 무채색) 픽셀을 최대 3px 깎는다. 몸통은 어두운 외곽선이 막는다
    def checker_like(x, y):
        r, g, b_ = px[x, y]
        return max(r, g, b_) > 165 and max(r, g, b_) - min(r, g, b_) < 26
    for _ in range(3):
        fringe = []
        for x in range(W):
            for y in range(H):
                if bg[x][y] or not checker_like(x, y): continue
                if any(0 <= nx < W and 0 <= ny < H and bg[nx][ny] for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1))):
                    fringe.append((x, y))
        if not fringe: break
        for x, y in fringe: bg[x][y] = True
    # 떨어진 조각 정리
    seen = [[False] * H for _ in range(W)]
    for sx in range(W):
        for sy in range(H):
            if bg[sx][sy] or seen[sx][sy]: continue
            comp = [(sx, sy)]; seen[sx][sy] = True; qq = deque([(sx, sy)])
            while qq:
                x, y = qq.popleft()
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[nx][ny] and not bg[nx][ny]:
                        seen[nx][ny] = True; qq.append((nx, ny)); comp.append((nx, ny))
            has_ink = any(max(px[x, y]) < 120 for x, y in comp)
            has_color = any(max(px[x, y]) - min(px[x, y]) > 40 for x, y in comp)
            if len(comp) < 100 or not (has_ink or has_color):
                for x, y in comp: bg[x][y] = True
    mask = Image.new("L", (W, H), 255); mp = mask.load()
    EDGE, EDGE_BOTTOM = 6, 1   # 아래쪽은 발이 닿아 있으므로 테두리 선만
    for x in range(W):
        for y in range(H):
            if bg[x][y] or x < EDGE or y < EDGE or x >= W - EDGE or y >= H - EDGE_BOTTOM: mp[x, y] = 0
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    out = im.convert("RGBA"); out.putalpha(mask)
    return out

def main_body_height(im):
    """가장 큰 연결 덩어리(몸통)의 세로 길이. 별·zzz·움직임 선처럼 떨어진 요소는 제외된다"""
    W, H = im.size; px = im.load()
    seen = [[False] * H for _ in range(W)]; best = None
    for sx in range(W):
        for sy in range(H):
            if seen[sx][sy] or px[sx, sy][3] <= 128: continue
            comp = [(sx, sy)]; seen[sx][sy] = True; qq = deque([(sx, sy)])
            while qq:
                x, y = qq.popleft()
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[nx][ny] and px[nx, ny][3] > 128:
                        seen[nx][ny] = True; qq.append((nx, ny)); comp.append((nx, ny))
            if best is None or len(comp) > len(best): best = comp
    if not best: return None
    ys = [y for _, y in best]
    return max(ys) - min(ys) + 1

def body_center_x(im):
    bbox = im.getbbox()
    if not bbox: return im.width / 2
    x0, y0, x1, y1 = bbox
    lower = im.crop((0, y0 + int((y1 - y0) * 0.4), im.width, y1)).getbbox()
    return (lower[0] + lower[2]) / 2 if lower else (x0 + x1) / 2

manifest = {"name": "chii", "frameWidth": FW, "frameHeight": FH, "displaySize": 80, "animations": {}}
# 행 좌표 수동 지정: (이름, 프레임 수, x0, x1, y0, y1, 버릴 프레임)
GEOMETRY = {
  "Gemini_Generated_Image_yxt6dzyxt6dzyxt6.png":     [("idle", 4, 316, 1091, 71, 245, []), ("walk", 6, 117, 1302, 306, 492, []), ("rest", 4, 281, 1126, 542, 727, [])],
  "Gemini_Generated_Image_5fafkc5fafkc5faf.png":     [("talk", 4, 281, 1126, 542, 727, [])],
  "Gemini_Generated_Image_5fafkc5fafkc5faf (1).png": [("held", 4, 224, 2062, 2, 440, [])],
  "Gemini_Generated_Image_5fafkc5fafkc5faf (2).png": [("fall", 4, 281, 1126, 542, 727, [1])],
  "Gemini_Generated_Image_5fafkc5fafkc5faf (3).png": [("land", 4, 2, 2062, 58, 463, [])],
  "Gemini_Generated_Image_daje7mdaje7mdaje.png":     [("react-happy", 7, 165, 1395, 70, 247, []), ("react-surprised", 7, 165, 1395, 307, 493, []), ("react-dizzy", 7, 187, 1395, 543, 729, [])],
  "Gemini_Generated_Image_daje7mdaje7mdaje (1).png": [("pet", 4, 165, 1395, 70, 351, []), ("eat", 6, 187, 1395, 543, 733, [])],
  "Gemini_Generated_Image_daje7mdaje7mdaje (2).png": [("idle-hungry", 4, 165, 1395, 70, 317, []), ("walk-hungry", 6, 187, 1395, 350, 527, []), ("rest-hungry", 6, 187, 1395, 541, 733, [])],
}
for file, rows in GEOMETRY.items():
    im = Image.open(f"{raw_dir}/{file}").convert("RGBA")
    for name, n, x0, x1, y0, y1, drop in rows:
        fw = (x1 - x0) / n
        frames = [im.crop((round(x0 + k * fw) + 3, y0 + 3, round(x0 + (k + 1) * fw) - 2, y1 - 2)) for k in range(n)]
        frames = [f for i, f in enumerate(frames) if (i + 1) not in drop]
        keyed = [key(f) for f in frames]
        heights = [h for h in (main_body_height(k) for k in keyed) if h]
        scale = BODY_H / statistics.median(heights)
        strip = Image.new("RGBA", (FW * len(keyed), FH), (0, 0, 0, 0))
        for i, k in enumerate(keyed):
            cx = body_center_x(k)
            r = k.resize((round(k.width * scale), round(k.height * scale)), Image.LANCZOS)
            rb = r.getbbox()
            if not rb: continue
            strip.paste(r, (i * FW + round(FW / 2 - cx * scale), round(FOOT_Y - rb[3])), r)
        strip.save(f"{out_dir}/{name}.png", optimize=True)
        fps, loop = ANIM[name]
        manifest["animations"][name] = {"file": f"{name}.png", "frames": len(keyed), "fps": fps, "loop": loop}
        print(f"{name}: {len(keyed)} frames, body h {sorted(heights)} -> scale {scale:.2f}")
json.dump(manifest, open(f"{out_dir}/skin.json", "w"), indent=2, ensure_ascii=False)
print("animations:", ", ".join(f"{k}({v['frames']})" for k, v in manifest["animations"].items()))

# 검사: 각 프레임 중심부(몸통)가 불투명한지
for name, a in manifest["animations"].items():
    strip = Image.open(f"{out_dir}/{a['file']}")
    holes = []
    for i in range(a["frames"]):
        f = strip.crop((i * FW, 0, (i + 1) * FW, FH)); b = f.getbbox()
        if not b: holes.append(f"{i+1}:empty"); continue
        cx = (b[0] + b[2]) // 2
        for ratio in (0.62, 0.88):
            cy = int(b[1] + (b[3] - b[1]) * ratio)
            if f.getpixel((cx, cy))[3] < 200: holes.append(f"{i + 1}@{ratio}")
    if holes: print(f"!! {name}: 몸통이 투명한 프레임 {holes}")
