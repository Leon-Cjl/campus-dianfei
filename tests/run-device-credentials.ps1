# 独立、无网络权限的测试 APK，验证真机 Keystore 与跨进程恢复；测试后卸载。
$ErrorActionPreference = 'Stop'
$P = Split-Path -Parent $PSScriptRoot
$W = Join-Path $P 'build\device-test'
# JDK 17+：设置 JAVA_HOME，或改成你的 JDK 目录（例如 Android Studio 自带的 jbr）
$JDK = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Android\Android Studio\jbr" }
$SDK = $(if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" })
$BT = Join-Path $SDK 'build-tools\36.0.0'
$AJAR = Join-Path $SDK 'platforms\android-37.0\android.jar'
$JBR = "$JDK\bin"
$ADB = Join-Path $SDK 'platform-tools\adb.exe'
$env:JAVA_HOME = $JDK
$env:Path = "$JBR;$env:Path"
New-Item -ItemType Directory -Force -Path $W,"$W\res","$W\obj","$W\dex" | Out-Null
@'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.qlu.dianfei.tests" android:versionCode="1" android:versionName="1">
  <uses-sdk android:minSdkVersion="23" android:targetSdkVersion="34" />
  <application android:label="电费凭据测试" android:testOnly="true" android:allowBackup="false" />
  <instrumentation android:name="com.qlu.dianfei.CredentialInstrumentation" android:targetPackage="com.qlu.dianfei.tests" />
</manifest>
'@ | Set-Content -LiteralPath "$W\AndroidManifest.xml" -Encoding utf8
& "$BT\aapt2.exe" link -o "$W\test.apk" -I $AJAR --manifest "$W\AndroidManifest.xml" --min-sdk-version 23 --target-sdk-version 34
if ($LASTEXITCODE -ne 0) { throw 'test aapt failed' }
& "$JBR\javac.exe" --release 17 -encoding UTF-8 -classpath $AJAR -d "$W\obj" "$P\app\src\com\qlu\dianfei\CredentialStore.java" "$P\tests\CredentialInstrumentation.java"
if ($LASTEXITCODE -ne 0) { throw 'test javac failed' }
& "$JBR\jar.exe" cf "$W\classes.jar" -C "$W\obj" .
& "$BT\d8.bat" --release --lib $AJAR --min-api 23 --output "$W\dex" "$W\classes.jar"
if ($LASTEXITCODE -ne 0) { throw 'test d8 failed' }
Copy-Item -LiteralPath "$W\dex\classes.dex" -Destination "$W\classes.dex" -Force
Push-Location $W
try { & "$BT\aapt.exe" add test.apk classes.dex | Out-Null } finally { Pop-Location }
& "$BT\zipalign.exe" -f -p 4 "$W\test.apk" "$W\aligned.apk"
& "$BT\apksigner.bat" sign --ks "$P\debug.keystore" --ks-pass pass:android --key-pass pass:android --out "$W\credentials-test.apk" "$W\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'test signing failed' }
$installed = $false
try {
    & $ADB install -r -t "$W\credentials-test.apk"
    if ($LASTEXITCODE -ne 0) { throw 'test installation failed' }
    $installed = $true
    foreach ($phase in @('save','reload')) {
        $result = & $ADB shell am instrument -w -e phase $phase com.qlu.dianfei.tests/com.qlu.dianfei.CredentialInstrumentation
        $result | Write-Output
        if ($LASTEXITCODE -ne 0 -or -not ($result -match 'PASS:') -or ($result -match 'FAIL:')) { throw "device credential test failed: $phase" }
    }
} finally {
    if ($installed) { & $ADB uninstall com.qlu.dianfei.tests }
}
