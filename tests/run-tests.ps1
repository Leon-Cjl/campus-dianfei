# 对拍：界面（app.js）和后台预警（Core.java）的日均用电算法结果一致。先跑 build.ps1 生成 build\obj。
$ErrorActionPreference = "Stop"
# JDK 17+：设置 JAVA_HOME，或改成你的 JDK 目录（例如 Android Studio 自带的 jbr）
$JDK = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$JBR  = "$JDK\bin"
$AJAR = "$(if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" })\platforms\android-37.0\android.jar"
$P    = Split-Path -Parent $PSScriptRoot
$W    = "$P\build\test"
if ([IO.Path]::GetFullPath($W) -ne [IO.Path]::GetFullPath((Join-Path $P 'build\test'))) { throw "拒绝清理项目以外的目录" }
if (Test-Path -LiteralPath $W) { Remove-Item -LiteralPath $W -Recurse -Force }
New-Item -ItemType Directory $W | Out-Null

py -3.12 -I "$P\tests\make_cases.py" "$W\cases.txt"
if ($LASTEXITCODE -ne 0) { throw "生成测试数据失败" }
& "$JBR\javac.exe" -encoding UTF-8 -cp "$AJAR;$P\build\obj" -d "$W\cls" "$P\tests\RateTest.java" "$P\tests\CompactTest.java" "$P\tests\com\qlu\dianfei\CoreTestAccess.java"
& "$JBR\java.exe" -cp "$AJAR;$P\build\obj;$W\cls" RateTest "$W\cases.txt" | Set-Content "$W\java.txt" -Encoding ASCII
# 记录压缩（只留 120 天、合并不变的重复读数）不改变任何统计
& "$JBR\java.exe" "-Dstdout.encoding=UTF-8" -cp "$AJAR;$P\build\obj;$W\cls" CompactTest
if ($LASTEXITCODE -ne 0) { throw "记录压缩测试失败" }
node --test "$P\tests\login.test.cjs"
if ($LASTEXITCODE -ne 0) { throw "自动登录测试失败" }
node "$P\tests\rate.test.cjs" "$P\app\assets\app.js" "$W\cases.txt" "$W\java.txt"
if ($LASTEXITCODE -ne 0) { throw "对拍失败" }
