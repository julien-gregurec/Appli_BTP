"""Bounded decoded frames only; no network, identity, embeddings or persistent face crops."""
import json
import sys
import cv2
import numpy as np
cv2.setNumThreads(1)
cv2.ocl.setUseOpenCL(False)
model = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
if model.empty():
    raise RuntimeError('FACE_MODEL_UNAVAILABLE')
rows = []
for path in sys.argv[1:]:
    image = cv2.imread(path)
    if image is None or max(image.shape[:2]) > 512:
        raise ValueError('FRAME_INVALID')
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    tiny = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
    value = 0
    for bit in (tiny[:, 1:] > tiny[:, :-1]).flatten():
        value = (value << 1) | int(bit)
    hist = []
    for channel in range(3):
        h = cv2.calcHist([image], [channel], None, [8], [0, 256]).flatten()
        hist.extend((h / h.sum()).tolist())
    faces = model.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(24, 24))
    focus = None
    if len(faces):
        x, y, w, h = max(faces, key=lambda r: r[2]*r[3])
        focus = [float((x+w/2)/image.shape[1]), float((y+h/2)/image.shape[0])]
    rows.append(dict(sharpness=float(cv2.Laplacian(gray, cv2.CV_64F).var()), brightness=float(gray.mean()),
                     dark_fraction=float((gray < 20).mean()), bright_fraction=float((gray > 235).mean()),
                     variance=float(gray.var()), dhash=f'{value:016x}', histogram=hist,
                     face_count=len(faces), focus=focus))
print(json.dumps(rows, allow_nan=False))
