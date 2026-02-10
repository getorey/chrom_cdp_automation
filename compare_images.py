import os
import sys

def get_image_info(path):
    if not os.path.exists(path):
        return f"File not found: {path}"
    
    size_bytes = os.path.getsize(path)
    size_kb = size_bytes / 1024
    
    try:
        from PIL import Image
        with Image.open(path) as img:
            width, height = img.size
            format = img.format
            mode = img.mode
            
            return {
                "path": path,
                "exists": True,
                "width": width,
                "height": height,
                "size_kb": round(size_kb, 2),
                "format": format,
                "mode": mode,
                "aspect_ratio": round(width / height, 2),
                "pixels": width * height
            }
    except ImportError:
        return "Pillow library not installed. Install with 'pip install Pillow'"
    except Exception as e:
        return f"Error reading image: {e}"

path1 = r"D:\python\chrom_cdp_automation\artifacts\vision-debug\vision-2026-02-10T09-25-20-764Z.png"
path2 = r"D:\python\chrom_cdp_automation\artifacts\vision-debug\vision-2026-02-10T09-31-16-073Z.png"

print("=" * 60)
print("Image Comparison")
print("=" * 60)

info1 = get_image_info(path1)
info2 = get_image_info(path2)

if isinstance(info1, dict) and isinstance(info2, dict):
    print(f"{'Property':<15} | {'Image 1 (Failed/Slow)':<25} | {'Image 2 (Success)':<25}")
    print("-" * 70)
    print(f"{'Width':<15} | {info1['width']:<25} | {info2['width']:<25}")
    print(f"{'Height':<15} | {info1['height']:<25} | {info2['height']:<25}")
    print(f"{'Size (KB)':<15} | {info1['size_kb']:<25} | {info2['size_kb']:<25}")
    print(f"{'Pixels':<15} | {info1['pixels']:<25} | {info2['pixels']:<25}")
    print(f"{'Aspect Ratio':<15} | {info1['aspect_ratio']:<25} | {info2['aspect_ratio']:<25}")
    
    pixel_diff = info1['pixels'] - info2['pixels']
    pixel_percent = (pixel_diff / info2['pixels']) * 100
    print("-" * 70)
    print(f"Difference: Image 1 has {pixel_diff:,} more pixels ({pixel_percent:.1f}% larger)")
else:
    print(info1)
    print(info2)
