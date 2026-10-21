param(
    [string]$SdkRoot = $(if ($env:EMSDK) { $env:EMSDK } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) 'emsdk' }),
    [switch]$Check,
    [switch]$SkipRust
)
$ErrorActionPreference = 'Stop'
if ($SkipRust -and -not $Check) { throw '-SkipRust is only supported with -Check; production builds must rebuild the Rust UI.' }
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$project = $PSScriptRoot
$python = Join-Path $SdkRoot 'python\3.13.3_64bit\python.exe'
$emcc = Join-Path $SdkRoot 'upstream\emscripten\emcc.py'
foreach ($tool in @($python, $emcc, (Join-Path $SdkRoot '.emscripten'))) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw ('Missing Emscripten tool: ' + $tool) }
}
$build = Join-Path $project 'build'
$temporary = Join-Path $project '.local\web-build'
$localTemp = Join-Path $project '.local\temp'
New-Item -ItemType Directory -Force -Path $build,$temporary,$localTemp | Out-Null
$oldEnvironment = @{}
$settings = @{
    EM_CONFIG = (Join-Path $SdkRoot '.emscripten')
    EMSDK_PYTHON = $python
    EM_CACHE = (Join-Path $project '.local\em-cache')
    PYTHONDONTWRITEBYTECODE = '1'
    TEMP = $localTemp
    TMP = $localTemp
    TMPDIR = $localTemp
}
foreach ($name in $settings.Keys) {
    $oldEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
}
try {
    & $python (Join-Path $project 'tools\compile-locales.py')
    if ($LASTEXITCODE -ne 0) { throw 'Brogue locale generation failed' }
    $compilerArguments = [Collections.Generic.List[string]]::new()
    foreach ($directory in @('src\brogue','src\variants')) {
        foreach ($source in (Get-ChildItem -LiteralPath (Join-Path $project $directory) -Filter '*.c' -File | Sort-Object Name)) {
            $compilerArguments.Add($source.FullName)
        }
    }
    foreach ($source in @('main','platformdependent','null-platform','browser-platform')) {
        $compilerArguments.Add((Join-Path $project ('src\platform\' + $source + '.c')))
    }
    $exports = @('_main','_malloc','_free')
    $outputName = if ($Check) { 'game-check' } else { 'game' }
    $compilerArguments.Add('-Wl,-Map,' + (Join-Path $temporary ($outputName + '.map')))
    if ($Check) {
        $compilerArguments.Add('-DBROGUE_BROWSER_CHECK')
        $compilerArguments.Add((Join-Path $project 'tests\fixtures.c'))
        $exports += '_brogue_check_snapshot','_brogue_check_fixture','_brogue_check_features'
    }
    foreach ($flag in @('-std=c11','-O1','-fwrapv','-fno-strict-aliasing','-DBROGUE_BROWSER','-DDATADIR=.','-DBROGUE_EXTRA_VERSION=""','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=131072','-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=8388608','-sINITIAL_MEMORY=67108864','-sASSERTIONS=1','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createBrogue','-sENVIRONMENT=web,worker,node','-sINVOKE_RUN=0','-sEXIT_RUNTIME=0','-sFILESYSTEM=1')) {
        $compilerArguments.Add($flag)
    }
    foreach ($directory in @('src\brogue','src\platform','src\variants')) { $compilerArguments.Add('-I' + (Join-Path $project $directory)) }
    $compilerArguments.Add('-sEXPORTED_FUNCTIONS=' + (ConvertTo-Json -Compress -InputObject $exports))
    $compilerArguments.Add('-sEXPORTED_RUNTIME_METHODS=["callMain","FS","UTF8ToString"]')
    $compilerArguments.Add('-sINCOMING_MODULE_JS_API=["print","printErr","locateFile","onRuntimeInitialized","onAbort","noInitialRun","wasmBinary"]')
    $compilerArguments.Add('--js-library')
    $compilerArguments.Add((Join-Path $project 'web\library.js'))
    $compilerArguments.Add('-o')
    $compilerArguments.Add((Join-Path $temporary ($outputName + '.js')))
    & $python $emcc @compilerArguments
    if ($LASTEXITCODE -ne 0) { throw 'Brogue C/Wasm compilation failed' }
    if (-not $SkipRust) {
        & cargo build --offline --locked --manifest-path (Join-Path $project 'rust\Cargo.toml') --release --target wasm32-unknown-unknown
        if ($LASTEXITCODE -ne 0) { throw 'Brogue Rust browser compilation failed' }
        $rustTarget = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $project 'rust\target' }
        & $python (Join-Path $project 'tools\bind-browser.py') (Join-Path $rustTarget 'wasm32-unknown-unknown\release\brogue_browser_ui.wasm') $temporary
        if ($LASTEXITCODE -ne 0) { throw 'Brogue Rust browser build failed' }
    }
    $inputFiles = @((Get-ChildItem -LiteralPath (Join-Path $project 'src') -Recurse -File | Where-Object { $_.Extension -in '.c','.h' }).FullName)
    $inputFiles += @((Get-ChildItem -LiteralPath (Join-Path $project 'locales\ja') -File -Filter '*.json').FullName)
    $inputFiles += @((Join-Path $project 'web\library.js'),(Join-Path $project 'build-web.ps1'),(Join-Path $project 'tools\compile-locales.py'),(Join-Path $project 'tools\locale-source.py'))
    $inputFiles += @('web\index.html','web\host.js','web\style.css','web\assets\illustrations.json','web\assets\fonts\metadata.json') | ForEach-Object { Join-Path $project $_ }
    if ($Check) { $inputFiles += (Join-Path $project 'tests\fixtures.c') }
    foreach ($rustRoot in @((Join-Path $project 'rust'),(Join-Path (Split-Path -Parent $project) 'rust-common'))) {
        $inputFiles += @((Get-ChildItem -LiteralPath $rustRoot -Recurse -File | Where-Object {
            $_.FullName -notmatch '[\\/]target[\\/]' -and ($_.Extension -eq '.rs' -or $_.Name -in 'Cargo.toml','Cargo.lock')
        }).FullName)
    }
    $inputRecords = @($inputFiles | Sort-Object -Unique | ForEach-Object {
        # Git source blobs use LF even when a Windows checkout uses CRLF.
        # Normalize only CRLF pairs; output and notice hashes remain byte-exact.
        $canonicalSource = [Text.Encoding]::UTF8.GetBytes([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($_)).Replace("`r`n", "`n"))
        $sourceHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($canonicalSource)).ToLowerInvariant()
        [ordered]@{ file=[IO.Path]::GetRelativePath($project,$_).Replace('\','/'); sha256=$sourceHash }
    })
    $outputs = @(($outputName + '.js'),($outputName + '.wasm'))
    if (-not $Check) { $outputs += 'browser-ui.js','browser-ui.wasm' }
    $outputRecords = @($outputs | ForEach-Object {
        $outputFile = Join-Path $temporary $_
        [ordered]@{file=$_;bytes=(Get-Item -LiteralPath $outputFile).Length;sha256=(Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
    $assetRecords = @('web\assets\dot-tiles.png','web\assets\illustrations.png','web\assets\fonts\NotoSansJP.ttf','web\assets\fonts\NotoColorEmoji.ttf') | ForEach-Object {
        $assetFile = Join-Path $project $_
        [ordered]@{file=$_.Replace('\','/');bytes=(Get-Item -LiteralPath $assetFile).Length;sha256=(Get-FileHash -LiteralPath $assetFile -Algorithm SHA256).Hash.ToLowerInvariant()}
    }
    $manifest = [ordered]@{
        format=1; game='brogue-ce-1.15.1'; test_hooks=[bool]$Check; source_eol='LF'
        compiler=((& $python $emcc --version | Select-Object -First 1) -join '')
        rust=((& rustc --version) -join '')
        source_inputs=$inputRecords; asset_inputs=@($assetRecords); c_arguments=@($compilerArguments | Where-Object { $_ -like '-*' -and $_ -notlike '-IC:*' } | ForEach-Object { $_.Replace($project,'.') }); outputs=$outputRecords
    }
    $manifestName = if ($Check) { 'build-manifest-check.json' } else { 'build-manifest.json' }
    [IO.File]::WriteAllText((Join-Path $temporary $manifestName),(ConvertTo-Json -Depth 8 -InputObject $manifest) + "`n",[Text.UTF8Encoding]::new($false))
    foreach ($output in @($outputs) + @($manifestName)) {
        Copy-Item -LiteralPath (Join-Path $temporary $output) -Destination (Join-Path $build $output) -Force
    }
    Write-Output ('Built Brogue Web ' + $outputName + ' (C game logic; Asyncify browser I/O)')
} finally {
    foreach ($name in $oldEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $oldEnvironment[$name], 'Process') }
}
