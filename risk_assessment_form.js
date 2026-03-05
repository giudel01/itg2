(function () {
  'use strict';

  /* ── Rischio inerente: matrice impatto × probabilità ── */
  var MATRIX = {
    alto:  { alto: 'alto',  medio: 'alto',  basso: 'medio' },
    medio: { alto: 'alto',  medio: 'medio', basso: 'basso' },
    basso: { alto: 'medio', medio: 'basso', basso: 'basso' }
  };

  /* ── Stato ── */
  var sysId     = (new URLSearchParams(window.location.search)).get('sys_id') || '';
  var savedData = null;
  var saving    = false;

  /* ── DOM ── */
  var selImpatto     = document.getElementById('selImpatto');
  var selProbabilita = document.getElementById('selProbabilita');
  var divRisk        = document.getElementById('riskResult');
  var btnSave        = document.getElementById('btnSave');
  var btnReset       = document.getElementById('btnReset');
  var errBanner      = document.getElementById('alertError');
  var errMsg         = document.getElementById('alertErrorMsg');
  var okBanner       = document.getElementById('alertSuccess');
  var recordLabel    = document.getElementById('recordLabel');
  var wrapImpatto    = document.getElementById('wrapImpatto');
  var wrapProb       = document.getElementById('wrapProbabilita');
  var errImpatto     = document.getElementById('errImpatto');
  var errProb        = document.getElementById('errProbabilita');

  /* ── Helpers ── */
  function calcRisk(i, p) {
    return (MATRIX[i] && MATRIX[i][p]) || '';
  }

  function renderRisk(risk) {
    divRisk.className   = 'risk-result ' + (risk ? 'risk-' + risk : 'risk-empty');
    divRisk.textContent = risk ? risk.charAt(0).toUpperCase() + risk.slice(1) : '—';
  }

  function showError(msg) {
    errMsg.textContent    = msg;
    errBanner.style.display = 'block';
    okBanner.style.display  = 'none';
  }

  function clearAlerts() {
    errBanner.style.display = 'none';
    okBanner.style.display  = 'none';
  }

  function populate(data) {
    if (data.impatto)     selImpatto.value     = data.impatto;
    if (data.probabilita) selProbabilita.value = data.probabilita;
    renderRisk(calcRisk(data.impatto, data.probabilita));
    if (data.number) recordLabel.textContent = data.number;
  }

  function validate() {
    var ok = true;
    if (!selImpatto.value) {
      wrapImpatto.classList.add('field--invalid');
      errImpatto.style.display = 'block';
      ok = false;
    }
    if (!selProbabilita.value) {
      wrapProb.classList.add('field--invalid');
      errProb.style.display = 'block';
      ok = false;
    }
    return ok;
  }

  /* ── Save via GlideAjax → Script Include RiskAssessmentAjax ── */
  function doSave() {
    if (saving || !validate()) return;
    clearAlerts();

    var i = selImpatto.value;
    var p = selProbabilita.value;
    var r = calcRisk(i, p);

    saving = true;
    btnSave.disabled = true;

    var ga = new GlideAjax('RiskAssessmentAjax');
    ga.addParam('sysparm_name',    'saveRecord');
    ga.addParam('sysparm_sys_id',  sysId);
    ga.addParam('sysparm_impatto', i);
    ga.addParam('sysparm_prob',    p);
    ga.addParam('sysparm_rischio', r);
    ga.getXMLAnswer(function (answer) {
      saving = false;
      btnSave.disabled = false;
      if (answer === 'ok') {
        savedData = { impatto: i, probabilita: p, rischio: r, number: savedData ? savedData.number : '' };
        renderRisk(r);
        okBanner.style.display = 'block';
        setTimeout(function () { okBanner.style.display = 'none'; }, 4000);
      } else {
        showError(answer || 'Errore sconosciuto durante il salvataggio.');
      }
    });
  }

  /* ── Events ── */
  selImpatto.addEventListener('change', function () {
    renderRisk(calcRisk(selImpatto.value, selProbabilita.value));
    wrapImpatto.classList.remove('field--invalid');
    errImpatto.style.display = 'none';
  });

  selProbabilita.addEventListener('change', function () {
    renderRisk(calcRisk(selImpatto.value, selProbabilita.value));
    wrapProb.classList.remove('field--invalid');
    errProb.style.display = 'none';
  });

  btnSave.addEventListener('click', doSave);

  btnReset.addEventListener('click', function () {
    if (savedData) populate(savedData);
    clearAlerts();
    wrapImpatto.classList.remove('field--invalid');
    wrapProb.classList.remove('field--invalid');
    errImpatto.style.display = 'none';
    errProb.style.display    = 'none';
  });

  /* ── Boot: read server-injected data ── */
  if (!sysId) {
    showError('Parametro sys_id mancante nell\'URL.');
    btnSave.disabled  = true;
    btnReset.disabled = true;
    return;
  }

  var rec = window.RECORD;
  if (!rec || !rec.ok) {
    showError('Record non trovato (sys_id: ' + sysId + ').');
    btnSave.disabled  = true;
    btnReset.disabled = true;
    return;
  }

  savedData = rec;
  populate(savedData);

}());
