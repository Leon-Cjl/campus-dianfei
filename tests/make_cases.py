"""生成对拍数据：随机读数历史（含充值、长时间不查、很短的间隔），以及几个手写边界情况。"""
import random, sys
H, D = 3600_000, 86400_000
now = 1_792_650_000_000
out = []
def block(hist, n=now):
    out.append("\n".join([str(n)] + [f"{t} {b:.6f}" for t, b in hist]))
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
    block(hist)
open(sys.argv[1], "w", encoding="utf-8").write("\n\n".join(out) + "\n")
print(len(out), "组")
