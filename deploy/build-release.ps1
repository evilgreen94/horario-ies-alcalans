param(
  [string]$OutputDirectory = '',
  [string]$ContainerImage = 'node:22-bookworm-slim',
  [string]$MaximumGlibc = '2.35'
)

$ErrorActionPreference = 'Stop'

$repository = (& git rev-parse --show-toplevel).Trim()
if (-not $repository) { throw 'No se encontró la raíz Git.' }
Set-Location -LiteralPath $repository

$dirty = @(& git status --porcelain)
if ($dirty.Count -gt 0) { throw 'El árbol Git debe estar limpio antes de construir el release.' }

$commit = (& git rev-parse HEAD).Trim()
$shortCommit = (& git rev-parse --short=12 HEAD).Trim()
$branch = (& git branch --show-current).Trim()
$sourceEpoch = (& git show -s --format=%ct HEAD).Trim()
$buildTimestamp = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$nativeCheck = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(
  "require('sqlite3');require('sqlite');require('express');console.log('native-runtime-dependencies=ok')"
))

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $env:TEMP ("guardias-release-output-" + [guid]::NewGuid().ToString('N'))
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -ErrorAction Stop | Out-Null

$stageDirectory = Join-Path $OutputDirectory "guardias-release-$shortCommit"
$artifact = Join-Path $OutputDirectory "guardias-release-$shortCommit-linux-x64.tar.gz"
$checksum = "$artifact.sha256"
if ((Test-Path $stageDirectory) -or (Test-Path $artifact) -or (Test-Path $checksum)) {
  throw 'El destino de release ya contiene una salida con este commit.'
}

$sourceTar = Join-Path $OutputDirectory "source-$shortCommit.tar"
$paths = @(
  '.env.example',
  'package.json',
  'package-lock.json',
  'guardias.html',
  'app',
  'css',
  'imagenes',
  'js/app',
  'js/data/patio_guardias.js',
  'server',
  'ops',
  'deploy/linux',
  ':(exclude)server/tests',
  ':(exclude)server/scripts/run-tests.js',
  ':(exclude)server/scripts/create-local-teacher.js',
  ':(exclude)server/scripts/back _horarios'
)

try {
  & git archive --format=tar --output=$sourceTar $commit -- @paths
  if ($LASTEXITCODE -ne 0) { throw 'git archive falló.' }

  New-Item -ItemType Directory -Path $stageDirectory | Out-Null
  $sourceMount = "type=bind,source=$sourceTar,target=/input/source.tar,readonly"
  $outputMount = "type=bind,source=$OutputDirectory,target=/output"
  $stageName = Split-Path -Leaf $stageDirectory
  $artifactName = Split-Path -Leaf $artifact
  $buildScript = @'
set -euo pipefail
stage="/output/$STAGE_NAME"
tar -xf /input/source.tar -C "$stage"
cd "$stage"
apt-get update
apt-get install -y --no-install-recommends python3 make g++
rm -rf /var/lib/apt/lists/*
npm_config_build_from_source=true npm ci --omit=dev --no-audit --no-fund
npm ls --omit=dev
printf %s "$NATIVE_CHECK_B64" | base64 -d > .release-native-check.cjs
node .release-native-check.cjs
rm .release-native-check.cjs
sqlite_native=node_modules/sqlite3/build/Release/node_sqlite3.node
sqlite_glibc="$(grep -ao 'GLIBC_[0-9.]*' "$sqlite_native" | sed 's/^GLIBC_//' | sort -Vu | tail -1)"
test -n "$sqlite_glibc"
highest_glibc="$(printf '%s\n' "$sqlite_glibc" "$MAXIMUM_GLIBC" | sort -V | tail -1)"
if [ "$highest_glibc" != "$MAXIMUM_GLIBC" ]; then
  echo "sqlite3 requires GLIBC_$sqlite_glibc; maximum allowed is GLIBC_$MAXIMUM_GLIBC" >&2
  exit 1
fi
node_version="$(node --version)"
npm_version="$(npm --version)"
printf 'sqlite3-glibc-required=GLIBC_%s\n' "$sqlite_glibc"
chmod +x ops/*.sh deploy/linux/*.sh
printf 'commit=%s\nbranch=%s\nbuilt_at=%s\nbuild_image=%s\narchitecture=linux-x64\nnode=%s\nnpm=%s\nsqlite3_glibc_required=GLIBC_%s\nglibc_compatibility_max=GLIBC_%s\n' \
  "$RELEASE_COMMIT" "$RELEASE_BRANCH" "$BUILD_TIMESTAMP" "$BUILD_IMAGE" \
  "$node_version" "$npm_version" "$sqlite_glibc" "$MAXIMUM_GLIBC" > .deployed-release
tar --sort=name --mtime="@$SOURCE_EPOCH" --owner=0 --group=0 --numeric-owner -cf - . | gzip -n > "/output/$ARTIFACT_NAME"
cd /output
sha256sum "$ARTIFACT_NAME" > "$ARTIFACT_NAME.sha256"
'@

  & docker run --rm --platform linux/amd64 `
    --mount $sourceMount `
    --mount $outputMount `
    -e "STAGE_NAME=$stageName" `
    -e "ARTIFACT_NAME=$artifactName" `
    -e "RELEASE_COMMIT=$commit" `
    -e "RELEASE_BRANCH=$branch" `
    -e "BUILD_TIMESTAMP=$buildTimestamp" `
    -e "BUILD_IMAGE=$ContainerImage" `
    -e "MAXIMUM_GLIBC=$MaximumGlibc" `
    -e "SOURCE_EPOCH=$sourceEpoch" `
    -e "NATIVE_CHECK_B64=$nativeCheck" `
    $ContainerImage bash -lc $buildScript
  if ($LASTEXITCODE -ne 0) { throw 'La construcción Linux falló.' }
} finally {
  if (Test-Path -LiteralPath $sourceTar) { Remove-Item -LiteralPath $sourceTar -Force }
}

Write-Output "RELEASE_COMMIT=$commit"
Write-Output "RELEASE_BRANCH=$branch"
Write-Output "BUILD_IMAGE=$ContainerImage"
Write-Output "MAXIMUM_GLIBC=$MaximumGlibc"
Write-Output "STAGING_PATH=$stageDirectory"
Write-Output "ARTIFACT_PATH=$artifact"
Write-Output "CHECKSUM_PATH=$checksum"
