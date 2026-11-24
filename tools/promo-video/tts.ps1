param(
  [Parameter(Mandatory = $true)][string]$InDir,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Voice = 'Microsoft Haruka Desktop',
  [int]$Rate = 2
)
# 日本語ナレーション（Windows 標準の音声合成）。InDir の *.txt（UTF-8）を OutDir の *.wav に変換する。
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
foreach ($file in Get-ChildItem -Path $InDir -Filter *.txt) {
  $text = (Get-Content -Path $file.FullName -Raw -Encoding UTF8).Trim()
  if (-not $text) { throw "ナレーション文が空です: $($file.Name)" }
  $synth.SetOutputToWaveFile((Join-Path $OutDir ($file.BaseName + '.wav')))
  $synth.Speak($text)
  $synth.SetOutputToNull()
}
$synth.Dispose()
