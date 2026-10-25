# 校园电费

齐鲁工业大学宿舍电费查询的安卓小应用（包名 `com.qlu.dianfei`），当前版本 **1.6.4**。在本机 WebView 里打开学校官方缴费平台，自动登录、选校区宿舍、读出余额，然后在本地做用电统计和提醒。**没有自建服务器**，也不提供充值：“去充值”只复制公众号名称并打开微信。

> 个人开发、免费，非齐鲁工业大学或缴费平台官方应用。数据以缴费平台显示为准；日均用电、可用天数都是推算，仅供参考，不应作为唯一的停电提醒。

![宣传图](docs/promo.png)

## 功能

- **自动登录与查询**：学校账号密码用 Android Keystore（AES-GCM）加密存在应用私有目录；会话有效时直接复用，失效自动重登；网络异常自动恢复一次。验证码由用户手动完成。
- **用电统计**：日均用电（按余额实际变化的时长分摊）、今天 / 近 7 天 / 本月、用电日历、走势图、月度对比、充值识别。
- **提醒**：低于提醒线或预计 N 天内用完时通知；每日估算提醒走系统闹钟，不常驻后台。
- **桌面小组件**：剩余电费、还能用几天、上次查询时间，跟随深浅色。
- 读数只存本机，最近 120 天按规则压缩保存。

## 源码

| 文件 | 用途 |
|---|---|
| `app/src/com/qlu/dianfei/MainActivity.java` | 原生界面、查询生命周期、会话与网络恢复、账号管理 |
| `app/src/com/qlu/dianfei/CredentialStore.java` | Keystore 加密、账号开关与错误状态 |
| `app/src/com/qlu/dianfei/Core.java` | 读数、用电算法、提醒、可信域名和脚本加载 |
| `app/src/com/qlu/dianfei/DianfeiWidget.java` | 桌面小组件 |
| `app/assets/login.js` | 等待表单、自动填写提交、识别错误与取消 |
| `app/assets/driver.js` | 学校校区、宿舍、余额页面驱动 |
| `app/assets/app.js` | 本地界面与状态显示 |

详细的设计说明和每个版本的改动见 [CHANGELOG.md](CHANGELOG.md)。

## 构建

不用 Gradle，`build.ps1` 直接调 aapt2 / javac / d8 / apksigner：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'   # JDK 17+
$env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"           # 需要 build-tools 36.0.0、platforms android-37.0
.\build.ps1          # 输出 build\校园电费-<版本>.apk
.\build.ps1 -WebDebug  # 诊断包：开 WebView 调试，包名 com.qlu.dianfei.debug
```

第一次构建会在仓库根目录生成 `debug.keystore`（已在 `.gitignore` 里）。用不同签名打的包不能覆盖安装作者发布的安装包。构建建议放在英文路径下（aapt2 对中文路径支持不好）。

## 测试

- `tests/run-tests.ps1`（先跑一次 `build.ps1`）：登录与驱动流程测试、记录压缩性质测试、310 组 Java/JS 用电算法对拍。
- `node --test tests/login.test.cjs tests/rate.test.cjs`：Node 单元测试。
- `node tests/preview-server.cjs`：在电脑浏览器里用演示数据预览界面（http://localhost:8765）。
- `tests/*-acceptance.cjs`、`cold-login-test.cjs`、`profile-query.cjs`：真机验收，需要诊断包和 adb，诊断只输出状态和计数，不输出账号密码。

## 参与开发

由 [Leon-Cjl](https://github.com/Leon-Cjl) 主导，AI 编程助手 [Claude](https://claude.com/claude-code)（Anthropic）、[Codex](https://openai.com/codex)（OpenAI）、[Gemini](https://gemini.google.com)（Google）和 [DeepSeek](https://www.deepseek.com) 参与了代码编写。

## 许可证

代码以 [MIT](LICENSE) 许可证开源。`app/assets/donate.png` 是作者的收款码，请勿在你自己发布的版本里沿用。
