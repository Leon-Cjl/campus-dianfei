"""生成对拍数据：随机读数历史（含充值、长时间不查、很短的间隔、假期、用电突增），以及几个手写边界情况。"""
import random, sys
H, D = 3600_000, 86400_000
now = 1_792_650_000_000
out = []
def block(hist, n=now, away=()):
    head = [str(n)] + (["away " + " ".join(f"{a} {b}" for a, b in away)] if away else [])
    out.append("\n".join(head + [f"{t} {b:.6f}" for t, b in hist]))
# 边界
block([])
block([(now - H, 50.0)])
block([(now - 3 * H, 50.0), (now - H, 49.8)])            # 只有 2 小时：不足 12 小时
block([(now - 20 * H, 50.0), (now - H, 48.9)])           # 19 小时
block([(now - 30 * D, 80.0), (now - 25 * D, 72.0)])      # 只有老数据：退回全部
block([(now - 2 * D, 10.0), (now - D, 60.0), (now - 2 * H, 59.0)])  # 中间充值
block([(now - 3 * D, 30.0), (now - 2 * D, 30.0), (now - D, 30.0)])  # 一直不变
# 余额不变的时段要算进时长：持平 10 小时后下降 → 用电摊在整 11 小时 + 后面一段
block([(now - 30 * H, 50.0), (now - 20 * H, 50.0), (now - 19 * H, 49.0), (now - 2 * H, 48.0)])
# 充值后持平再下降：从充值那一刻起算；末尾还没变的持平段不计入
block([(now - 3 * D, 20.0), (now - 2 * D, 70.0), (now - 40 * H, 70.0), (now - D, 68.5), (now - 2 * H, 68.5)])
# 很早的持平段跨进 14 天窗口：按段的结束时间判断是否在窗口内
block([(now - 20 * D, 90.0), (now - 16 * D, 90.0), (now - 10 * D, 80.0), (now - 9 * D, 80.0), (now - D, 70.0)])
# —— 以下对应 tests 里的手算值（见 README「测试」）——
# 假期：9天降10元但跨5天离校；无法分离耗费，1.8.1起返回无预测，不能再算10/4=2.5
block([(now - 10 * D, 50.0), (now - D, 40.0)], away=[(now - 8 * D, now - 3 * D)])
# 每天 3 元稳定用了 10 天，最后一天用了 9 元 → 用电异常：9 元、3 倍
block([(now - (11 - k) * D, 60.0 - 3 * k) for k in range(11)] + [(now - 2 * H, 60.0 - 30 - 9)])
# 最后一天 5.4 元：1.8 倍，不算异常
block([(now - (11 - k) * D, 60.0 - 3 * k) for k in range(11)] + [(now - 2 * H, 60.0 - 30 - 5.4)])
# 刚充值 10 小时就降得多：凑不够 20 小时，不算
block([(now - (11 - k) * D, 60.0 - 3 * k) for k in range(11)] + [(now - 12 * H, 80.0), (now - 2 * H, 74.0)])
# 之前只有 4 天记录：「平时」不准，不算（真机上出现过的误报）
block([(now - (5 - k) * D, 60.0 - 3 * k) for k in range(5)] + [(now - 2 * H, 60.0 - 12 - 9)])
# 最后一段跨了 5 天（查得太稀）：不算
block([(now - (16 - k) * D, 60.0 - 3 * k) for k in range(11)] + [(now - 2 * H, 60.0 - 30 - 40)])
rnd = random.Random(20261022)
for _ in range(300):
    t = now - rnd.randint(1, 60) * D
    b = rnd.uniform(5, 120)
    hist = []
    while t < now:
        hist.append((t, b))
        t += int(rnd.choice([0.5, 2, 5, 12, 24, 60, 200]) * H * rnd.uniform(0.5, 1.5))
        b -= rnd.uniform(0, 2.5) * rnd.random()
        if rnd.random() < 0.08: b += rnd.choice([20, 50, 100])
        b = max(b, 0)
    aw = []
    if rnd.random() < 0.35 and hist:
        a = rnd.randint(hist[0][0], now)
        aw.append((a, a + int(rnd.uniform(0.5, 12) * D)))
        if rnd.random() < 0.3:
            a2 = rnd.randint(hist[0][0], now)
            aw.append((a2, a2 + int(rnd.uniform(0.2, 5) * D)))
    block(hist, away=aw)
# 每天查一次、最后一两天可能用得特别多：专门覆盖用电异常的判断
for _ in range(120):
    hist, b, t = [], rnd.uniform(40, 120), now - rnd.randint(5, 40) * D
    base = rnd.uniform(0.5, 5)
    while t < now - D:
        hist.append((t, b))
        t += int(rnd.uniform(0.6, 1.6) * D)
        b = max(0.0, b - base * rnd.uniform(0.5, 1.5) * (rnd.random() > 0.15))
        if rnd.random() < 0.05: b += rnd.choice([30, 50])
    hist.append((t, max(0.0, b - base * rnd.choice([0.5, 1, 2.2, 3, 5]))))
    block(hist, away=[(now - rnd.randint(8, 30) * D, now - rnd.randint(3, 7) * D)] if rnd.random() < 0.25 else ())
open(sys.argv[1], "w", encoding="utf-8").write("\n\n".join(out) + "\n")
print(len(out), "组")
