from PIL import Image

def manual_crop(path):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    
    pixels = img.load()
    
    min_x, min_y, max_x, max_y = w, h, 0, 0
    
    # Find bounding box
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # If not almost white
            if r < 240 or g < 240 or b < 240:
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y
                
    if min_x > max_x or min_y > max_y:
        print("Empty image after filtering.")
        return
        
    print(f"Found visual bounds: ({min_x}, {min_y}, {max_x}, {max_y})")
    
    pad = 10
    final_bbox = (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(w, max_x + pad),
        min(h, max_y + pad)
    )
    
    cropped = img.crop(final_bbox)
    
    # Make near-white transparent
    datas = list(cropped.getdata())
    new_data = []
    for item in datas:
        if item[0] >= 240 and item[1] >= 240 and item[2] >= 240:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    cropped.putdata(new_data)
    target = path.replace(".png", "_cropped.png")
    cropped.save(target, "PNG")
    print(f"Saved cropped to {target}")

if __name__ == "__main__":
    manual_crop("../frontend/public/logo.png")
