param(
  [string]$OutputDirectory = '',
  [string]$ContainerImage = 'node:22-bookworm-slim'
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
npm ci --omit=dev --no-audit --no-fund
npm ls --omit=dev
node -e "require('sqlite3');require('sqlite');require('express');console.log('native-runtime-dependencies=ok')"
chmod +x ops/*.sh deploy/linux/*.sh
printf 'commit=%s\nbranch=%s\nbuilt_at=%s\nbuild_image=%s\narchitecture=linux-x64\n' \
  "$RELEASE_COMMIT" "$RELEASE_BRANCH" "$BUILD_TIMESTAMP" "$BUILD_IMAGE" > .deployed-release
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
    -e "SOURCE_EPOCH=$sourceEpoch" `
    $ContainerImage bash -lc $buildScript
  if ($LASTEXITCODE -ne 0) { throw 'La construcción Linux falló.' }
} finally {
  if (Test-Path -LiteralPath $sourceTar) { Remove-Item -LiteralPath $sourceTar -Force }
}

Write-Output "RELEASE_COMMIT=$commit"
Write-Output "RELEASE_BRANCH=$branch"
Write-Output "BUILD_IMAGE=$ContainerImage"
Write-Output "STAGING_PATH=$stageDirectory"
Write-Output "ARTIFACT_PATH=$artifact"
Write-Output "CHECKSUM_PATH=$checksum"
