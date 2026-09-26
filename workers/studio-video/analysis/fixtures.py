"""Deterministic non-personal images, generated outside Git for qualification."""
from pathlib import Path
import sys
import cv2
import numpy as np
root = Path(sys.argv[1]); root.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(431)
y, x = np.indices((512, 768))
base = np.full((512, 768, 3), 125, dtype=np.uint8)
for i in range(40):
    a, b = int(rng.integers(0, 730)), int(rng.integers(0, 480))
    cv2.rectangle(base, (a, b), (a+30, b+30), tuple(int(v) for v in rng.integers(20, 230, 3)), -1)
cv2.putText(base, 'ELSATIA STUDIO', (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (25, 25, 25), 3)
cv2.imwrite(str(root/'sharp.png'), base)
cv2.imwrite(str(root/'blur.png'), cv2.GaussianBlur(base, (31, 31), 10))
cv2.imwrite(str(root/'dark.png'), (base.astype(float)*.08).astype(np.uint8))
cv2.imwrite(str(root/'bright.png'), np.full_like(base, 250))
cv2.imwrite(str(root/'near.jpg'), base, [cv2.IMWRITE_JPEG_QUALITY, 88])
cv2.imwrite(str(root/'portrait.png'), cv2.rotate(base, cv2.ROTATE_90_CLOCKWISE))
for i in range(500):
    photo = np.full_like(base, 120)
    for j in range(30):
        cv2.rectangle(photo, tuple(int(v) for v in rng.integers([0,0],[700,440])), tuple(int(v) for v in rng.integers([50,50],[768,512])), tuple(int(v) for v in rng.integers(30,220,3)), -1)
    cv2.putText(photo, str(i), (200,260), cv2.FONT_HERSHEY_SIMPLEX, 2, (15,15,15), 4)
    cv2.imwrite(str(root/f'media-{i:03}.jpg'),photo,[cv2.IMWRITE_JPEG_QUALITY,90])
print('Generated 506 deterministic images')
