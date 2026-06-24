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
    w, h = 130, 44
    rng = random.Random()  # local instance so parallel requests don't interfere

    # Interference lines
    lines = []
    for _ in range(6):
        x1, y1 = rng.randint(0, w), rng.randint(0, h)
        x2, y2 = rng.randint(0, w), rng.randint(0, h)
        c = rng.randint(160, 210)
        lines.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="rgb({c},{c},{c})" stroke-width="1.2" opacity="0.6"/>'
        )

    # Noise dots
    dots = []
    for _ in range(40):
        x, y = rng.randint(0, w), rng.randint(0, h)
        r = rng.randint(120, 190)
        dots.append(f'<circle cx="{x}" cy="{y}" r="1.3" fill="rgb({r},{r},{r})" opacity="0.5"/>')

    # Characters
    chars_svg = []
    for i, ch in enumerate(code):
        x = 14 + i * 27
        y = rng.randint(28, 34)
        rot = rng.randint(-12, 12)
        fill = f"rgb({rng.randint(30,90)},{rng.randint(30,90)},{rng.randint(80,160)})"
        chars_svg.append(
            f'<text x="{x}" y="{y}" transform="rotate({rot},{x},{y})" '
            f'font-family="monospace" font-size="24" font-weight="bold" fill="{fill}">{ch}</text>'
        )

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"'
        f' style="background:#1f2937;border-radius:6px">'
        + "".join(lines)
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
