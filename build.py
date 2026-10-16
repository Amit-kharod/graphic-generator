#!/usr/bin/env python3
"""Assemble the single-file app:  python3 build.py  ->  dist/index.html + dist/apple-touch-icon.png"""
import base64, os, sys
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode()
html = open(os.path.join(HERE, "src", "app.html")).read()
js = open(os.path.join(HERE, "src", "render.js")).read()
html = (html.replace("{{FONT_REG}}", b64(os.path.join(FONTS, "OpenSans-Regular.ttf")))
            .replace("{{FONT_SEMI}}", b64(os.path.join(FONTS, "OpenSans-SemiBold.ttf")))
            .replace("{{RENDER_JS}}", js))
assert "{{" not in html.replace("${", ""), "unreplaced placeholder"
extra = sys.argv[1] if len(sys.argv) > 1 else None          # optional test-harness injection
out = os.path.join(HERE, "dist"); os.makedirs(out, exist_ok=True)
if extra:
    html = html.replace("</body>", f"<script>\n{open(extra).read()}\n</script>\n</body>")
    out_name = "test.html"
else:
    out_name = "index.html"
open(os.path.join(out, out_name), "w").write(html)

# home-screen icon
S = 180; im = Image.new("RGB", (S, S), (14, 14, 16)); d = ImageDraw.Draw(im)
f = ImageFont.truetype(os.path.join(FONTS, "OpenSans-SemiBold.ttf"), 92)
fs = ImageFont.truetype(os.path.join(FONTS, "OpenSans-Regular.ttf"), 22)
d.text((S/2, S/2 - 4), "Aa", font=f, fill=(255, 210, 74), anchor="mm")
im.save(os.path.join(out, "apple-touch-icon.png"))
print(f"dist/{out_name}  {len(html)/1024:.0f} KB  +  dist/apple-touch-icon.png")
