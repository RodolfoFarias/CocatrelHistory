param(
    [datetime]$StartDate = [datetime]'2021-05-03',
    [datetime]$EndDate = (Get-Date).Date,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'data'),
    [ValidateRange(1, 8)][int]$Concurrency = 4,
    [switch]$Refresh,
    [switch]$Incremental,
    [ValidateRange(1, 365)][int]$RecheckDays = 7
)

$ErrorActionPreference = 'Stop'
if ($EndDate.Date -lt $StartDate.Date) { throw 'EndDate precedes StartDate.' }
Add-Type -AssemblyName System.Net.Http
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$rawDirectory = Join-Path $OutputDirectory 'raw'
[void][System.IO.Directory]::CreateDirectory($rawDirectory)
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [timespan]::FromSeconds(45)
$client.DefaultRequestHeaders.Accept.ParseAdd('application/json')
$pending = New-Object 'System.Collections.Generic.List[object]'
$records = New-Object 'System.Collections.Generic.List[object]'
$coverage = New-Object 'System.Collections.Generic.List[object]'
$nextDate = $StartDate.Date
$total = ($EndDate.Date - $StartDate.Date).Days + 1
$completed = 0
$recheckFrom = $EndDate.Date.AddDays(1 - $RecheckDays).ToString('yyyy-MM-dd', $culture)
$retainedDates = New-Object 'System.Collections.Generic.HashSet[string]'
$pricesPath = Join-Path $OutputDirectory 'coffee_prices.csv'
$coveragePath = Join-Path $OutputDirectory 'coverage.csv'
if ($Incremental -and -not $Refresh -and (Test-Path $pricesPath) -and (Test-Path $coveragePath)) {
    $startKey = $StartDate.Date.ToString('yyyy-MM-dd', $culture)
    foreach ($day in (Import-Csv -LiteralPath $coveragePath)) {
        if ($day.requested_date -ge $startKey -and $day.requested_date -lt $recheckFrom -and $day.status -in @('ok', 'no_data', 'empty')) {
            [void]$retainedDates.Add($day.requested_date)
            $coverage.Add($day)
        }
    }
    foreach ($record in (Import-Csv -LiteralPath $pricesPath)) {
        if ($retainedDates.Contains($record.requested_date)) { $records.Add($record) }
    }
    Write-Host ("Reusing {0} saved days; rechecking recent dates from {1}." -f $retainedDates.Count, $recheckFrom)
}

try {
    while ($nextDate -le $EndDate.Date -or $pending.Count -gt 0) {
        while ($nextDate -le $EndDate.Date -and $pending.Count -lt $Concurrency) {
            $dateKey = $nextDate.ToString('yyyy-MM-dd', $culture)
            if ($retainedDates.Contains($dateKey)) {
                $completed++
                $nextDate = $nextDate.AddDays(1)
                continue
            }
            $path = Join-Path $rawDirectory ($dateKey + '.json')
            $url = 'https://portal.cocatrel.com.br/api/v1/cafe/mercado/dia?DataCotacao=' + [uri]::EscapeDataString($nextDate.ToString('dd/MM/yyyy', $culture))
            $cached = $null
            if ((Test-Path $path) -and -not $Refresh -and -not ($Incremental -and $dateKey -ge $recheckFrom)) {
                $cached = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
                if ($cached.http_status -ne 200 -and $cached.body.ExceptionType -ne 'System.IndexOutOfRangeException') { $cached = $null }
            }
            $task = $null
            if ($null -eq $cached) { $task = $client.GetAsync($url) }
            $pending.Add([pscustomobject]@{ Date = $dateKey; Path = $path; Url = $url; Task = $task; Cached = $cached })
            $nextDate = $nextDate.AddDays(1)
        }

        if ($pending.Count -eq 0) { continue }
        $item = $pending[0]
        $pending.RemoveAt(0)
        $envelope = $item.Cached
        if ($null -eq $envelope) {
            for ($attempt = 1; $attempt -le 3; $attempt++) {
                $response = $null
                try {
                    if ($attempt -gt 1) { $item.Task = $client.GetAsync($item.Url) }
                    $response = $item.Task.GetAwaiter().GetResult()
                    $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                    $body = $null
                    try { $body = $content | ConvertFrom-Json } catch { $body = $content }
                    $envelope = [pscustomobject]@{
                        requested_date = $item.Date
                        url = $item.Url
                        retrieved_at_utc = [datetime]::UtcNow.ToString('o')
                        http_status = [int]$response.StatusCode
                        body = $body
                    }
                    if ($response.IsSuccessStatusCode -or $body.ExceptionType -eq 'System.IndexOutOfRangeException') { break }
                } catch {
                    $envelope = [pscustomobject]@{
                        requested_date = $item.Date
                        url = $item.Url
                        retrieved_at_utc = [datetime]::UtcNow.ToString('o')
                        http_status = 0
                        body = [pscustomobject]@{ Message = $_.Exception.Message }
                    }
                } finally {
                    if ($null -ne $response) { $response.Dispose() }
                }
            }
            $envelope | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $item.Path -Encoding UTF8
        }

        $status = 'error'
        $message = ''
        $quotes = @()
        if ($envelope.http_status -eq 200 -and $null -ne $envelope.body.CotacaoCafe) {
            $quotes = @($envelope.body.CotacaoCafe)
            $status = 'ok'
            if ($quotes.Count -eq 0) { $status = 'empty' }
            foreach ($quote in $quotes) {
                $quoteDate = ([datetime]$quote.DataCotacao).ToString('yyyy-MM-dd', $culture)
                $records.Add([pscustomobject]@{
                    requested_date = $item.Date
                    date = $quoteDate
                    classification = $quote.Classificacao
                    price = ([decimal]$quote.ValorCotacao).ToString($culture)
                    price_with_icms = ([decimal]$quote.ValorCotacaoComICMS).ToString($culture)
                    date_matches_request = ($quoteDate -eq $item.Date)
                    review_price_at_or_below_one = ([decimal]$quote.ValorCotacao -le 1)
                    background_color = $quote.CodigoCorFundo
                    text_color = $quote.CodigoCorTexto
                })
            }
        } elseif ($envelope.body.ExceptionType -eq 'System.IndexOutOfRangeException') {
            $status = 'no_data'
            $message = $envelope.body.ExceptionMessage
        } else {
            $message = $envelope.body | ConvertTo-Json -Depth 30 -Compress
        }
        $coverage.Add([pscustomobject]@{
            requested_date = $item.Date
            status = $status
            http_status = $envelope.http_status
            quote_count = $quotes.Count
            message = $message
        })
        $completed++
        if ($completed % 50 -eq 0 -or $completed -eq $total) {
            Write-Host ("Processed {0}/{1} days; {2} quotations" -f $completed, $total, $records.Count)
        }
    }
} finally {
    $client.Dispose()
}

$records = @($records | Sort-Object requested_date, classification)
$coverage = @($coverage | Sort-Object requested_date)
if ($Incremental -and (@($coverage | Where-Object status -eq 'error').Count -gt 0 -or $records.Count -eq 0)) {
    throw 'Incremental update failed. Existing CSV files were not changed; rerun to retry the requests.'
}
$records | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'coffee_prices.csv') -NoTypeInformation -Encoding UTF8
$coverage | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'coverage.csv') -NoTypeInformation -Encoding UTF8
$classifications = @($records | Select-Object -ExpandProperty classification -Unique | Sort-Object)
$wide = foreach ($group in ($records | Group-Object requested_date)) {
    $row = [ordered]@{ date = $group.Name }
    foreach ($classification in $classifications) {
        $quote = $group.Group | Where-Object classification -eq $classification | Select-Object -First 1
        $row[$classification] = $quote.price
    }
    [pscustomobject]$row
}
$wide | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'coffee_prices_wide.csv') -NoTypeInformation -Encoding UTF8
$summary = [ordered]@{
    source = 'https://portal.cocatrel.com.br/api/v1/cafe/mercado/dia'
    start_date = $StartDate.ToString('yyyy-MM-dd', $culture)
    end_date = $EndDate.ToString('yyyy-MM-dd', $culture)
    generated_at_utc = [datetime]::UtcNow.ToString('o')
    requested_days = $total
    days_with_quotes = @($coverage | Where-Object status -eq 'ok').Count
    days_without_records = @($coverage | Where-Object status -eq 'no_data').Count
    empty_days = @($coverage | Where-Object status -eq 'empty').Count
    failed_days = @($coverage | Where-Object status -eq 'error').Count
    quotation_rows = $records.Count
    classifications = $classifications
    earliest_quote_date = ($records | Measure-Object -Property date -Minimum).Minimum
    latest_quote_date = ($records | Measure-Object -Property date -Maximum).Maximum
    rows_with_date_mismatch = @($records | Where-Object { [string]$_.date_matches_request -eq 'False' }).Count
    rows_with_price_at_or_below_one = @($records | Where-Object { [string]$_.review_price_at_or_below_one -eq 'True' }).Count
}
$summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'summary.json') -Encoding UTF8
$summary | ConvertTo-Json -Depth 10 | Write-Host
if ($summary.failed_days -gt 0) { Write-Warning 'Some requests failed. Rerun to retry them; see coverage.csv.' }