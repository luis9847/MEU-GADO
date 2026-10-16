from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
res = root / "android-app/android/app/src/main/res"
logo = Image.open(root / "meu-gado-logo.png").convert("RGBA")
sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for density, size in sizes.items():
    directory = res / f"mipmap-{density}"
    directory.mkdir(parents=True, exist_ok=True)
    icon = logo.resize((size, size), Image.Resampling.LANCZOS)
    for name in ("ic_launcher.png", "ic_launcher_round.png"):
        icon.save(directory / name)
    foreground = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inset = max(1, int(size * 0.17))
    foreground.alpha_composite(logo.resize((size - 2 * inset, size - 2 * inset), Image.Resampling.LANCZOS), (inset, inset))
    foreground.save(directory / "ic_launcher_foreground.png")

for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
    target = res / "mipmap-anydpi-v26" / name
    target.write_text(
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/meu_gado_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n',
        encoding="utf-8",
    )
colors = res / "values" / "meu_gado_launcher_colors.xml"
colors.write_text(
    '<resources><color name="meu_gado_launcher_background">#073D30</color></resources>\n',
    encoding="utf-8",
)
