# 校园电费 App —— 手工打包脚本（零外部下载，全用本机已装工具）
# 用法：.\build.ps1            发布包（WEB_DEBUG 必须为 false）
#       .\build.ps1 -WebDebug  诊断包：临时打开 WebView 调试，输出 *-debug.apk，源码不改
param([switch]$WebDebug)
$ErrorActionPreference = "Stop"

# JDK 17+：设置 JAVA_HOME，或改成你的 JDK 目录（例如 Android Studio 自带的 jbr）
$JDK = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$SDK   = $(if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" })
$BT    = "$SDK\build-tools\36.0.0"
$PLAT  = "$SDK\platforms\android-37.0"
$AJAR  = "$PLAT\android.jar"
$JBR   = "$JDK\bin"
$PROJ  = $PSScriptRoot
$APP   = "$PROJ\app"
$B     = "$PROJ\build"

# 让 d8.bat / apksigner.bat / keytool 能找到 java
$env:JAVA_HOME = $JDK
$env:Path = "$JBR;$env:Path"

# 清理 + 建目录
$expectedBuild = [IO.Path]::GetFullPath((Join-Path $PROJ 'build'))
if ([IO.Path]::GetFullPath($B) -ne $expectedBuild) { throw "拒绝清理项目以外的目录" }
if (Test-Path -LiteralPath $B) { Remove-Item -LiteralPath $B -Recurse -Force }
New-Item -ItemType Directory -Force -Path $B,"$B\gen","$B\obj","$B\dex" | Out-Null

Write-Host "[1/7] 调试签名 debug.keystore（固定，不随 build 重建）"
$ks = "$PROJ\debug.keystore"
if (-not (Test-Path $ks)) {
    & "$JBR\keytool.exe" -genkeypair -v -keystore $ks -storepass android -keypass android `
        -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 `
        -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
    Write-Host "  （已新建固定签名）"
}

Write-Host "[2/7] aapt2 compile 资源"
$resDir = "$APP\res"
if ($WebDebug) {
    # 诊断包换个名字，桌面上和正式版分得清
    $resDir = "$B\res-debug"
    Copy-Item "$APP\res" $resDir -Recurse
    $str = "$resDir\values\strings.xml"
    [IO.File]::WriteAllText($str, ([IO.File]::ReadAllText($str).Replace('>校园电费<', '>校园电费调试<')))
}
& "$BT\aapt2.exe" compile --dir $resDir -o "$B\res.zip"
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile 失败" }

Write-Host "[3/7] aapt2 link（资源 + 本地界面 assets + R.java，版本号取自 manifest）"
$ver = ([xml](Get-Content "$APP\AndroidManifest.xml" -Raw -Encoding UTF8)).manifest.versionName
# 诊断包用独立包名 com.qlu.dianfei.debug：和正式版并存，装它不会覆盖正式版的账号和记录；Java 包名和 R 不变
$pkgArgs = if ($WebDebug) { @('--rename-manifest-package', 'com.qlu.dianfei.debug', '--custom-package', 'com.qlu.dianfei') } else { @() }
$manifest = "$APP\AndroidManifest.xml"
if ($WebDebug) {
    # 改包名不会改 provider 的授权名；两个版本授权名相同会装不上，诊断包改成「包名.share」
    $manifest = "$B\AndroidManifest.xml"
    [IO.File]::WriteAllText($manifest, ([IO.File]::ReadAllText("$APP\AndroidManifest.xml").Replace('"com.qlu.dianfei.share"', '"com.qlu.dianfei.debug.share"')))
}
& "$BT\aapt2.exe" link -o "$B\app.unaligned.apk" -I "$AJAR" `
    --manifest $manifest "$B\res.zip" -A "$APP\assets" `
    --java "$B\gen" --min-sdk-version 21 --target-sdk-version 34 @pkgArgs
if ($LASTEXITCODE -ne 0) { throw "aapt2 link 失败" }

Write-Host "[4/7] javac 编译 Java"
$srcDir = "$APP\src"
$mainSrc = "$srcDir\com\qlu\dianfei\MainActivity.java"
$debugLine = 'private static final boolean WEB_DEBUG = false;'
if (-not (Select-String -LiteralPath $mainSrc -SimpleMatch $debugLine -Quiet)) {
    throw "MainActivity.java 里的 WEB_DEBUG 不是 false：发布包不能开 WebView 调试。诊断请用 .\build.ps1 -WebDebug"
}
if ($WebDebug) {
    # 诊断包：在 build 目录里复制一份源码再打开调试开关，工作区源码保持 false
    $srcDir = "$B\src-debug"
    Copy-Item "$APP\src" $srcDir -Recurse
    $dbg = "$srcDir\com\qlu\dianfei\MainActivity.java"
    [IO.File]::WriteAllText($dbg, ([IO.File]::ReadAllText($dbg).Replace($debugLine, 'private static final boolean WEB_DEBUG = true;')))
    Write-Host "  （诊断包：WEB_DEBUG = true，勿发布）"
}
$srcs = @()
$srcs += (Get-ChildItem $srcDir -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$srcs += "$B\gen\com\qlu\dianfei\R.java"
& "$JBR\javac.exe" --release 17 -encoding UTF-8 -classpath "$AJAR" -d "$B\obj" $srcs
if ($LASTEXITCODE -ne 0) { throw "javac 失败" }

Write-Host "[5/7] jar + d8 转 dex"
& "$JBR\jar.exe" cf "$B\classes.jar" -C "$B\obj" .
& "$BT\d8.bat" --release --lib "$AJAR" --min-api 21 --output "$B\dex" "$B\classes.jar"
if ($LASTEXITCODE -ne 0) { throw "d8 失败" }

Write-Host "[6/7] 把 classes.dex 塞进 apk"
Copy-Item "$B\dex\classes.dex" "$B\classes.dex" -Force
Push-Location $B
& "$BT\aapt.exe" add "app.unaligned.apk" "classes.dex" | Out-Null
Pop-Location
if ($LASTEXITCODE -ne 0) { throw "aapt add dex 失败" }

Write-Host "[7/7] zipalign + 签名"
& "$BT\zipalign.exe" -f -p 4 "$B\app.unaligned.apk" "$B\app.aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "zipalign 失败" }
$out = if ($WebDebug) { "$B\校园电费-$ver-debug.apk" } else { "$B\校园电费-$ver.apk" }
& "$BT\apksigner.bat" sign --ks $ks --ks-pass pass:android --key-pass pass:android --out $out "$B\app.aligned.apk"
if ($LASTEXITCODE -ne 0) { throw "apksigner 失败" }

& "$BT\apksigner.bat" verify $out
if ($LASTEXITCODE -ne 0) { throw "签名验证失败" }
Write-Host ""
Write-Host "==== 打包完成 ===="
$f = Get-Item $out
Write-Host ("APK: {0}  ({1:N0} KB)" -f $f.FullName, ($f.Length/1KB))

