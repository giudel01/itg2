(function () {
  'use strict';

  var MATRIX = {
    alto:  { alto: 'alto',  medio: 'alto',  basso: 'medio' },
    medio: { alto: 'alto',  medio: 'medio', basso: 'basso' },
    basso: { alto: 'medio', medio: 'basso', basso: 'basso' }
  };

  var sysId     = null;
  var savedData = null;
  var saving    = false;

  /* ── DOM ── */
  var elImpatto     = document.getElementById('selImpatto');
  var elProbabilita = document.getElementById('selProbabilita');
  var elRisk        = document.getElementById('riskResult');
  var elBtnSave     = document.getElementById('btnSave');
  var elBtnReset    = document.getElementById('btnReset');
  var elErrBanner   = document.getElementById('alertError');
  var elErrMsg      = document.getElementById('alertErrorMsg');
  var elOkBanner    = document.getElementById('alertSuccess');
  var elRecordLabel = document.getElementById('recordLabel');
  var wrapImpatto   = document.getElementById('wrapImpatto');
  var wrapProb      = document.getElementById('wrapProbabilita');
  var errImpatto    = document.getElementById('errImpatto');
  var errProb       = document.getElementById('errProbabilita');

  /* ── Helpers ── */
  function getSysId() {
    var p = new URLSearchParams(window.location.search);
    return p.get('sys_id') || p.get('sysparm_record_sys_id') || null;
  }

  function calcRisk(i, p) {
    return (MATRIX[i] && MATRIX[i][p]) || null;
  }

  function setRiskDisplay(risk) {
    elRisk.className   = 'risk-result ' + (risk ? 'risk-' + risk : 'risk-empty');
    elRisk.textContent = risk ? (risk.charAt(0).toUpperCase() + risk.slice(1)) : '—';
  }

  function showError(msg) {
    elErrMsg.textContent      = msg;
    elErrBanner.style.display = 'block';
    elOkBanner.style.display  = 'none';
  }

  function clearMessages() {
    elErrBanner.style.display = 'none';
    elOkBanner.style.display  = 'none';
  }

  function populate(data) {
    var i = (data.impatto     || '').toLowerCase();
    var p = (data.probabilita || '').toLowerCase();
    if (i) elImpatto.value     = i;
    if (p) elProbabilita.value = p;
    setRiskDisplay(calcRisk(i, p));
    if (data.number) elRecordLabel.textContent = data.number;
  }

  /* ── Validation ── */
  function validate() {
    var ok = true;
    if (!elImpatto.value) {
      wrapImpatto.classList.add('field--invalid');
      errImpatto.style.display = 'block';
      ok = false;
    }
    if (!elProbabilita.value) {
      wrapProb.classList.add('field--invalid');
      errProb.style.display = 'block';
      ok = false;
    }
    return ok;
  }

  /* ── GlideAjax save ── */
  function onSave() {
    if (saving || !validate()) return;
    clearMessages();

    var i = elImpatto.value;
    var p = elProbabilita.value;
    var r = calcRisk(i, p) || '';

    saving = true;
    elBtnSave.disabled = true;

    var ga = new GlideAjax('RiskAssessmentAjax');
    ga.addParam('sysparm_name',     'saveRecord');
    ga.addParam('sysparm_sys_id',   sysId);
    ga.addParam('sysparm_impatto',  i);
    ga.addParam('sysparm_prob',     p);
    ga.addParam('sysparm_rischio',  r);

    ga.getXMLAnswer(function (answer) {
      saving = false;
      elBtnSave.disabled = false;

      if (answer === 'ok') {
        savedData = { impatto: i, probabilita: p, rischio: r, number: savedData ? savedData.number : '' };
        elOkBanner.style.display = 'block';
        setTimeout(function () { elOkBanner.style.display = 'none'; }, 4000);
      } else {
        showError('Salvataggio fallito: ' + answer);
      }
    });
  }

  /* ── Events ── */
  function onChange() {
    setRiskDisplay(calcRisk(elImpatto.value, elProbabilita.value));
    if (elImpatto.value)     { wrapImpatto.classList.remove('field--invalid'); errImpatto.style.display = 'none'; }
    if (elProbabilita.value) { wrapProb.classList.remove('field--invalid');    errProb.style.display    = 'none'; }
  }

  function onReset() {
    if (savedData) populate(savedData);
    clearMessages();
    wrapImpatto.classList.remove('field--invalid');
    wrapProb.classList.remove('field--invalid');
    errImpatto.style.display = 'none';
    errProb.style.display    = 'none';
  }

  elImpatto.addEventListener('change', onChange);
  elProbabilita.addEventListener('change', onChange);
  elBtnSave.addEventListener('click', onSave);
  elBtnReset.addEventListener('click', onReset);

  /* ── Boot: populate from server-injected data ── */
  sysId = getSysId();

  if (!sysId || !window.RECORD || !window.RECORD.ok) {
    showError(sysId ? 'Record non trovato.' : 'Parametro sys_id mancante nell\'URL.');
    elBtnSave.disabled  = true;
    elBtnReset.disabled = true;
    return;
  }

  savedData = window.RECORD;
  populate(savedData);

}());
