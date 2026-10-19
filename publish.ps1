$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot 'site'
[void][System.IO.Directory]::CreateDirectory((Join-Path $destination 'data'))
[void][System.IO.Directory]::CreateDirectory((Join-Path $destination 'assets'))
foreach ($file in @('index.html', 'app.js', 'styles.css')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $destination -Force
}
foreach ($file in @('coffee_prices.csv', 'summary.json')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "data\$file") -Destination (Join-Path $destination 'data') -Force
}
Copy-Item -Path (Join-Path $PSScriptRoot 'assets\*') -Destination (Join-Path $destination 'assets') -Force
$archive = Join-Path $PSScriptRoot 'cocatrel-site.zip'
Compress-Archive -Path (Join-Path $destination '*') -DestinationPath $archive -Force
Write-Host "Upload the contents of $destination to your static host, or use $archive. No build command is needed."