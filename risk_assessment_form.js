/**
 * risk_assessment.js
 *
 * ServiceNow UI Page – Risk Assessment Custom
 * Table  : u_risk_assessment_custom
 * Fields : u_impatto_inerente231 | u_probabilita_inerente231 | u_rischio_inerente
 *
 * Usage  : The page URL must include ?sys_id=<record_sys_id>
 *          e.g. /u_risk_assessment_custom.do?sys_id=abc123...
 *          or   /<ui_page_name>.do?sysparm_record_sys_id=abc123...
 *
 * The script reads the sys_id from the URL query string (keys: sys_id or sysparm_record_sys_id),
 * loads the existing record via the ServiceNow Table REST API, and allows the user to save.
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────── */
  var TABLE      = 'u_risk_assessment_custom';
  var API_BASE   = '/api/now/table/' + TABLE;
  var FIELDS     = 'u_impatto_inerente231,u_probabilita_inerente231,u_rischio_inerente,number,sys_created_on';

  /**
   * Risk matrix: rischio = f(impatto, probabilita)
   *
   *            | basso | medio | alto  |  ← Probabilità
   *  ----------+-------+-------+-------+
   *  alto  Imp | medio | alto  | alto  |
   *  medio Imp | basso | medio | alto  |
   *  basso Imp | basso | basso | medio |
   */
  var RISK_MATRIX = {
    alto:  { alto: 'alto',  medio: 'alto',  basso: 'medio' },
    medio: { alto: 'alto',  medio: 'medio', basso: 'basso' },
    basso: { alto: 'medio', medio: 'basso', basso: 'basso' }
  };

  /* ─────────────────────────────────────────
     STATE
  ───────────────────────────────────────── */
  var state = {
    sysId:         null,
    originalData:  null,   // data as loaded from server
    saving:        false
  };

  /* ─────────────────────────────────────────
     DOM REFERENCES
  ───────────────────────────────────────── */
  var dom = {};

  function cacheDom() {
    dom.loadingOverlay   = document.getElementById('loadingOverlay');
    dom.errorBanner      = document.getElementById('errorBanner');
    dom.errorMessage     = document.getElementById('errorMessage');
    dom.successBanner    = document.getElementById('successBanner');
    dom.headerSubtitle   = document.getElementById('headerSubtitle');
    dom.headerMeta       = document.getElementById('headerMeta');
    dom.riskForm         = document.getElementById('riskForm');
    dom.selectImpatto    = document.getElementById('selectImpatto');
    dom.selectProbabilita= document.getElementById('selectProbabilita');
    dom.riskDisplay      = document.getElementById('riskDisplay');
    dom.riskDot          = document.getElementById('riskDot');
    dom.riskValue        = document.getElementById('riskValue');
    dom.btnSave          = document.getElementById('btnSave');
    dom.btnReset         = document.getElementById('btnReset');
    dom.fieldImpatto     = document.getElementById('fieldImpatto');
    dom.fieldProbabilita = document.getElementById('fieldProbabilita');
    dom.errorImpatto     = document.getElementById('errorImpatto');
    dom.errorProbabilita = document.getElementById('errorProbabilita');
    dom.matrixCells      = document.querySelectorAll('.ra-matrix__cell[data-i]');
  }

  /* ─────────────────────────────────────────
     UTILITY – URL PARAMS
  ───────────────────────────────────────── */
  function getSysId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('sys_id') || params.get('sysparm_record_sys_id') || null;
  }

  /* ─────────────────────────────────────────
     UTILITY – HTTP
  ───────────────────────────────────────── */
  function request(method, url, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            resolve({});
          }
        } else {
          var msg = 'Errore HTTP ' + xhr.status;
          try {
            var errBody = JSON.parse(xhr.responseText);
            if (errBody && errBody.error && errBody.error.message) {
              msg = errBody.error.message;
            }
          } catch (e) { /* ignore */ }
          reject(new Error(msg));
        }
      };

      xhr.onerror = function () {
        reject(new Error('Errore di rete. Verificare la connessione.'));
      };

      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  /* ─────────────────────────────────────────
     LOADING / ERROR STATE HELPERS
  ───────────────────────────────────────── */
  function showLoading(visible) {
    dom.loadingOverlay.hidden = !visible;
  }

  function showError(msg) {
    dom.errorMessage.textContent = msg;
    dom.errorBanner.hidden = false;
    dom.successBanner.hidden = true;
    dom.errorBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    dom.errorBanner.hidden = true;
  }

  function showSuccess() {
    dom.successBanner.hidden = false;
    dom.errorBanner.hidden = true;
    dom.successBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { dom.successBanner.hidden = true; }, 4000);
  }

  /* ─────────────────────────────────────────
     RISK CALCULATION
  ───────────────────────────────────────── */
  function calculateRisk(impatto, probabilita) {
    if (!impatto || !probabilita) return null;
    return (RISK_MATRIX[impatto] && RISK_MATRIX[impatto][probabilita]) || null;
  }

  function updateRiskDisplay(risk) {
    // Remove previous colour classes
    dom.riskDisplay.classList.remove('ra-risk-display--alto', 'ra-risk-display--medio', 'ra-risk-display--basso');
    dom.riskDot.classList.remove('ra-risk-display__dot--alto', 'ra-risk-display__dot--medio', 'ra-risk-display__dot--basso');

    if (!risk) {
      dom.riskValue.textContent = '—';
      return;
    }

    var label = risk.charAt(0).toUpperCase() + risk.slice(1);
    dom.riskValue.textContent = label;
    dom.riskDisplay.classList.add('ra-risk-display--' + risk);
    dom.riskDot.classList.add('ra-risk-display__dot--' + risk);
  }

  function highlightMatrixCell(impatto, probabilita) {
    dom.matrixCells.forEach(function (cell) {
      cell.classList.toggle(
        'ra-matrix__cell--active',
        cell.dataset.i === impatto && cell.dataset.p === probabilita
      );
    });
  }

  function onSelectionChange() {
    var impatto     = dom.selectImpatto.value;
    var probabilita = dom.selectProbabilita.value;
    var risk        = calculateRisk(impatto, probabilita);

    updateRiskDisplay(risk);
    highlightMatrixCell(impatto, probabilita);

    // Clear inline errors on change
    if (impatto)     setFieldError(dom.fieldImpatto,     dom.errorImpatto,     false);
    if (probabilita) setFieldError(dom.fieldProbabilita, dom.errorProbabilita, false);
  }

  /* ─────────────────────────────────────────
     FORM POPULATION
  ───────────────────────────────────────── */
  function populateForm(data) {
    var impatto     = (data.u_impatto_inerente231     || '').toLowerCase();
    var probabilita = (data.u_probabilita_inerente231 || '').toLowerCase();

    if (impatto)     dom.selectImpatto.value     = impatto;
    if (probabilita) dom.selectProbabilita.value = probabilita;

    onSelectionChange();

    // Header subtitle
    if (data.number) {
      dom.headerSubtitle.textContent = 'Numero record: ' + data.number;
    } else {
      dom.headerSubtitle.textContent = 'Record: ' + state.sysId;
    }

    // Header meta (creation date)
    if (data.sys_created_on) {
      var d = new Date(data.sys_created_on.replace(' ', 'T'));
      dom.headerMeta.textContent = 'Creato il ' + d.toLocaleDateString('it-IT', {
        day: '2-digit', month: 'long', year: 'numeric'
      });
    }
  }

  /* ─────────────────────────────────────────
     LOAD RECORD
  ───────────────────────────────────────── */
  function loadRecord() {
    showLoading(true);
    hideError();

    var url = API_BASE + '/' + state.sysId + '?sysparm_fields=' + FIELDS;

    return request('GET', url)
      .then(function (response) {
        var data = response.result || {};
        state.originalData = data;
        populateForm(data);
      })
      .catch(function (err) {
        showError('Impossibile caricare il record: ' + err.message);
        dom.headerSubtitle.textContent = 'Errore durante il caricamento';
      })
      .finally(function () {
        showLoading(false);
      });
  }

  /* ─────────────────────────────────────────
     VALIDATION
  ───────────────────────────────────────── */
  function setFieldError(fieldEl, errorEl, hasError) {
    fieldEl.classList.toggle('ra-field--invalid', hasError);
    errorEl.hidden = !hasError;
  }

  function validate() {
    var valid       = true;
    var impatto     = dom.selectImpatto.value;
    var probabilita = dom.selectProbabilita.value;

    setFieldError(dom.fieldImpatto, dom.errorImpatto, !impatto);
    setFieldError(dom.fieldProbabilita, dom.errorProbabilita, !probabilita);

    if (!impatto || !probabilita) valid = false;
    return valid;
  }

  /* ─────────────────────────────────────────
     SAVE RECORD
  ───────────────────────────────────────── */
  function saveRecord() {
    if (state.saving) return;
    hideError();

    if (!validate()) {
      showError('Compilare tutti i campi obbligatori prima di salvare.');
      return;
    }

    var impatto     = dom.selectImpatto.value;
    var probabilita = dom.selectProbabilita.value;
    var rischio     = calculateRisk(impatto, probabilita);

    var payload = {
      u_impatto_inerente231:     impatto,
      u_probabilita_inerente231: probabilita,
      u_rischio_inerente:        rischio || ''
    };

    state.saving = true;
    dom.btnSave.disabled = true;
    dom.btnSave.classList.add('ra-btn--loading');

    var url = API_BASE + '/' + state.sysId;

    request('PATCH', url, payload)
      .then(function (response) {
        var updated = (response && response.result) || {};
        state.originalData = Object.assign({}, state.originalData, updated);
        showSuccess();
      })
      .catch(function (err) {
        showError('Salvataggio non riuscito: ' + err.message);
      })
      .finally(function () {
        state.saving = false;
        dom.btnSave.disabled = false;
        dom.btnSave.classList.remove('ra-btn--loading');
      });
  }

  /* ─────────────────────────────────────────
     RESET
  ───────────────────────────────────────── */
  function resetForm() {
    if (!state.originalData) return;
    populateForm(state.originalData);
    hideError();
    dom.successBanner.hidden = true;
    setFieldError(dom.fieldImpatto,     dom.errorImpatto,     false);
    setFieldError(dom.fieldProbabilita, dom.errorProbabilita, false);
  }

  /* ─────────────────────────────────────────
     EVENT BINDING
  ───────────────────────────────────────── */
  function bindEvents() {
    dom.selectImpatto.addEventListener('change', onSelectionChange);
    dom.selectProbabilita.addEventListener('change', onSelectionChange);

    dom.riskForm.addEventListener('submit', function (e) {
      e.preventDefault();
      saveRecord();
    });

    dom.btnReset.addEventListener('click', resetForm);
  }

  /* ─────────────────────────────────────────
     BOOTSTRAP
  ───────────────────────────────────────── */
  function init() {
    cacheDom();
    bindEvents();

    state.sysId = getSysId();

    if (!state.sysId) {
      showLoading(false);
      dom.headerSubtitle.textContent = 'Parametro sys_id mancante nell\'URL';
      showError(
        'Impossibile avviare il form: il parametro sys_id non è presente nell\'URL. ' +
        'Accedere alla pagina tramite un record esistente.'
      );
      dom.btnSave.disabled   = true;
      dom.btnReset.disabled  = true;
      return;
    }

    loadRecord();
  }

  /* ─────────────────────────────────────────
     POLYFILL: Promise.prototype.finally
     (for older ServiceNow embedded browsers)
  ───────────────────────────────────────── */
  if (typeof Promise !== 'undefined' && !Promise.prototype.finally) {
    Promise.prototype.finally = function (fn) {
      return this.then(
        function (val) { fn(); return val; },
        function (err) { fn(); throw err; }
      );
    };
  }

  /* ─────────────────────────────────────────
     KICK OFF
  ───────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
