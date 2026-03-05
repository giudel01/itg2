(function () {
  'use strict';

  var TABLE  = 'u_risk_assessment_custom';
  var API    = '/api/now/table/' + TABLE + '/';
  var FIELDS = 'u_impatto_inerente231,u_probabilita_inerente231,u_rischio_inerente,number';

  var MATRIX = {
    alto:  { alto: 'alto',  medio: 'alto',  basso: 'medio' },
    medio: { alto: 'alto',  medio: 'medio', basso: 'basso' },
    basso: { alto: 'medio', medio: 'basso', basso: 'basso' }
  };

  var sysId       = null;
  var savedData   = null;
  var saving      = false;

  /* ── DOM ── */
  var elImpatto     = document.getElementById('selImpatto');
  var elProbabilita = document.getElementById('selProbabilita');
  var elRisk        = document.getElementById('riskResult');
  var elForm        = document.getElementById('riskForm');
  var elBtnSave     = document.getElementById('btnSave');
  var elBtnReset    = document.getElementById('btnReset');
  var elErrBanner   = document.getElementById('alertError');
  var elErrMsg      = document.getElementById('alertErrorMsg');
  var elOkBanner    = document.getElementById('alertSuccess');
  var elLoading     = document.getElementById('loadingBox');
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

  function ajax(method, url, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText || '{}'));
        } else {
          var msg = 'Errore HTTP ' + xhr.status;
          try { msg = JSON.parse(xhr.responseText).error.message || msg; } catch (e) {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = function () { reject(new Error('Errore di rete.')); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  function calcRisk(i, p) {
    return (MATRIX[i] && MATRIX[i][p]) || null;
  }

  function setRiskDisplay(risk) {
    elRisk.className = 'risk-result ' + (risk ? 'risk-' + risk : 'risk-empty');
    elRisk.textContent = risk ? (risk.charAt(0).toUpperCase() + risk.slice(1)) : '—';
  }

  function showError(msg) {
    elErrMsg.textContent = msg;
    elErrBanner.style.display = 'block';
    elOkBanner.style.display  = 'none';
  }

  function clearMessages() {
    elErrBanner.style.display = 'none';
    elOkBanner.style.display  = 'none';
  }

  function setLoading(on) {
    elLoading.style.display = on ? 'flex' : 'none';
  }

  function populate(data) {
    var i = (data.u_impatto_inerente231     || '').toLowerCase();
    var p = (data.u_probabilita_inerente231 || '').toLowerCase();
    if (i) elImpatto.value     = i;
    if (p) elProbabilita.value = p;
    setRiskDisplay(calcRisk(i, p));
    if (data.number) elRecordLabel.textContent = data.number;
  }

  /* ── Events ── */
  function onChange() {
    setRiskDisplay(calcRisk(elImpatto.value, elProbabilita.value));
    if (elImpatto.value)     { wrapImpatto.classList.remove('field--invalid'); errImpatto.style.display = 'none'; }
    if (elProbabilita.value) { wrapProb.classList.remove('field--invalid');    errProb.style.display    = 'none'; }
  }

  function validate() {
    var ok = true;
    if (!elImpatto.value)     { wrapImpatto.classList.add('field--invalid'); errImpatto.style.display = 'block'; ok = false; }
    if (!elProbabilita.value) { wrapProb.classList.add('field--invalid');    errProb.style.display    = 'block'; ok = false; }
    return ok;
  }

  function onSave() {
    if (saving || !validate()) return;
    clearMessages();

    var i = elImpatto.value;
    var p = elProbabilita.value;

    saving = true;
    elBtnSave.disabled = true;

    ajax('PATCH', API + sysId, {
      u_impatto_inerente231:     i,
      u_probabilita_inerente231: p,
      u_rischio_inerente:        calcRisk(i, p) || ''
    })
    .then(function (res) {
      savedData = Object.assign({}, savedData, res.result || {});
      elOkBanner.style.display = 'block';
      setTimeout(function () { elOkBanner.style.display = 'none'; }, 4000);
    })
    .catch(function (err) { showError(err.message); })
    .finally(function () { saving = false; elBtnSave.disabled = false; });
  }

  function onReset() {
    if (savedData) populate(savedData);
    clearMessages();
    wrapImpatto.classList.remove('field--invalid');
    wrapProb.classList.remove('field--invalid');
    errImpatto.style.display = 'none';
    errProb.style.display    = 'none';
  }

  /* ── Boot ── */
  elImpatto.addEventListener('change', onChange);
  elProbabilita.addEventListener('change', onChange);
  elBtnSave.addEventListener('click', onSave);
  elBtnReset.addEventListener('click', onReset);

  sysId = getSysId();

  if (!sysId) {
    setLoading(false);
    showError('Parametro sys_id mancante nell\'URL.');
    elBtnSave.disabled  = true;
    elBtnReset.disabled = true;
    return;
  }

  setLoading(true);
  ajax('GET', API + sysId + '?sysparm_fields=' + FIELDS)
    .then(function (res) { savedData = res.result || {}; populate(savedData); })
    .catch(function (err) { showError('Caricamento fallito: ' + err.message); })
    .finally(function () { setLoading(false); });

  /* finally polyfill */
  if (!Promise.prototype.finally) {
    Promise.prototype.finally = function (fn) {
      return this.then(function (v) { fn(); return v; }, function (e) { fn(); throw e; });
    };
  }

}());
