import os
from PIL import Image

def convert_to_webp(filename, quality=80):
    try:
        if not os.path.exists(filename):
            print(f"File not found: {filename}")
            return
        
        img = Image.open(filename)
        webp_filename = os.path.splitext(filename)[0] + ".webp"
        
        # 保存（最適化、品質指定）
        img.save(webp_filename, "WEBP", quality=quality, optimize=True)
        
        original_size = os.path.getsize(filename)
        webp_size = os.path.getsize(webp_filename)
        
        print(f"Converted {filename} ({original_size/1024:.1f}KB) -> {webp_filename} ({webp_size/1024:.1f}KB)")
        print(f"Reduction: {(1 - webp_size/original_size)*100:.1f}%")
        
    except Exception as e:
        print(f"Error converting {filename}: {e}")

# 対象ファイル
files = [
    "images/otya.png",
    "images/image648358875.png",
    "images/washi_bg.png"
]

for f in files:
    convert_to_webp(f)
