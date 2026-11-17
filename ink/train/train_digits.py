"""손글씨 숫자 인식기(작은 CNN) 학습 — numpy 만 쓴다.

    python ink/train/train_digits.py <MNIST .gz 폴더> ink/digits-model.js     (한 바퀴 약 12분, 기본 3바퀴)

결과는 int8 로 줄인 가중치를 base64 로 담은 js 파일(window.InkDigitsModel).
앱 안의 ink.js 가 인터넷 없이 이 모델로 숫자 칸(폭·길이·개수·사진번호)을 읽는다.

구조 : 28x28 → conv5x5 8 → relu → pool2 → conv5x5 16 → relu → pool2 → fc 784→64 → relu → fc 64→10
학습 : MNIST 60000장 + 무작위 이동·회전·크기·기울임·굵기 변형(태블릿 글씨에 덜 민감하게)
"""
import gzip, sys, os, base64, json, time
import numpy as np

rng = np.random.default_rng(1234)

def load(folder, name, kind):
    with gzip.open(os.path.join(folder, name), 'rb') as f:
        data = f.read()
    if kind == 'img':
        return np.frombuffer(data, np.uint8, offset=16).reshape(-1, 28, 28).astype(np.float32) / 255.0
    return np.frombuffer(data, np.uint8, offset=8).astype(np.int64)

# ---------- 변형(증강) ----------
def affine_batch(x):
    """x: (N,28,28) → 무작위 아핀 변형(양선형 보간)."""
    n = x.shape[0]
    ang = rng.uniform(-0.25, 0.25, n)          # ±14°
    sc = rng.uniform(0.8, 1.15, n)
    shx = rng.uniform(-0.3, 0.3, n)            # 기울임(이탤릭 글씨)
    tx = rng.uniform(-2.5, 2.5, n); ty = rng.uniform(-2.5, 2.5, n)
    yy, xx = np.meshgrid(np.arange(28) - 13.5, np.arange(28) - 13.5, indexing='ij')
    out = np.empty_like(x)
    for i in range(n):
        c, s = np.cos(ang[i]), np.sin(ang[i])
        # 출력 좌표 → 입력 좌표 (역변환)
        a = np.array([[c, -s], [s, c]]) @ np.array([[1, shx[i]], [0, 1]]) * sc[i]
        inv = np.linalg.inv(a)
        u = inv[0, 0] * (xx - tx[i]) + inv[0, 1] * (yy - ty[i]) + 13.5
        v = inv[1, 0] * (xx - tx[i]) + inv[1, 1] * (yy - ty[i]) + 13.5
        u0 = np.floor(u).astype(int); v0 = np.floor(v).astype(int)
        fu = u - u0; fv = v - v0
        img = np.pad(x[i], 1)
        def g(vv, uu):
            vv = np.clip(vv + 1, 0, 29); uu = np.clip(uu + 1, 0, 29)
            return img[vv, uu]
        out[i] = (g(v0, u0) * (1 - fu) * (1 - fv) + g(v0, u0 + 1) * fu * (1 - fv)
                  + g(v0 + 1, u0) * (1 - fu) * fv + g(v0 + 1, u0 + 1) * fu * fv)
    return out

def thickness_batch(x):
    """일부는 굵게(3x3 최대), 일부는 가늘게(3x3 최소) — 펜 굵기 차이."""
    n = x.shape[0]
    r = rng.uniform(0, 1, n)
    p = np.pad(x, ((0, 0), (1, 1), (1, 1)))
    stack = np.stack([p[:, dy:dy + 28, dx:dx + 28] for dy in range(3) for dx in range(3)], 0)
    mx = stack.max(0); mn = stack.min(0)
    out = x.copy()
    out[r < 0.25] = mx[r < 0.25]
    out[r > 0.85] = mn[r > 0.85]
    return out

# ---------- 층 ----------
def im2col(x, k, pad):
    # x: (N,C,H,W) → (N, H*W, C*k*k)  (stride 1, same)
    n, c, h, w = x.shape
    xp = np.pad(x, ((0, 0), (0, 0), (pad, pad), (pad, pad)))
    cols = np.empty((n, c, k, k, h, w), x.dtype)
    for dy in range(k):
        for dx in range(k):
            cols[:, :, dy, dx] = xp[:, :, dy:dy + h, dx:dx + w]
    return cols.transpose(0, 4, 5, 1, 2, 3).reshape(n, h * w, c * k * k)

def col2im(cols, shape, k, pad):
    n, c, h, w = shape
    cols = cols.reshape(n, h, w, c, k, k).transpose(0, 3, 4, 5, 1, 2)
    xp = np.zeros((n, c, h + 2 * pad, w + 2 * pad), cols.dtype)
    for dy in range(k):
        for dx in range(k):
            xp[:, :, dy:dy + h, dx:dx + w] += cols[:, :, dy, dx]
    return xp[:, :, pad:pad + h, pad:pad + w]

def init(shape, fan_in):
    return (rng.standard_normal(shape) * np.sqrt(2.0 / fan_in)).astype(np.float32)

P = {
    'c1w': init((8, 1 * 25), 25), 'c1b': np.zeros(8, np.float32),
    'c2w': init((16, 8 * 25), 200), 'c2b': np.zeros(16, np.float32),
    'f1w': init((784, 64), 784), 'f1b': np.zeros(64, np.float32),
    'f2w': init((64, 10), 64), 'f2b': np.zeros(10, np.float32),
}

def forward(x, P, train=False):
    n = x.shape[0]
    cache = {}
    x = x.reshape(n, 1, 28, 28)
    c1 = im2col(x, 5, 2)                                  # n,784,25
    z1 = c1 @ P['c1w'].T + P['c1b']                       # n,784,8
    a1 = np.maximum(z1, 0).reshape(n, 28, 28, 8).transpose(0, 3, 1, 2)
    p1 = a1.reshape(n, 8, 14, 2, 14, 2).max(axis=(3, 5))  # n,8,14,14
    c2 = im2col(p1, 5, 2)                                 # n,196,200
    z2 = c2 @ P['c2w'].T + P['c2b']                       # n,196,16
    a2 = np.maximum(z2, 0).reshape(n, 14, 14, 16).transpose(0, 3, 1, 2)
    p2 = a2.reshape(n, 16, 7, 2, 7, 2).max(axis=(3, 5))   # n,16,7,7
    f = p2.reshape(n, 784)
    z3 = f @ P['f1w'] + P['f1b']
    a3 = np.maximum(z3, 0)
    logits = a3 @ P['f2w'] + P['f2b']
    if train:
        cache.update(locals())
    return logits, cache

def pool_back(dp, a, n, c, h):
    # dp: n,c,h/2,h/2 ; a: n,c,h,h
    ar = a.reshape(n, c, h // 2, 2, h // 2, 2)
    mx = ar.max(axis=(3, 5), keepdims=True)
    mask = (ar == mx)
    mask = mask / np.maximum(mask.sum(axis=(3, 5), keepdims=True), 1)
    return (mask * dp[:, :, :, None, :, None]).reshape(n, c, h, h)

def backward(cache, y, P):
    n = y.shape[0]
    logits = cache['logits']
    e = np.exp(logits - logits.max(1, keepdims=True)); pr = e / e.sum(1, keepdims=True)
    loss = -np.log(pr[np.arange(n), y] + 1e-9).mean()
    d = pr; d[np.arange(n), y] -= 1; d /= n
    G = {}
    G['f2w'] = cache['a3'].T @ d; G['f2b'] = d.sum(0)
    d3 = (d @ P['f2w'].T) * (cache['z3'] > 0)
    G['f1w'] = cache['f'].T @ d3; G['f1b'] = d3.sum(0)
    df = (d3 @ P['f1w'].T).reshape(n, 16, 7, 7)
    da2 = pool_back(df, cache['a2'], n, 16, 14)
    dz2 = (da2.transpose(0, 2, 3, 1).reshape(n, 196, 16)) * (cache['z2'] > 0)
    G['c2w'] = np.einsum('npk,npc->kc', dz2, cache['c2']); G['c2b'] = dz2.sum((0, 1))
    dc2 = dz2 @ P['c2w']                                  # n,196,200
    dp1 = col2im(dc2, (n, 8, 14, 14), 5, 2)
    da1 = pool_back(dp1, cache['a1'], n, 8, 28)
    dz1 = (da1.transpose(0, 2, 3, 1).reshape(n, 784, 8)) * (cache['z1'] > 0)
    G['c1w'] = np.einsum('npk,npc->kc', dz1, cache['c1']); G['c1b'] = dz1.sum((0, 1))
    return loss, G

def main():
    folder, out = sys.argv[1], sys.argv[2]
    xtr = load(folder, 'train-images-idx3-ubyte.gz', 'img'); ytr = load(folder, 'train-labels-idx1-ubyte.gz', 'lbl')
    xte = load(folder, 't10k-images-idx3-ubyte.gz', 'img'); yte = load(folder, 't10k-labels-idx1-ubyte.gz', 'lbl')
    M = {k: np.zeros_like(v) for k, v in P.items()}; V = {k: np.zeros_like(v) for k, v in P.items()}
    t = 0; lr = 2e-3; bs = 128
    epochs = int(os.environ.get('EPOCHS', '3'))
    for ep in range(epochs):
        idx = rng.permutation(len(xtr)); t0 = time.time(); tot = 0
        for b in range(0, len(idx), bs):
            bi = idx[b:b + bs]
            x = xtr[bi]
            aug = rng.uniform(0, 1) < 0.85
            if aug:
                x = thickness_batch(affine_batch(x))
            logits, cache = forward(x, P, train=True)
            loss, G = backward(cache, ytr[bi], P)
            tot += loss * len(bi)
            t += 1
            for k in P:
                M[k] = 0.9 * M[k] + 0.1 * G[k]; V[k] = 0.999 * V[k] + 0.001 * G[k] ** 2
                mh = M[k] / (1 - 0.9 ** t); vh = V[k] / (1 - 0.999 ** t)
                P[k] -= (lr * mh / (np.sqrt(vh) + 1e-8)).astype(np.float32)
        lr *= 0.6
        acc = np.mean(np.concatenate([forward(xte[i:i + 1000], P)[0].argmax(1) for i in range(0, 10000, 1000)]) == yte)
        acc_aug = np.mean(np.concatenate([forward(thickness_batch(affine_batch(xte[i:i + 1000])), P)[0].argmax(1) for i in range(0, 10000, 1000)]) == yte)
        print(f'epoch {ep + 1} loss {tot / len(xtr):.4f} test {acc:.4f} test-aug {acc_aug:.4f} ({time.time() - t0:.0f}s)', flush=True)
        save(P, out, xte, yte)          # 한 바퀴마다 저장 — 중간 것도 바로 쓸 수 있게

def save(P0, out, xte, yte):
    # ---------- int8 양자화 + js 로 ----------
    order = ['c1w', 'c1b', 'c2w', 'c2b', 'f1w', 'f1b', 'f2w', 'f2b']
    layers = {}
    Q = {}
    for k in order:
        w = P0[k].astype(np.float32)
        s = float(np.abs(w).max() / 127.0) or 1.0
        q = np.clip(np.round(w / s), -127, 127).astype(np.int8)
        layers[k] = {'shape': list(w.shape), 'scale': s, 'data': base64.b64encode(q.tobytes()).decode()}
        Q[k] = (q.astype(np.float32) * s)
    accq = np.mean(np.concatenate([forward(xte[i:i + 1000], Q)[0].argmax(1) for i in range(0, 10000, 1000)]) == yte)
    print(f'int8 test {accq:.4f}', flush=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// 손글씨 숫자 인식 모델 (ink/train/train_digits.py 로 만든 파일 — 직접 고치지 않는다)\n')
        f.write(f'// MNIST 시험 정확도 {accq:.4f} (int8)\n')
        f.write('window.InkDigitsModel = ' + json.dumps(layers) + ';\n')

if __name__ == '__main__':
    main()
