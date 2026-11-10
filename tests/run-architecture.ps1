$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$destination=Join-Path $projectRoot 'build/architecture-tests'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$source=Join-Path $projectRoot 'app/src/com/qlu/dianfei'
& "$env:JAVA_HOME/bin/javac.exe" -encoding UTF-8 -d $destination "$PSScriptRoot/unit/android/os/Handler.java" "$source/LatestSnapshot.java" "$source/ElectricityViewModel.java" "$source/SchoolPagePolicy.java" "$source/SchoolNavigationPolicy.java" "$PSScriptRoot/ArchitectureTest.java"
if($LASTEXITCODE -ne 0){throw 'Architecture tests compilation failed'}
& "$env:JAVA_HOME/bin/java.exe" -cp $destination com.qlu.dianfei.ArchitectureTest
if($LASTEXITCODE -ne 0){throw 'Architecture tests failed'}
