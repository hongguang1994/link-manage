import random
from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

SECRET_KEY = "simnexus-secret-key-change-in-production"
ALGORITHM = "HS256"
CAPTCHA_EXPIRE_MINUTES = 5

# Unambiguous chars (exclude 0/O/1/I/l)
_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

router = APIRouter(tags=["captcha"])


def _svg(code: str) -> str:
    w, h = 160, 52
    rng = random.Random()

    # 高饱和度字符色盘，与白底对比度高
    _PALETTES = [
        (220,  38,  38),   # red-600
        ( 37, 130, 211),   # blue-500
        ( 22, 163,  74),   # green-600
        (124,  58, 237),   # violet-600
        (234,  88,  12),   # orange-600
        ( 15, 118, 110),   # teal-600
        (190,  18,  60),   # rose-700
        ( 79,  70, 229),   # indigo-600
    ]
    rng.shuffle(_PALETTES)

    # 干扰曲线（贝塞尔，颜色浅，不遮字）
    curves = []
    for _ in range(4):
        x1, y1 = rng.randint(0, w // 2), rng.randint(5, h - 5)
        x2, y2 = rng.randint(w // 2, w), rng.randint(5, h - 5)
        cx1, cy1 = rng.randint(20, w - 20), rng.randint(0, h)
        cx2, cy2 = rng.randint(20, w - 20), rng.randint(0, h)
        c = rng.randint(180, 220)
        curves.append(
            f'<path d="M{x1},{y1} C{cx1},{cy1} {cx2},{cy2} {x2},{y2}" '
            f'stroke="rgb({c},{c},{c})" stroke-width="1.5" fill="none" opacity="0.7"/>'
        )

    # 少量噪点
    dots = []
    for _ in range(30):
        x, y = rng.randint(0, w), rng.randint(0, h)
        c = rng.randint(150, 200)
        dots.append(f'<circle cx="{x}" cy="{y}" r="1.2" fill="rgb({c},{c},{c})" opacity="0.6"/>')

    # 字符：各自独立颜色，轻微旋转和垂直抖动
    chars_svg = []
    step = (w - 20) // len(code)
    for i, ch in enumerate(code):
        x = 14 + i * step + rng.randint(-2, 2)
        y = rng.randint(33, 40)
        rot = rng.randint(-10, 10)
        r, g, b = _PALETTES[i % len(_PALETTES)]
        chars_svg.append(
            f'<text x="{x}" y="{y}" transform="rotate({rot},{x},{y})" '
            f'font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" '
            f'fill="rgb({r},{g},{b})" letter-spacing="1">{ch}</text>'
        )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb">'
        + "".join(curves)
        + "".join(dots)
        + "".join(chars_svg)
        + "</svg>"
    )


def generate() -> tuple[str, str]:
    """Return (signed_token, svg_string)."""
    code = "".join(random.choices(_CHARS, k=4))
    exp = datetime.utcnow() + timedelta(minutes=CAPTCHA_EXPIRE_MINUTES)
    token = jwt.encode({"cap": code, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)
    return token, _svg(code)


def verify(token: str, answer: str) -> None:
    """Raise HTTPException if answer is wrong or token is expired."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(400, "验证码已过期，请刷新")
    if answer.upper() != payload.get("cap", ""):
        raise HTTPException(400, "验证码错误")


@router.get("/auth/captcha")
def get_captcha():
    token, svg = generate()
    return {"token": token, "svg": svg}
