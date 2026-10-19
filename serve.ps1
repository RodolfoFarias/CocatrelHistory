param([int]$Port = 8787)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot) + [System.IO.Path]::DirectorySeparatorChar
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "Coffee history preview: http://127.0.0.1:$Port"
$mimeTypes = @{ '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.csv' = 'text/csv; charset=utf-8'; '.jpg' = 'image/jpeg' }
try {
    while ($true) {
        $connection = $listener.AcceptTcpClient()
        $connection.ReceiveTimeout = 5000
        try {
            $stream = $connection.GetStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $request = $reader.ReadLine()
            if (-not $request) { continue }
            while ($reader.ReadLine()) { }
            $parts = $request.Split(' ')
            $relative = [uri]::UnescapeDataString(($parts[1] -split '\?')[0]).TrimStart('/')
            if (-not $relative) { $relative = 'index.html' }
            $path = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
            $extension = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
            $valid = $path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and $mimeTypes.ContainsKey($extension) -and (Test-Path -LiteralPath $path -PathType Leaf)
            if ($valid -and $parts[0] -eq 'GET') {
                $body = [System.IO.File]::ReadAllBytes($path)
                $status = '200 OK'
                $contentType = $mimeTypes[$extension]
            } else {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                $status = '404 Not Found'
                $contentType = 'text/plain'
            }
            $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nX-Content-Type-Options: nosniff`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
        } catch {
            Write-Warning $_.Exception.Message
        } finally {
            $connection.Dispose()
        }
    }
} finally {
    $listener.Stop()
}