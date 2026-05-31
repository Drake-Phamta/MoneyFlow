from PIL import Image, ImageDraw, ImageFont
import math

def create_icon():
    sizes = [16, 32, 48, 64, 128, 256]
    images = []

    for size in sizes:
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        pad = size * 0.05

        # Rounded rectangle background - gradient green
        corner_r = size * 0.18
        x0, y0, x1, y1 = pad, pad, size - pad, size - pad

        # Draw gradient background (dark green to emerald)
        for y in range(int(y0), int(y1)):
            ratio = (y - y0) / (y1 - y0)
            g = int(140 + 80 * ratio)
            r_col = int(20 + 20 * ratio)
            b_col = int(60 + 40 * ratio)
            draw.line([(x0, y), (x1, y)], fill=(r_col, g, b_col, 255))

        # Round corners mask
        mask = Image.new('L', (size, size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([x0, y0, x1, y1], radius=corner_r, fill=255)
        img.putalpha(mask)

        # Redraw gradient on masked image
        draw = ImageDraw.Draw(img)

        # Draw upward arrow/chart line (financial growth symbol)
        cx, cy = size / 2, size / 2
        line_w = max(2, int(size * 0.06))

        # Chart bars (3 bars going up)
        bar_w = size * 0.14
        bar_gap = size * 0.06
        total_w = bar_w * 3 + bar_gap * 2
        start_x = cx - total_w / 2
        base_y = cy + size * 0.25

        bar_heights = [0.25, 0.45, 0.65]
        for i, h in enumerate(bar_heights):
            bx = start_x + i * (bar_w + bar_gap)
            bh = size * h
            by = base_y - bh
            # White bars with slight transparency
            draw.rounded_rectangle(
                [bx, by, bx + bar_w, base_y],
                radius=max(1, size * 0.02),
                fill=(255, 255, 255, 230)
            )

        # Upward trend line
        points = []
        for i in range(3):
            px = start_x + i * (bar_w + bar_gap) + bar_w / 2
            py = base_y - size * bar_heights[i] * 0.9
            points.append((px, py))

        if len(points) >= 2:
            draw.line(points, fill=(255, 220, 50, 255), width=line_w, joint='curve')
            # Dots at each point
            dot_r = max(2, size * 0.04)
            for p in points:
                draw.ellipse(
                    [p[0] - dot_r, p[1] - dot_r, p[0] + dot_r, p[1] + dot_r],
                    fill=(255, 220, 50, 255)
                )

        # Dollar sign at top-right
        if size >= 48:
            ds_size = size * 0.22
            ds_x = x1 - ds_size - size * 0.08
            ds_y = y0 + size * 0.08
            # Circle behind $
            draw.ellipse(
                [ds_x, ds_y, ds_x + ds_size, ds_y + ds_size],
                fill=(255, 220, 50, 240)
            )
            # $ text
            try:
                font = ImageFont.truetype("arial.ttf", int(ds_size * 0.65))
            except:
                font = ImageFont.load_default()
            bbox = font.getbbox("$")
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            tx = ds_x + (ds_size - tw) / 2
            ty = ds_y + (ds_size - th) / 2 - bbox[1]
            draw.text((tx, ty), "$", fill=(20, 80, 40, 255), font=font)

        images.append(img)

    # Save as ICO with multiple sizes
    images[-1].save(
        r"D:\New_era\Money_Flow\icon.ico",
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=images[:-1]
    )
    print("Icon created: D:\\New_era\\Money_Flow\\icon.ico")

    # Also save a PNG preview
    images[-1].save(r"D:\New_era\Money_Flow\icon.png", format='PNG')
    print("PNG preview: D:\\New_era\\Money_Flow\\icon.png")

create_icon()
