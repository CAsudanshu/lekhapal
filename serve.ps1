# LekhaPal local launcher for Windows - developed by CA Sudanshu Mallick
# Serves this folder at http://localhost:8765 (only on this computer) and opens the browser. No internet needed.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$url = "http://localhost:$port/"
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript'; '.css'='text/css'; '.json'='application/json'; '.png'='image/png'; '.wasm'='application/wasm'; '.gz'='application/octet-stream'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.md'='text/plain' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try { $listener.Start() } catch {
  Write-Host "LekhaPal is ALREADY running in another black window." -ForegroundColor Yellow
  Write-Host "If you just installed a new version, close ALL LekhaPal black windows and start again." -ForegroundColor Yellow
  Start-Process $url; Start-Sleep -Seconds 8; exit }
Write-Host "LekhaPal is running at $url  (keep this window open; close it to stop)"
Start-Process $url
while ($listener.IsListening) {
  $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/')); if ($path -eq '') { $path = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file); $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
      $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $res.StatusCode = 404 }
  } catch { $res.StatusCode = 500 } finally { $res.Close() }
}
