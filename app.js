/* global Chart, Papa, lucide */
'use strict';

const palette = ['#167353', '#d98b29', '#4c83b6', '#b75c79', '#7b7930', '#815ca0', '#309b9e', '#d3674a', '#617c3a', '#5065a5', '#bd8b4e', '#8e6f7d', '#37946c', '#b14f4f', '#728aab', '#a0822a'];
const numberFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const shortDateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const element = (id) => document.getElementById(id);
const formatDate = (date) => dateFormat.format(new Date(`${date}T00:00:00Z`));
let rows = [];
let summary;
let chart;
let filteredRows = [];
let classifications = [];
const selected = new Set(['COC 01']);

function dateKeys(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function setPeriod(period) {
  const end = summary.latest_quote_date;
  const cursor = new Date(`${end}T00:00:00Z`);
  if (period === 'all') {
    element('start-date').value = summary.start_date;
  } else {
    const originalDay = cursor.getUTCDate();
    cursor.setUTCDate(1);
    cursor.setUTCMonth(cursor.getUTCMonth() - Number(period));
    const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
    cursor.setUTCDate(Math.min(originalDay, lastDay));
    element('start-date').value = cursor.toISOString().slice(0, 10) < summary.start_date ? summary.start_date : cursor.toISOString().slice(0, 10);
  }
  element('end-date').value = end;
  document.querySelectorAll('[data-period]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.period === String(period))));
  render();
}

function renderMetrics(priceKey) {
  const primary = classifications.find((classification) => selected.has(classification));
  const series = filteredRows.filter((row) => row.classification === primary);
  element('latest-label').textContent = primary ? `Última cotação / ${primary}` : 'Última cotação';
  element('price-change').className = '';
  if (series.length === 0) {
    ['latest-price', 'price-change', 'period-low', 'period-high', 'latest-date', 'change-context', 'low-date', 'high-date'].forEach((id) => { element(id).textContent = '--'; });
    return;
  }
  const first = series[0];
  const latest = series[series.length - 1];
  const low = series.reduce((minimum, row) => row[priceKey] < minimum[priceKey] ? row : minimum);
  const high = series.reduce((maximum, row) => row[priceKey] > maximum[priceKey] ? row : maximum);
  element('latest-price').textContent = numberFormat.format(latest[priceKey]);
  element('latest-date').textContent = formatDate(latest.date);
  const change = first[priceKey] === 0 ? null : ((latest[priceKey] - first[priceKey]) / first[priceKey]) * 100;
  element('price-change').textContent = change === null ? '--' : `${change >= 0 ? '+' : ''}${numberFormat.format(change)}%`;
  element('price-change').className = change === null ? '' : change >= 0 ? 'positive' : 'negative';
  element('change-context').textContent = `Desde ${formatDate(first.date)}`;
  element('period-low').textContent = numberFormat.format(low[priceKey]);
  element('period-high').textContent = numberFormat.format(high[priceKey]);
  element('low-date').textContent = formatDate(low.date);
  element('high-date').textContent = formatDate(high.date);
}

function render() {
  const start = element('start-date').value;
  const end = element('end-date').value;
  const error = !start || !end ? 'Selecione a data inicial e a data final.' : start > end ? 'A data inicial deve ser anterior ou igual à data final.' : start < summary.start_date || end > summary.end_date ? `Selecione datas entre ${formatDate(summary.start_date)} e ${formatDate(summary.end_date)}.` : '';
  element('range-error').textContent = error;
  element('range-error').hidden = !error;
  element('start-date').setAttribute('aria-invalid', String(Boolean(error)));
  element('end-date').setAttribute('aria-invalid', String(Boolean(error)));
  if (error) {
    element('export').disabled = true;
    return;
  }
  const includeFlagged = element('include-flagged').checked;
  const priceKey = element('icms').checked ? 'price_with_icms' : 'price';
  filteredRows = rows.filter((row) => row.date >= start && row.date <= end && selected.has(row.classification) && (includeFlagged || !row.flagged));
  const dates = dateKeys(start, end);
  const datasets = classifications.filter((classification) => selected.has(classification)).map((classification) => {
    const prices = new Map(filteredRows.filter((row) => row.classification === classification).map((row) => [row.date, row[priceKey]]));
    const color = palette[classifications.indexOf(classification) % palette.length];
    return { label: classification, data: dates.map((date) => prices.get(date) ?? null), borderColor: color, backgroundColor: color, borderWidth: 1.8, pointRadius: dates.length <= 14 ? 3 : 0, pointHoverRadius: 4, pointHitRadius: 12, tension: 0, spanGaps: false };
  });
  chart.data = { labels: dates, datasets };
  chart.update('none');
  element('price-chart').setAttribute('aria-label', `${selected.size} ${selected.size === 1 ? 'classificação' : 'classificações'} de café, de ${formatDate(start)} a ${formatDate(end)}, ${filteredRows.length.toLocaleString('pt-BR')} ${filteredRows.length === 1 ? 'cotação' : 'cotações'}${element('icms').checked ? ', com ICMS' : ', sem ICMS'}`);
  element('chart-range').textContent = `${formatDate(start)} a ${formatDate(end)}`;
  const quotationDays = new Set(filteredRows.map((row) => row.date)).size;
  element('observation-count').textContent = `${quotationDays.toLocaleString('pt-BR')} ${quotationDays === 1 ? 'dia com cotação' : 'dias com cotação'}`;
  element('empty-state').hidden = filteredRows.length > 0;
  element('empty-message').textContent = selected.size === 0 ? 'Selecione pelo menos uma classificação.' : 'Não há registros disponíveis para as datas e os filtros selecionados.';
  element('export').disabled = filteredRows.length === 0;
  element('select-all').textContent = selected.size === classifications.length ? 'Limpar seleção' : 'Selecionar todas';
  renderMetrics(priceKey);
  const recent = [...filteredRows].sort((first, second) => second.date.localeCompare(first.date) || first.classification.localeCompare(second.classification)).slice(0, 10);
  element('records-caption').textContent = `${recent.length} de ${filteredRows.length.toLocaleString('pt-BR')} ${filteredRows.length === 1 ? 'registro' : 'registros'}`;
  element('records-body').replaceChildren();
  if (recent.length === 0) {
    const tableRow = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'Nenhum registro nesta seleção.';
    tableRow.append(cell);
    element('records-body').append(tableRow);
  }
  recent.forEach((row) => {
    const tableRow = document.createElement('tr');
    [formatDate(row.date), row.classification, numberFormat.format(row.price), numberFormat.format(row.price_with_icms)].forEach((value, index) => {
      const cell = document.createElement('td');
      if (index === 1) {
        const indicator = document.createElement('span');
        indicator.className = 'series-indicator';
        indicator.style.setProperty('--series-color', palette[classifications.indexOf(row.classification) % palette.length]);
        cell.append(indicator);
      }
      cell.append(document.createTextNode(value));
      tableRow.append(cell);
    });
    element('records-body').append(tableRow);
  });
}

async function initialize() {
  try {
    if (typeof Chart === 'undefined' || typeof Papa === 'undefined') { throw new Error('Não foi possível carregar as bibliotecas do gráfico.'); }
    const responses = await Promise.all([fetch('data/coffee_prices.csv'), fetch('data/summary.json')]);
    if (responses.some((response) => !response.ok)) { throw new Error('Não foi possível carregar os dados de mercado.'); }
    const csv = await responses[0].text();
    summary = await responses[1].json();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0) { throw new Error('Não foi possível ler o CSV de cotações.'); }
    rows = parsed.data.map((row) => ({ date: row.date, classification: row.classification, price: Number(row.price), price_with_icms: Number(row.price_with_icms), flagged: row.review_price_at_or_below_one.toLowerCase() === 'true' })).sort((first, second) => first.date.localeCompare(second.date));
    if (rows.length === 0 || rows.some((row) => !Number.isFinite(row.price) || !Number.isFinite(row.price_with_icms))) { throw new Error('O arquivo de cotações está vazio ou contém preços inválidos.'); }
    classifications = [...new Set(rows.map((row) => row.classification))].sort();
    classifications.forEach((classification, index) => {
      const label = document.createElement('label');
      label.className = 'classification-option';
      label.style.setProperty('--series-color', palette[index % palette.length]);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = classification;
      input.checked = selected.has(classification);
      input.addEventListener('change', () => { if (input.checked) { selected.add(classification); } else { selected.delete(classification); } render(); });
      label.append(input, document.createTextNode(classification));
      element('classification-list').append(label);
    });
    ['start-date', 'end-date'].forEach((id) => {
      element(id).min = summary.start_date;
      element(id).max = summary.end_date;
      element(id).addEventListener('change', () => { document.querySelectorAll('[data-period]').forEach((button) => button.setAttribute('aria-pressed', 'false')); render(); });
    });
    Chart.defaults.font.family = "'DM Sans', sans-serif";
    Chart.defaults.color = '#829086';
    chart = new Chart(element('price-chart'), {
      type: 'line', data: { labels: [], datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        locale: 'pt-BR',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#203b30', padding: 12, cornerRadius: 4, displayColors: true, callbacks: { title: (items) => items.length ? formatDate(items[0].label) : '', label: (context) => `${context.dataset.label}: ${numberFormat.format(context.parsed.y)}${element('icms').checked ? ' (com ICMS)' : ''}` } } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0, font: { size: 10 }, callback: function(value) { const label = this.getLabelForValue(value); return shortDateFormat.format(new Date(`${label}T00:00:00Z`)); } } },
          y: { border: { display: false }, grid: { color: '#edf1ee', drawTicks: false }, ticks: { count: 5, padding: 12, font: { size: 10 }, callback: (value) => Number(value).toLocaleString('pt-BR') } }
        }
      }
    });
    document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', () => setPeriod(button.dataset.period)));
    ['icms', 'include-flagged'].forEach((id) => element(id).addEventListener('change', render));
    element('select-all').addEventListener('click', () => {
      const clear = selected.size === classifications.length;
      selected.clear();
      if (!clear) { classifications.forEach((classification) => selected.add(classification)); }
      document.querySelectorAll('#classification-list input').forEach((input) => { input.checked = selected.has(input.value); });
      render();
    });
    element('export').addEventListener('click', () => {
      const content = Papa.unparse(filteredRows.map((row) => ({ Data: formatDate(row.date), 'Classificação': row.classification, 'Preço': row.price.toFixed(2).replace('.', ','), 'Preço com ICMS': row.price_with_icms.toFixed(2).replace('.', ','), 'Preço sinalizado': row.flagged ? 'Sim' : 'Não' })), { delimiter: ';' });
      const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `cotacoes_cocatrel_${element('start-date').value}_${element('end-date').value}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    element('archive-description').textContent = `${formatDate(summary.start_date)} a ${formatDate(summary.latest_quote_date)} / ${classifications.length} classificações`;
    element('coverage-note').textContent = `Última cotação disponível: ${formatDate(summary.latest_quote_date)}. Consulta realizada até ${formatDate(summary.end_date)}. A fonte não retornou registros para ${summary.days_without_records.toLocaleString('pt-BR')} das ${summary.requested_days.toLocaleString('pt-BR')} datas consultadas. Datas sem cotação aparecem como lacunas, não como preços iguais a zero. ${summary.rows_with_price_at_or_below_one} preços menores ou iguais a 1 são excluídos por padrão. A fonte não informa a moeda nem a unidade de preço.`;
    element('load-status').hidden = true;
    element('app').hidden = false;
    setPeriod('12');
    if (typeof lucide !== 'undefined') { lucide.createIcons(); }
  } catch (error) {
    element('load-status').textContent = `Não foi possível carregar o histórico de cotações. ${error.message} Atualize a página para tentar novamente.`;
    element('load-status').setAttribute('role', 'alert');
  }
}

initialize();