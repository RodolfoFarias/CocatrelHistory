# Cocatrel Coffee Price History

Daily API requests from May 3, 2021 (the supplied date is DD/MM/YYYY), through the requested end date, inclusive.

## GitHub Pages

O fluxo `.github/workflows/pages.yml` publica o site a cada envio para `main` ou `master`. No repositório, acesse **Settings > Pages > Build and deployment** e selecione **GitHub Actions** como origem. Em **Actions**, acompanhe o fluxo **Publicar no GitHub Pages** ou execute-o manualmente.

Após a primeira publicação bem-sucedida, o endereço esperado é `https://rodolfofarias.github.io/CocatrelHistory/`. O fluxo envia apenas HTML, CSS, JavaScript, imagens e os dois arquivos públicos de dados. As respostas brutas da API não são publicadas. Para atualizar as cotações, execute o downloader e envie as alterações dos dados ao repositório.

## Website

The static dashboard includes a date-range selector, quick periods, classification selection, before/after-ICMS prices, period statistics, recent records, and export of the filtered CSV. Flagged prices are excluded by default. Missing quotations remain gaps in the graph. Currency and price units are not inferred.

Preview locally in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\serve.ps1
```

Open `http://127.0.0.1:8787`. If that port is occupied, use `.\serve.ps1 -Port 8788`. Keep the terminal running. Opening the HTML directly will not work because browsers restrict loading local CSV files.

Create an upload package:

```powershell
.\publish.ps1
```

Upload the contents of `site/`, or extract `cocatrel-site.zip` into your hosting document root. Netlify manual deploy, GitHub Pages, Cloudflare Pages, and ordinary static hosting are supported; no Node.js, backend, environment variables, or build step is needed. Keep the relative folder structure. Only the two public data files are included, not the raw API archive. This project is not affiliated with or endorsed by Cocatrel.

For data updates, rerun the downloader, then rerun `publish.ps1` and upload the refreshed site. The page uses the saved dataset, not live API calls.

Chart.js 4.4.9, Papa Parse 5.5.3, and Lucide 0.468.0 are vendored in `assets/` with their license headers intact. The coffee photograph is from [Unsplash](https://unsplash.com/photos/1447933601403-0c6688de566e). Google Fonts are optional; the page has fallback fonts.

## Download or Update

Run in Windows PowerShell; no additional dependencies are required:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\download-history.ps1
```

The first command allows script execution only in the current PowerShell process; it does not change the saved execution policy.

The default end date is the computer's current date. To select it explicitly:

```powershell
.\download-history.ps1 -EndDate 2026-10-19
```

Downloads use up to four concurrent requests. Responses are cached by date, so interrupted downloads can resume. Unexpected failures are retried up to three times and retried again on the next run. Use `-Refresh` to fetch cached dates again.

## Files

- `data/coffee_prices.csv`: long-format data, one row per requested day and coffee classification. Use `date` for the horizontal axis, `price` or `price_with_icms` for the vertical axis, and `classification` for each series.
- `data/coffee_prices_wide.csv`: one row per requested day with a column for each classification, using prices before ICMS. Convenient for spreadsheet line charts. Check date-mismatch flags in the long-format file before using this view.
- `data/coverage.csv`: one entry for every requested calendar day, including dates without records and unexpected errors.
- `data/summary.json`: coverage counts, actual quotation date range, and data-quality counts.
- `data/raw/YYYY-MM-DD.json`: original parsed API response plus request date, URL, HTTP status, and retrieval timestamp.

Dates use ISO format (`YYYY-MM-DD`); decimal numbers use a period. CSV files use commas and UTF-8 with a BOM for spreadsheet compatibility.

## Data Caveats

The API returns HTTP 500 with `System.IndexOutOfRangeException` for some dates. These are labeled `no_data`, meaning the API could not provide a record, not proof that no quotation ever existed. Other failures are labeled `error`. Missing dates are not filled with zeros or interpolated; consult coverage when graphing to avoid silently connecting across gaps.

Prices of 1.00 appear in the source. They are retained unchanged and flagged with `review_price_at_or_below_one`; their meaning has not been confirmed. The source response does not explicitly state the currency or price unit, so these are not inferred. Both the requested date and the date returned for each quotation are preserved, with a mismatch flag.