document.addEventListener('DOMContentLoaded', function () {

  const EMISSION_FACTOR = (2.931 * Math.pow(10, -4) * 0.18293) / 1000;

  const $ = (sel) => document.querySelector(sel);

  // ── Steam table helpers ───────────────────────────────────────────────────
  let steamPsi = [], steamHg = [];
  if (typeof steamLeakData !== 'undefined' && steamLeakData && steamLeakData.steamTable &&
    Array.isArray(steamLeakData.steamTable.psi) && Array.isArray(steamLeakData.steamTable.hg)) {
    steamPsi = steamLeakData.steamTable.psi;
    steamHg = steamLeakData.steamTable.hg;
  }

  function lookupHg(p) {
    if (!steamPsi.length || !steamHg.length) return 1190;
    if (p <= steamPsi[0]) return steamHg[0];
    const last = steamPsi.length - 1;
    if (p >= steamPsi[last]) return steamHg[last];
    let lo = 0, hi = last;
    while (lo <= hi) {
      const m = (lo + hi) >> 1, v = steamPsi[m];
      if (v === p) return steamHg[m];
      if (v < p) lo = m + 1; else hi = m - 1;
    }
    return steamHg[hi];
  }

  function getSteamLoss(season, pressure, length) {
    const d = steamLeakData[season];
    if (!d) return null;
    const P = Math.floor(pressure), L = Math.floor(length);
    const r = d.plume_lengths.indexOf(L), c = d.pressures.indexOf(P);
    if (r === -1 || c === -1) return null;
    return d.loss_data[r][c];
  }

  // ── Formatting ────────────────────────────────────────────────────────────
  function fmt(n, d = 2) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtCost(n) {
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1000) return '$' + Math.round(n).toLocaleString();
    return '$' + n.toFixed(0);
  }

  function fmtShort(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toFixed(1);
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const rows = [];

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const body = $('#leakListBody');
    const totalsBar = $('#totalsBar');
    const leakCount = $('#leakCount');

    leakCount.textContent = rows.length + (rows.length === 1 ? ' leak' : ' leaks');

    if (rows.length === 0) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💨</div>
          <p>No leaks logged yet.<br>Fill in the form and tap <strong>Add Leak</strong>.</p>
        </div>`;
      totalsBar.style.display = 'none';
      updateDashboard(0, 0, 0, 0);
      return;
    }

    let s1 = 0, s2 = 0, s3 = 0, s4 = 0;

    const cards = rows.map((x, i) => {
      s1 += x.steamLoss;
      s2 += x.waterLoss;
      s3 += x.annualCost;
      s4 += x.emissions;

      const riskClass = x.risk
        ? x.risk.toLowerCase().includes('high') ? 'risk-high'
          : x.risk.toLowerCase().includes('med') ? 'risk-medium'
          : x.risk.toLowerCase().includes('low') ? 'risk-low' : ''
        : '';

      const statusClass = x.status === 'COMPLETE' ? 'badge-complete' : 'badge-pending';

      const comments = [
        x.comments ? `<div><strong>Notes</strong>${x.comments}</div>` : '',
        x.repairComments ? `<div style="margin-top:6px"><strong>Repair</strong>${x.repairComments}</div>` : ''
      ].filter(Boolean).join('');

      return `
        <div class="leak-card">
          <div class="leak-card-header">
            <div class="leak-no">#${x.number}</div>
            <div class="leak-location">
              ${x.nature || x.type || '—'}
              <span>${[x.complex, x.unit, x.location].filter(Boolean).join(' · ') || 'No location set'}</span>
            </div>
            <div class="leak-status-badge ${statusClass}">${x.status}</div>
          </div>

          <div class="leak-card-body">
            <div class="leak-metric">
              <div class="leak-metric-label">Annual Cost</div>
              <div class="leak-metric-value lm-cost">${fmtCost(x.annualCost)}</div>
            </div>
            <div class="leak-metric">
              <div class="leak-metric-label">Steam Loss (LB/HR)</div>
              <div class="leak-metric-value lm-steam">${fmt(x.steamLoss, 1)}</div>
            </div>
            <div class="leak-metric">
              <div class="leak-metric-label">Water (gal/yr)</div>
              <div class="leak-metric-value lm-water">${fmtShort(x.waterLoss)}</div>
            </div>
            <div class="leak-metric">
              <div class="leak-metric-label">CO₂ (MTCO₂e)</div>
              <div class="leak-metric-value lm-co2">${fmt(x.emissions, 4)}</div>
            </div>
          </div>

          <div class="leak-card-footer">
            <div class="leak-tags">
              <span class="tag">${x.pressure} PSI</span>
              <span class="tag">${x.length} ft plume</span>
              <span class="tag">${x.seasonUpper}</span>
              ${x.leakTag ? `<span class="tag">Tag: ${x.leakTag}</span>` : ''}
              ${x.elevation ? `<span class="tag">ELV: ${x.elevation}</span>` : ''}
              ${x.risk ? `<span class="tag ${riskClass}">${x.risk}</span>` : ''}
            </div>
            <button class="btn-delete row-delete" data-index="${i}" title="Remove leak">✕</button>
          </div>

          ${comments ? `<div class="leak-comments">${comments}</div>` : ''}
        </div>`;
    });

    body.innerHTML = `<div class="leak-cards">${cards.join('')}</div>`;

    // Delegate delete
    body.onclick = (e) => {
      const btn = e.target.closest('.row-delete');
      if (btn) {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (!Number.isNaN(idx)) { rows.splice(idx, 1); render(); }
      }
    };

    // Totals bar
    totalsBar.style.display = 'flex';
    $('#totalsBarSteam').textContent = fmt(s1, 1) + ' lbs/hr';
    $('#totalsBarCost').textContent = fmtCost(s3);
    $('#totalsBarCO2').textContent = fmt(s4, 2) + ' MTCO₂e';

    updateDashboard(s1, s3, s2, s4);
  }

  function updateDashboard(steam, cost, water, co2) {
    $('#totalSteamLoss').textContent = fmt(steam, 1);
    $('#totalAnnualCost').textContent = fmtCost(cost);
    $('#totalWaterLoss').textContent = fmtShort(water);
    $('#totalEmissions').textContent = fmt(co2, 2);
  }

  // ── Add leak ──────────────────────────────────────────────────────────────
  function addLeak() {
    if (typeof steamLeakData === 'undefined' || !steamLeakData) {
      showToast('⚠ data.js missing — cannot calculate');
      return;
    }

    const number    = ($('#leak-number').value || (rows.length + 1)).toString().trim();
    const complex   = $('#leak-complex').value.trim();
    const unit      = $('#leak-unit').value.trim();
    const location  = $('#leak-location').value.trim();
    const elevation = $('#leak-elevation').value.trim();
    const type      = $('#leak-type').value.trim();
    const nature    = $('#leak-nature').value.trim();
    const risk      = $('#leak-risk').value.trim();
    const status    = $('#leak-status').value.trim();
    const leakTag   = $('#leak-tag').value.trim();
    const comments  = $('#leak-comments').value.trim();
    const repairComments = $('#leak-repair-comments').value.trim();

    const season   = $('#leak-season').value;
    const pressure = parseFloat($('#leak-pressure').value);
    const length   = parseInt($('#leak-length').value, 10);
    const cost     = parseFloat($('#leak-cost').value);

    const d = steamLeakData[season];
    if (!d) { showToast('Invalid season'); return; }

    const pMin = d.pressures[0], pMax = d.pressures[d.pressures.length - 1];
    const lMin = d.plume_lengths[0], lMax = d.plume_lengths[d.plume_lengths.length - 1];

    if (isNaN(pressure) || pressure < pMin || pressure > pMax) {
      showToast(`Pressure must be ${pMin}–${pMax} PSI`); return;
    }
    if (isNaN(length) || length < lMin || length > lMax) {
      showToast(`Plume length must be ${lMin}–${lMax} ft`); return;
    }
    if (isNaN(cost) || cost < 0) {
      showToast('Enter a valid steam cost'); return;
    }

    const steamLoss = getSteamLoss(season, pressure, length);
    if (steamLoss == null) { showToast('No data for that pressure/length/season'); return; }

    const waterLoss  = steamLoss * 8760 / 8.34;
    const annualCost = steamLoss * 8760 / 1000 * cost;
    const hg         = lookupHg(Math.floor(pressure));
    const emissions  = hg * steamLoss * 8760 * EMISSION_FACTOR;

    rows.push({
      number, complex, unit, location, elevation, type, nature,
      seasonUpper: season.toUpperCase(), season,
      pressure: Math.floor(pressure), length: Math.floor(length),
      cost, steamLoss, waterLoss, annualCost, emissions,
      risk, status, leakTag, comments, repairComments
    });

    render();
    $('#leak-number').value = '';
    showToast(`✓ Leak #${number} added — ${fmtCost(annualCost)}/yr`);
  }

  // ── CSV ───────────────────────────────────────────────────────────────────
  const CSV_HEADERS = [
    'LEAK NO.','COMPLEX','UNIT','LOCATION','ELV','TYPE','NATURE OF LEAK',
    'STEAM PRESSURE (PSI)','SEASON','STEAM COST ($/1000 LBS)','PLUME LENGTH (FT)',
    'STEAM LOSS (LB/HR)','WATER LOSS (GALLS/YR)','ANNUAL COST ($/YR)',
    'EMISSIONS (MTCO2e)','REPAIR COMMENTS','RISK','COMMENTS','STATUS','LEAK TAG NO.'
  ];

  function esc(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCSV() {
    const data = rows.map(x => {
      const steamCost = (x.cost != null && !Number.isNaN(x.cost))
        ? x.cost
        : (x.steamLoss > 0 ? (x.annualCost * 1000) / (x.steamLoss * 8760) : '');
      return [
        x.number, x.complex, x.unit, x.location, x.elevation, x.type, x.nature,
        x.pressure, x.seasonUpper, steamCost, x.length,
        x.steamLoss, x.waterLoss, x.annualCost, x.emissions,
        x.repairComments, x.risk, x.comments, x.status, x.leakTag
      ];
    });
    return [CSV_HEADERS, ...data].map(r => r.map(esc).join(',')).join('\n');
  }

  function exportCSV() {
    const csv  = buildCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'steam_leaks_export.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast('✓ CSV exported');
  }

  async function shareCSV() {
    const csv  = buildCSV();
    const file = new File([csv], 'steam_leaks.csv', { type: 'text/csv' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Steam Leaks CSV' });
      } else {
        exportCSV();
      }
    } catch (e) {
      showToast('Share failed: ' + e.message);
    }
  }

  // ── Status toggle ─────────────────────────────────────────────────────────
  const statusToggle = $('#statusToggle');
  statusToggle.addEventListener('click', () => {
    const next = $('#leak-status').value === 'PENDING' ? 'COMPLETE' : 'PENDING';
    $('#leak-status').value = next;
    statusToggle.textContent = next;
    statusToggle.classList.toggle('complete', next === 'COMPLETE');
  });

  // ── Event listeners ───────────────────────────────────────────────────────
  $('#addLeakBtn').addEventListener('click', addLeak);
  $('#resetBtn').addEventListener('click', () => {
    if (rows.length === 0 || confirm('Clear all leaks?')) {
      rows.length = 0; render();
      showToast('Table cleared');
    }
  });
  $('#exportCsvBtn').addEventListener('click', exportCSV);

  const shareBtn = $('#shareCsvBtn');
  if (shareBtn) shareBtn.addEventListener('click', shareCSV);

  // ── Init ──────────────────────────────────────────────────────────────────
  render();
});
