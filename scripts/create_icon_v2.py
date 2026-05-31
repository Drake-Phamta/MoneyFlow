from PIL import Image, ImageDraw, ImageFont
import math

def create_icon():
    sizes = [16, 32, 48, 64, 128, 256]
    images = []

    for size in sizes:
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        pad = size * 0.02

        # Rounded rectangle background
        corner_r = size * 0.22
        x0, y0, x1, y1 = pad, pad, size - pad, size - pad

        # Gradient: emerald green (#10b981 to #059669)
        for y in range(int(y0), int(y1)):
            ratio = (y - y0) / (y1 - y0)
            r = int(16 + 5 * ratio)
            g = int(185 - 30 * ratio)
            b = int(129 - 20 * ratio)
            draw.line([(x0, y), (x1, y)], fill=(r, g, b, 255))

        # Round corners
        mask = Image.new('L', (size, size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([x0, y0, x1, y1], radius=corner_r, fill=255)
        img.putalpha(mask)

        draw = ImageDraw.Draw(img)
        cx, cy = size / 2, size / 2

        # White upward arrow (simple, clean)
        arrow_size = size * 0.35
        arrow_x = cx
        arrow_y = cy - size * 0.05

        # Arrow body (vertical line)
        body_w = size * 0.12
        body_h = arrow_size * 0.6
        bx0 = int(arrow_x - body_w/2)
        by0 = int(arrow_y)
        bx1 = int(arrow_x + body_w/2)
        by1 = int(arrow_y + body_h)
        if bx1 > bx0 and by1 > by0:
            draw.rounded_rectangle(
                [bx0, by0, bx1, by1],
                radius=max(1, int(size * 0.02)),
                fill=(255, 255, 255, 240)
            )

        # Arrow head (triangle)
        head_size = arrow_size * 0.45
        head_points = [
            (arrow_x, arrow_y - head_size),  # top
            (arrow_x - head_size * 0.7, arrow_y + head_size * 0.2),  # left
            (arrow_x + head_size * 0.7, arrow_y + head_size * 0.2),  # right
        ]
        draw.polygon(head_points, fill=(255, 255, 255, 240))

        # Small $ sign at bottom-right
        if size >= 48:
            ds_size = size * 0.2
            ds_x = x1 - ds_size - size * 0.1
            ds_y = y1 - ds_size - size * 0.1
            # Yellow circle
            draw.ellipse(
                [ds_x, ds_y, ds_x + ds_size, ds_y + ds_size],
                fill=(255, 200, 50, 250)
            )
            # $ text
            try:
                font = ImageFont.truetype("arial.ttf", int(ds_size * 0.6))
            except:
                font = ImageFont.load_default()
            bbox = font.getbbox("$")
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            tx = ds_x + (ds_size - tw) / 2
            ty = ds_y + (ds_size - th) / 2 - bbox[1]
            draw.text((tx, ty), "$", fill=(20, 80, 40, 255), font=font)

        images.append(img)

    # Save ICO
    images[-1].save(
        r"D:\New_era\Money_Flow\icon.ico",
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=images[:-1]
    )
    print("Icon created: icon.ico")

    # Save PNG
    images[-1].save(r"D:\New_era\Money_Flow\icon.png", format='PNG')
    print("PNG preview: icon.png")

create_icon()
