"""Gemini 목업 시트 → 스프라이트 스트립 + skin.json
사용법: python3 -I scripts/extract-sprites.py src/renderer/assets/skins/chii/raw src/renderer/assets/skins/chii
(행 좌표는 아래 GEOMETRY 표에 수동 지정. 자세한 설명은 docs/sprite-guide.md)"""
import sys, json, statistics
from collections import deque
from PIL import Image, ImageFilter

raw_dir, out_dir = sys.argv[1], sys.argv[2]
FW, FH, BODY_H, FOOT_Y = 160, 240, 140, 236   # 프레임 160x240 (표시 80x120). 머리 위 프로펠러 등을 위해 세로 여유

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
  "idle": (4, True), "walk": (10, True), "rest": (3, True), "talk": (6, True), "held": (8, True),
  "fall": (8, True), "land": (12, False), "react-happy": (10, False), "react-surprised": (10, False),
  "react-dizzy": (10, False), "pet": (5, True), "eat": (8, True),
  "idle-hungry": (4, True), "walk-hungry": (10, True), "rest-hungry": (3, True),
  "sit": (3, True),
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

def checker_dark_color(im):
    """프레임 가장자리 링에서 어두운 체커 사각형의 대표색 (갇힌 영역 판별용)"""
    import statistics
    W, H = im.size; px = im.load(); R = 6
    ring = [px[x, y][:3] for x in range(W) for y in list(range(R)) + list(range(H - R, H))] + \
           [px[x, y][:3] for y in range(H) for x in list(range(R)) + list(range(W - R, W))]
    dark = [c for c in ring if 120 <= max(c) < 230] or [(197, 197, 197)]
    return tuple(int(statistics.median(ch)) for ch in zip(*dark))

def key(im, radius=1):
    """색에 의존하지 않는 배경 제거.
    캐릭터는 어두운 외곽선으로 닫혀 있으므로, 테두리에서 잉크(어두운 픽셀)를 넘지 않고 도달하는 영역 = 바깥.
    - 테두리선·바닥선처럼 긴 직선은 바깥에 닿은 부분만 지운다 (발 밑 외곽선은 유지)
    - 발 사이처럼 선 때문에 갇힌 체커 영역은 '회색 사각형이 섞인 무채색 영역'으로 판별해 바깥 처리"""
    im = im.convert("RGB"); W, H = im.size; px = im.load()
    INK = int(__import__('os').environ.get('INK', '150'))
    ink = [[max(px[x, y]) < INK for y in range(H)] for x in range(W)]
    # 긴 직선(프레임 폭/높이의 60% 이상) 표시
    line = [[False] * H for _ in range(W)]
    for y in range(H):
        run = 0
        for x in range(W + 1):
            if x < W and ink[x][y]: run += 1
            else:
                if run >= W * 0.25:   # 발에 끊긴 바닥선 조각도 잡히도록
                    for xx in range(x - run, x):
                        for yy in (y - 1, y, y + 1):
                            if 0 <= yy < H: line[xx][yy] = True
                run = 0
    for x in range(W):
        run = 0
        for y in range(H + 1):
            if y < H and ink[x][y]: run += 1
            else:
                if run >= H * 0.25:
                    for yy in range(y - run, y):
                        for xx in (x - 1, x, x + 1):
                            if 0 <= xx < W: line[xx][yy] = True
                run = 0
    # 잉크를 1px 팽창: 대각선으로만 이어진 얇은 외곽선 틈으로 4방향 채우기가 새지 않게 한다
    ink_d = [[False] * H for _ in range(W)]
    for x in range(W):
        for y in range(H):
            if ink[x][y]:
                for nx in range(x - radius, x + radius + 1):
                    for ny in range(y - radius, y + radius + 1):
                        if 0 <= nx < W and 0 <= ny < H: ink_d[nx][ny] = True
    # 1) 바깥: 테두리에서 (팽창된) 잉크를 넘지 않고 도달
    ext = [[False] * H for _ in range(W)]; q = deque()
    def checker(x, y):
        r, g, b_ = px[x, y]; lo, hi = min(r, g, b_), max(r, g, b_)
        return (170 < lo and hi < 222 and hi - lo <= 30) or (lo > 225 and hi - lo <= 6)
    def seed(x, y):
        # 가장자리가 캐릭터(발·손)에 닿아 있을 수 있으므로 체커색 픽셀에서만 시작한다
        if not ink_d[x][y] and not ext[x][y] and checker(x, y): ext[x][y] = True; q.append((x, y))
    # 아래 가장자리는 발이 바닥선 위에 걸쳐 있고 발 안쪽이 흰색이라 시작점으로 쓰지 않는다 (좌우에서 이어진다)
    for x in range(W): seed(x, 0)
    for y in range(H): seed(0, y); seed(W - 1, y)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < W and 0 <= ny < H and not ext[nx][ny] and not ink_d[nx][ny]:
                ext[nx][ny] = True; q.append((nx, ny))
    # 팽창시킨 한 겹을 벗겨 원래 외곽선 경계로 되돌린다
    for _ in range(radius):
        peel = [(x, y) for x in range(W) for y in range(H) if not ext[x][y] and not ink[x][y]
                and any(0 <= nx < W and 0 <= ny < H and ext[nx][ny] for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)))]
        for x, y in peel: ext[x][y] = True
    # 2) 갇힌 체커 영역: 잉크가 아닌 미도달 덩어리 중, 회색 사각형 색이 15% 이상이고 채도 있는 색이 없는 것
    dm = checker_dark_color(im)
    seen = [[False] * H for _ in range(W)]
    for sx in range(W):
        for sy in range(H):
            if ink[sx][sy] or ext[sx][sy] or seen[sx][sy]: continue
            comp = [(sx, sy)]; seen[sx][sy] = True; qq = deque([(sx, sy)])
            while qq:
                x, y = qq.popleft()
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[nx][ny] and not ink[nx][ny] and not ext[nx][ny]:
                        seen[nx][ny] = True; qq.append((nx, ny)); comp.append((nx, ny))
            gray = sum(1 for x, y in comp if all(abs(c - m) <= 40 for c, m in zip(px[x, y], dm)))
            colored = any(max(px[x, y]) - min(px[x, y]) > 40 for x, y in comp)
            # 갇힌 체커 영역은 바닥선(또는 아래 가장자리)에 닿아 있다. 눈 흰자·연한 머리색은 닿지 않으므로 보호된다
            touches_line = any(y >= H - 2 or any(0 <= nx < W and 0 <= ny < H and line[nx][ny]
                               for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1))) for x, y in comp)
            if gray / len(comp) > 0.15 and not colored and touches_line:
                for x, y in comp: ext[x][y] = True
    # 3) 직선 중 바깥에 닿은 픽셀 제거 (반복해서 선 두께만큼)
    for _ in range(6):
        # 아래 가장자리 밖은 바깥으로 간주 → 바닥선 잔재가 아래에서부터 지워진다
        rm = [(x, y) for x in range(W) for y in range(H) if line[x][y] and not ext[x][y]
              and any(ny >= H or (0 <= nx < W and 0 <= ny < H and ext[nx][ny]) for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)))]
        if not rm: break
        for x, y in rm: ext[x][y] = True
    mask = Image.new("L", (W, H), 255); mp = mask.load()
    EDGE, EDGE_BOTTOM = 6, 2
    for x in range(W):
        for y in range(H):
            if ext[x][y] or x < EDGE or y < EDGE or x >= W - EDGE or y >= H - EDGE_BOTTOM: mp[x, y] = 0
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    out = im.convert("RGBA"); out.putalpha(mask)
    return out

def key_white(im):
    """순백 배경 단일 이미지용: 가장자리와 이어진 흰색(거의 흰색)만 투명. 몸통 흰색은 외곽선이 막는다"""
    im = im.convert("RGB"); W, H = im.size; px = im.load()
    def white(x, y):
        r, g, b = px[x, y]; return min(r, g, b) >= 232 and max(r, g, b) - min(r, g, b) <= 12
    ext = [[False] * H for _ in range(W)]; q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if white(x, y) and not ext[x][y]: ext[x][y] = True; q.append((x, y))
    for y in range(H):
        for x in (0, W - 1):
            if white(x, y) and not ext[x][y]: ext[x][y] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < W and 0 <= ny < H and not ext[nx][ny] and white(nx, ny):
                ext[nx][ny] = True; q.append((nx, ny))
    # 외곽선 바깥의 연한 안티앨리어싱 픽셀(밝은 회색)을 한 겹 더 벗긴다
    fringe = [(x, y) for x in range(W) for y in range(H) if not ext[x][y] and min(px[x, y]) >= 200
              and any(0 <= nx < W and 0 <= ny < H and ext[nx][ny] for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)))]
    for x, y in fringe: ext[x][y] = True
    mask = Image.new("L", (W, H), 255); mp = mask.load()
    for x in range(W):
        for y in range(H):
            if ext[x][y]: mp[x, y] = 0
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
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

def extend_cut_feet(im, depth=9):
    """바닥선에 걸려 평평하게 끊긴 발을 둥글게 이어 그린다.
    맨 아래 불투명 행에서 발 구간을 찾아, 아래로 depth px 만큼 타원 모양으로 몸 색을 채우고 외곽선을 두른다"""
    W, H = im.size; px = im.load()
    # 맨 아래쪽에서 불투명 픽셀이 있는 마지막 행
    bottom = None
    for y in range(H - 1, -1, -1):
        if any(px[x, y][3] > 128 for x in range(W)): bottom = y; break
    if bottom is None or bottom < H - 4: return im          # 바닥에 닿아 있지 않으면 그대로
    cols = [x for x in range(W) if px[x, bottom][3] > 128]
    runs = []
    for x in cols:
        if runs and x - runs[-1][-1] <= 1: runs[-1].append(x)
        else: runs.append([x])
    runs = [(r[0], r[-1]) for r in runs if 6 <= r[-1] - r[0] <= W * 0.22]   # 발 크기의 좁은 구간만
    if not runs or len(runs) > 2: return im   # 몸통 밑면 전체가 잘린 경우는 손대지 않는다
    out = Image.new("RGBA", (W, H + depth), (0, 0, 0, 0)); out.paste(im, (0, 0)); op = out.load()
    for x0, x1 in runs:
        # 몸 색: 구간 안쪽 몇 행 위의 밝은 픽셀 중앙값 / 외곽선 색: 가장 어두운 픽셀
        inner = [px[x, y][:3] for x in range(x0 + 2, x1 - 1) for y in range(max(0, bottom - 6), bottom) if px[x, y][3] > 128]
        if not inner: continue
        import statistics
        light = [c for c in inner if max(c) > 200] or inner
        fill = tuple(int(statistics.median(ch)) for ch in zip(*light))
        dark = min(inner, key=lambda c: sum(c))
        cx = (x0 + x1) / 2; half = (x1 - x0) / 2
        for k in range(1, depth + 1):
            t = k / depth
            hw = half * (1 - t * t) ** 0.5          # 타원 단면
            y = bottom + k
            for x in range(int(cx - hw), int(cx + hw) + 1):
                if 0 <= x < W:
                    edge = abs(x - cx) > hw - 2.2 or k > depth - 2.2
                    op[x, y] = (*(dark if edge else fill), 255)
    return out

def keep_main_component(im):
    """몸통(가장 큰 덩어리)만 남긴다. 잠자기 프레임의 zzz 말풍선·숨 표시 제거용"""
    W, H = im.size; px = im.load(); out = im.copy(); op = out.load()
    seen = [[False] * H for _ in range(W)]; comps = []
    for sx in range(W):
        for sy in range(H):
            if seen[sx][sy] or px[sx, sy][3] <= 20: continue
            comp = [(sx, sy)]; seen[sx][sy] = True; qq = deque([(sx, sy)])
            while qq:
                x, y = qq.popleft()
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[nx][ny] and px[nx, ny][3] > 20:
                        seen[nx][ny] = True; qq.append((nx, ny)); comp.append((nx, ny))
            comps.append(comp)
    main = max(comps, key=len) if comps else []
    keep = set(main)
    for x in range(W):
        for y in range(H):
            if (x, y) not in keep: op[x, y] = (0, 0, 0, 0)
    return out

def body_center_x(im):
    bbox = im.getbbox()
    if not bbox: return im.width / 2
    x0, y0, x1, y1 = bbox
    lower = im.crop((0, y0 + int((y1 - y0) * 0.4), im.width, y1)).getbbox()
    return (lower[0] + lower[2]) / 2 if lower else (x0 + x1) / 2

manifest = {"name": "chii", "frameWidth": FW, "frameHeight": FH, "displaySize": 80, "animations": {}}
# 행 좌표 수동 지정: (이름, 프레임 수, x0, x1, y0, y1, 버릴 프레임)
GEOMETRY = {
  # idle 행은 몸 밑면이 바닥선에 잘려 있어 쓰지 않는다 → COMPOSE로 react 시트의 서 있는 프레임을 재구성
  "Gemini_Generated_Image_yxt6dzyxt6dzyxt6.png":     [("walk", 6, 117, 1302, 306, 492, []), ("rest", 4, 281, 1126, 542, 727, [])],
  "Gemini_Generated_Image_5fafkc5fafkc5faf.png":     [("talk", 4, 281, 1126, 542, 727, [])],
  # 들림: 사용자 교체본 (흰 배경, 테두리 없음, 7프레임, 프로펠러로 들려 올라감)
  "held-v2.png": [("held", 7, 0, 2418, 0, 427, [])],
  # (2)의 fall 행(거꾸로 떨어지는 그림)은 쓰지 않는다. 사용자 요청으로 fall 상태에 land.png를 쓴다
  "Gemini_Generated_Image_5fafkc5fafkc5faf (3).png": [("land", 4, 2, 2062, 58, 463, [])],
  "Gemini_Generated_Image_daje7mdaje7mdaje.png":     [("react-happy", 7, 165, 1395, 70, 247, []), ("react-surprised", 7, 165, 1395, 307, 493, []), ("react-dizzy", 7, 187, 1395, 543, 729, [])],
  "Gemini_Generated_Image_daje7mdaje7mdaje (1).png": [("pet", 4, 165, 1395, 70, 351, []), ("eat", 6, 187, 1395, 543, 733, [])],
  "Gemini_Generated_Image_daje7mdaje7mdaje (2).png": [("idle-hungry", 4, 165, 1395, 70, 317, []), ("walk-hungry", 6, 187, 1395, 350, 527, []), ("rest-hungry", 6, 187, 1395, 541, 733, [])],
}
# 단일 이미지(흰 배경, 프레임 1장)로 넣는 애니메이션: raw/<이름>.png 가 있으면 자동 포함
import os as _os
for single in ("sit",):
    path = f"{raw_dir}/{single}.png"
    if _os.path.exists(path):
        w, h = Image.open(path).size
        GEOMETRY[f"{single}.png"] = [(single, 1, 0, w - 1, 0, h - 6, [])]
ONLY = [o for o in __import__('os').environ.get('ONLY', '').split(',') if o]
# 몸통만 남길 애니메이션 (잠자기: zzz 말풍선 제거)
MAIN_ONLY = {"rest"}
# 프레임이 1장뿐인 애니메이션에 숨쉬기 모션을 합성
SYNTH_BREATHE = {"sit"}
# 순백 배경 단일 이미지 (체커보드 아님)
WHITE_BG = {"sit", "held"}
# 애니메이션별 최대 너비(px). 앉은 자세는 idle과 머리 크기를 맞추기 위해 조금 작게
WIDTH_FIT = {"sit": 132}
# 바닥선에 걸려 발이 평평하게 끊긴 시트: 발을 둥글게 이어 그린다
FEET_EXTEND = {"walk", "rest", "talk"}
# 다른 애니메이션의 키잉된 프레임을 모아 만드는 애니메이션: (원본 이름, 프레임 번호 1부터)
COMPOSE = {"idle": [("react-happy", 1), ("react-surprised", 7), ("react-dizzy", 7), ("react-happy", 7)]}
# 몸통 덩어리 높이 목표 재정의. held는 프로펠러·집게가 몸에 붙어 한 덩어리라 전체를 프레임 높이에 맞춘다 (몸은 idle과 비슷해짐)
BODY_FIT = {"held": 232}
# ONLY로 일부만 다시 뽑을 때는 기존 skin.json을 유지하며 갱신
if ONLY:
    try:
        manifest = json.load(open(f"{out_dir}/skin.json"))
    except FileNotFoundError:
        pass
all_keyed = {}

def assemble(name, keyed):
    """키잉된 프레임들을 크기 통일·발 정렬해 스트립과 매니페스트 항목으로"""
    heights = [h for h in (main_body_height(k) for k in keyed) if h]
    scale = BODY_FIT.get(name, BODY_H) / statistics.median(heights)
    widths = [k.getbbox()[2] - k.getbbox()[0] for k in keyed if k.getbbox()]
    scale = min(scale, WIDTH_FIT.get(name, FW - 14) / max(widths))
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

def blue_count(img):
    px_ = img.load(); return sum(1 for x in range(img.width) for y in range(img.height)
        if (len(px_[x, y]) < 4 or px_[x, y][3] > 128) and px_[x, y][2] > px_[x, y][0] + 35 and max(px_[x, y][:3]) < 205)

needed = set(ONLY) | {src for n in (ONLY or COMPOSE) if n in COMPOSE for src, _ in COMPOSE[n]}
for file, rows in GEOMETRY.items():
    im = Image.open(f"{raw_dir}/{file}").convert("RGBA")
    for name, n, x0, x1, y0, y1, drop in rows:
        if ONLY and name not in needed: continue
        fw = (x1 - x0) / n
        # 아래쪽은 바닥선(테두리)을 포함해 자른다. 발이 선 위에 그려져 있어 선을 빼면 발 밑이 열린다
        frames = [im.crop((round(x0 + k * fw) + 3, y0 + 3, round(x0 + (k + 1) * fw) - 2, y1 + 3)) for k in range(n)]
        frames = [f for i, f in enumerate(frames) if (i + 1) not in drop]
        keyed = []
        for f in frames:
            k = key_white(f) if name in WHITE_BG else key(f)
            if name not in WHITE_BG and blue_count(k) < blue_count(f.convert("RGB")) * 0.6:   # 외곽선 틈으로 머리까지 샌 경우
                k = key(f, radius=2)
                print(f"  ({name}: 프레임 {len(keyed) + 1} 머리 손실 → 반경 2로 재처리, 파랑 {blue_count(k)}/{blue_count(f.convert('RGB'))})")
            if name in MAIN_ONLY: k = keep_main_component(k)
            if name in FEET_EXTEND: k = extend_cut_feet(k)
            keyed.append(k)
        if name in SYNTH_BREATHE and len(keyed) == 1:
            base = keyed[0]
            def variant(sx, sy, deg):
                v = base.resize((round(base.width * sx), round(base.height * sy)), Image.LANCZOS)
                return v.rotate(deg, resample=Image.BICUBIC, expand=True, center=(v.width / 2, v.height)) if deg else v
            keyed = [base, variant(1.025, 0.965, 0), variant(1.0, 1.0, 1.5), variant(0.985, 1.02, -1.5)]
        all_keyed[name] = keyed
        if not ONLY or name in ONLY: assemble(name, keyed)
for name, parts in COMPOSE.items():
    if ONLY and name not in ONLY: continue
    if all(src in all_keyed for src, _ in parts):
        assemble(name, [all_keyed[src][i - 1] for src, i in parts])
# 별칭: 다른 애니메이션의 파일을 재사용하는 상태
ALIASES = {"fall": ("land", 8, True)}   # 떨어지는 동안 land.png를 반복 재생
for alias, (src, fps, loop) in ALIASES.items():
    if src in manifest["animations"]:
        manifest["animations"][alias] = {**manifest["animations"][src], "fps": fps, "loop": loop}
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
