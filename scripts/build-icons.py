# -*- coding: utf-8 -*-
"""Sinh bộ icon của app từ brand/logo-master.png.

Tệp gốc là 6000x3375 nhưng nội dung chỉ chiếm khoảng 4% diện tích, phần còn lại
là lề trắng, và ảnh không có kênh trong suốt. Thả thẳng vào ô 40px thì biểu
tượng thật chỉ còn chừng 8px và nền trắng thành một ô nổi lên trên nền giấy.
Nên phải cắt ra chứ không dùng trực tiếp được.

Chạy:  python scripts/build-icons.py            (bản màu gốc)
       python scripts/build-icons.py --moss     (bản đưa về tông mực của app)
       python scripts/build-icons.py --compare  (dựng ảnh so sánh hai bản)
"""
import colorsys
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = os.path.join(ROOT, 'brand', 'logo-master.png')

# Đo từ chính tệp gốc, không phải ước lượng bằng mắt.
MARK_BOX = (2465, 981, 3538, 1835)      # riêng biểu tượng
LOCKUP_BOX = (2403, 981, 3601, 2397)    # biểu tượng + chữ MONEY FLOW

# Nền giấy và nền tối của app, để xem trước icon nằm trên đó ra sao.
PAPER = (250, 249, 246)
INK = (23, 21, 15)

MOSS_HUE = 165.0 / 360.0   # #0F5D4A
HUE_CENTER = 185.0 / 360.0  # tâm dải màu của logo gốc
HUE_SQUEEZE = 0.40          # ép dải màu lại quanh tông mực


def transparent(im):
    """Bỏ nền trắng VÀ lưới xám mờ phía sau biểu tượng.

    Lúc đầu tôi loang từ bốn mép để giữ lại lưới. Nhưng các nét lưới đủ đậm để
    chặn phép loang, nên những ô lưới bị vây kín vẫn còn trắng — trên nền tối
    chúng hiện thành mấy ô trắng chói giữa hình. Mà bản thân lưới ở cỡ 32px
    cũng chỉ còn là nhiễu.

    Nên lọc theo màu: điểm nào NHẠT và KHÔNG có màu thì là nền. Biểu tượng
    toàn xanh lam và xanh lá bão hoà cao nên không bị ăn vào; các mảng sáng
    bên trong hình vốn là nền lọt qua khe, mất đi là đúng.

    Vùng chuyển tiếp lấy alpha theo độ đậm, để mép hình không bị răng cưa.
    """
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            sat = 0 if mx == 0 else (mx - mn) / mx
            if sat >= 0.16:
                continue                      # có màu → thuộc biểu tượng
            if mx >= 250:
                px[x, y] = (r, g, b, 0)       # trắng hẳn → nền
            elif mx >= 205:
                # xám nhạt (nét lưới, viền chống răng cưa) → mờ dần
                px[x, y] = (r, g, b, int(a * (250 - mx) / 45))
    return im


def to_moss(im):
    """Đưa navy + xanh tươi về dải xanh rêu, giữ nguyên hình và độ đậm nhạt."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > 0.08:
                hh = MOSS_HUE + (hh - HUE_CENTER) * HUE_SQUEEZE
                s = min(1.0, s * 0.92)
            nr, ng, nb = colorsys.hsv_to_rgb(hh % 1.0, s, v)
            px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return im


def squared(im, pad=0.08):
    """Đệm thành hình vuông, lề thở đều bốn phía."""
    w, h = im.size
    side = int(max(w, h) * (1 + pad * 2))
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    out.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return out


def build_mark(moss=False):
    src = Image.open(MASTER)
    mark = transparent(src.crop(MARK_BOX))
    if moss:
        mark = to_moss(mark)
    return squared(mark)


def on(bg, im, size):
    tile = Image.new('RGB', (size, size), bg)
    small = im.resize((size, size), Image.LANCZOS)
    tile.paste(small, (0, 0), small)
    return tile


def write_set(moss):
    mark = build_mark(moss)
    pub = os.path.join(ROOT, 'public')

    def save(img, path):
        img.save(path)
        print('  ' + os.path.relpath(path, ROOT))

    save(mark.resize((256, 256), Image.LANCZOS), os.path.join(pub, 'icon.png'))
    save(mark.resize((32, 32), Image.LANCZOS), os.path.join(pub, 'favicon-32.png'))
    save(mark.resize((180, 180), Image.LANCZOS), os.path.join(pub, 'apple-touch-icon.png'))

    ico_sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    for target in (os.path.join(pub, 'icon.ico'), os.path.join(ROOT, 'build', 'icon.ico')):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        mark.resize((256, 256), Image.LANCZOS).save(target, sizes=ico_sizes)
        print('  ' + os.path.relpath(target, ROOT))

    lock = transparent(Image.open(MASTER).crop(LOCKUP_BOX))
    if moss:
        lock = to_moss(lock)
    save(lock, os.path.join(ROOT, 'brand', 'logo-lockup.png'))


def write_compare():
    """Hai bản màu, cạnh nhau, ở đúng những cỡ thật app dùng."""
    sizes = [16, 32, 40, 64, 256]
    variants = [('goc', build_mark(False)), ('moss', build_mark(True))]
    gap, margin = 24, 28
    row_h = 256 + 60
    width = margin * 2 + sum(sizes) + gap * (len(sizes) - 1)
    height = margin * 2 + row_h * 4

    sheet = Image.new('RGB', (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    y = margin
    for bg_name, bg in (('nen giay', PAPER), ('nen toi', INK)):
        for name, mark in variants:
            x = margin
            for s in sizes:
                sheet.paste(on(bg, mark, s), (x, y + (256 - s)))
                draw.text((x, y + 262), str(s) + 'px', fill=(120, 120, 120))
                x += s + gap
            label = ('mau goc' if name == 'goc' else 'tong muc cua app') + ' — ' + bg_name
            draw.text((margin, y + 278), label, fill=(40, 40, 40))
            y += row_h
    out = os.path.join(ROOT, 'brand', 'so-sanh.png')
    sheet.save(out)
    print('so sanh ->', os.path.relpath(out, ROOT))
    print('bon hang: goc/giay, moss/giay, goc/toi, moss/toi — co', sizes)


if __name__ == '__main__':
    if '--compare' in sys.argv:
        write_compare()
    else:
        write_set('--moss' in sys.argv)
