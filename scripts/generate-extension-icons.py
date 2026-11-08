"""Render the Codex in Chrome cursor mark at Chrome's required PNG sizes."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


OUTPUT = Path(__file__).resolve().parents[1] / "packages" / "extension" / "icons"
SIZES = (16, 24, 32, 48, 128)


def render(size: int) -> Image.Image:
    canvas = size * 8
    factor = canvas / 128

    def point(x: float, y: float) -> tuple[int, int]:
        return round(x * factor), round(y * factor)

    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    gradient = Image.new("RGBA", (canvas, canvas))
    gradient_draw = ImageDraw.Draw(gradient)
    for y in range(canvas):
        t = y / max(canvas - 1, 1)
        color = (round(25 - 14 * t), round(107 - 66 * t), round(236 - 85 * t), 255)
        gradient_draw.line((0, y, canvas, y), fill=color)
    mask = Image.new("L", (canvas, canvas))
    ImageDraw.Draw(mask).rounded_rectangle(
        (*point(6, 6), *point(122, 122)),
        radius=round(29 * factor),
        fill=255,
    )
    image.paste(gradient, (0, 0), mask)

    glow = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        (*point(23, 22), *point(107, 106)), fill=(88, 211, 255, 105)
    )
    glow = glow.filter(ImageFilter.GaussianBlur(round(16 * factor)))
    image = Image.alpha_composite(image, glow)

    border = ImageDraw.Draw(image)
    border.rounded_rectangle(
        (*point(7, 7), *point(121, 121)),
        radius=round(28 * factor),
        outline=(178, 228, 255, 205),
        width=max(1, round(2.5 * factor)),
    )

    outline = [point(x, y) for x, y in (
        (33, 22), (33, 99), (51, 82), (71, 116),
        (90, 106), (72, 72), (104, 72),
    )]
    shadow = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.polygon([(x + round(3 * factor), y + round(4 * factor)) for x, y in outline], fill=(4, 20, 65, 170))
    image = Image.alpha_composite(image, shadow.filter(ImageFilter.GaussianBlur(round(4 * factor))))

    cursor = ImageDraw.Draw(image)
    cursor.line(outline + [outline[0]], fill=(4, 22, 77, 255), width=max(1, round(10 * factor)), joint="curve")
    cursor.polygon(outline, fill=(242, 252, 255, 255))
    cursor.line(outline + [outline[0]], fill=(164, 227, 255, 255), width=max(1, round(2 * factor)), joint="curve")
    cursor.line([point(40, 35), point(40, 82), point(52, 72)], fill=(73, 165, 246, 210), width=max(1, round(2.5 * factor)), joint="curve")

    sparkle = ImageDraw.Draw(image)
    sparkle.line([point(99, 28), point(99, 44)], fill=(218, 248, 255, 230), width=max(1, round(2 * factor)))
    sparkle.line([point(91, 36), point(107, 36)], fill=(218, 248, 255, 230), width=max(1, round(2 * factor)))
    return image.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for icon_size in SIZES:
        path = OUTPUT / f"icon{icon_size}.png"
        render(icon_size).save(path)
        print(path)
