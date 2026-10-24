"""Rasterize the app's simple three-bar mark without an external imaging dependency."""
from pathlib import Path
import math
import struct
import zlib

root = Path(__file__).resolve().parents[1] / 'public'
bars = [(120, 190, 64, 180, (41, 58, 44)),
        (224, 142, 64, 228, (155, 174, 114)),
        (328, 174, 64, 196, (229, 177, 140))]

def png(size, filename):
    rows = bytearray()
    angle = math.radians(12)
    for y in range(size):
        rows.append(0)
        for x in range(size):
            total = [0, 0, 0]
            # Supersample for crisp rounded edges at home-screen icon sizes.
            for sy in (0.25, 0.75):
                for sx in (0.25, 0.75):
                    px, py = (x + sx) * 512 / size - 256, (y + sy) * 512 / size - 256
                    rx = px * math.cos(angle) - py * math.sin(angle) + 256
                    ry = px * math.sin(angle) + py * math.cos(angle) + 256
                    color = (245, 243, 236)
                    for bx, by, width, height, fill in bars:
                        cx = min(max(rx, bx + 32), bx + width - 32)
                        cy = min(max(ry, by + 32), by + height - 32)
                        if (rx - cx) ** 2 + (ry - cy) ** 2 <= 32 ** 2:
                            color = fill
                    for channel in range(3):
                        total[channel] += color[channel]
            rows.extend(value // 4 for value in total)
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    data = b'\x89PNG\r\n\x1a\n'
    data += chunk(b'IHDR', struct.pack('!2I5B', size, size, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(bytes(rows))) + chunk(b'IEND', b'')
    (root / filename).write_bytes(data)

for size, filename in [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png')]:
    png(size, filename)
