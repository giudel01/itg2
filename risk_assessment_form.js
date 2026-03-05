/* ============================================================
   Risk Assessment Custom – UI Page JavaScript
   ServiceNow UI Page – Table API integration
   ============================================================

   HOW TO USE IN SERVICENOW:
   1. Create a UI Page named "risk_assessment_form"
   2. Paste the HTML into the "HTML" field (or reference this file)
   3. The page receives the sys_id of the u_risk_assessment_custom record
      via URL query parameter:  ?sys_id=<record_sys_id>
      e.g.  /risk_assessment_form.do?sys_id=abc123...

   TABLE STRUCTURE ASSUMED:
   • u_risk_assessment_custom
       - sys_id
       - u_impatto_inerente    (string: alto | medio | basso)
       - u_probabilita_inerente (string: alto | medio | basso)
       - u_rischio_inerente    (string: auto-calculated or stored)

   • <m2m table> (e.g. u_risk_assessment_control or similar)
       - u_risk_assessment_custom  (reference → u_risk_assessment_custom)
       - u_sn_compliance_control   (reference → sn_compliance_control)
       - u_risultato               (string / choice)

   Update M2M_TABLE constant below with the actual m2m table name.
   ============================================================ */

(function () {
  'use strict';

  /* ── CONFIGURATION ── */
  var CONFIG = {
    mainTable: 'u_risk_assessment_custom',

    /* ⚠ Replace with the real m2m table name in your instance */
    m2mTable: 'u_risk_assessment_control',

    /* Field names */
    fields: {
      impatto:      'u_impatto_inerente',
      probabilita:  'u_probabilita_inerente',
      rischio:      'u_rischio_inerente',
      m2mParent:    'u_risk_assessment_custom',
      m2mControl:   'u_sn_compliance_control',
      m2mRisultato: 'u_risultato'
    },

    /* Rischio matrix: impatto (row) × probabilità (col) */
    rischioMatrix: {
      alto:  { alto: 'alto',  medio: 'alto',  basso: 'medio' },
      medio: { alto: 'alto',  medio: 'medio', basso: 'basso' },
      basso: { alto: 'medio', medio: 'basso', basso: 'basso' }
    }
  };

  /* ── STATE ── */
  var state = {
    sysId: null,
    controls: [],   // [{m2mSysId, controlSysId, controlName, risultato}]
    saving: false
  };

  /* ── UTILS ── */
  function getQueryParam(name) {
    var url = window.location.href;
    var regex = new RegExp('[?&]' + name + '=([^&#]*)');
    var match = regex.exec(url);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function showAlert(msg, type) {
    var el = document.getElementById('ra-alert');
    el.className = 'ra-alert ra-alert-' + type;
    el.textContent = msg;
    el.style.display = 'flex';
    // Auto-hide success after 4s
    if (type === 'success') {
      setTimeout(function () { el.style.display = 'none'; }, 4000);
    }
    // Scroll to top to show alert
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function hideAlert() {
    document.getElementById('ra-alert').style.display = 'none';
  }

  /* ── RISCHIO CALCULATION ── */
  function calculateRischio(impatto, probabilita) {
    if (!impatto || !probabilita) return null;
    var row = CONFIG.rischioMatrix[impatto];
    return row ? (row[probabilita] || null) : null;
  }

  function updateRischioDisplay() {
    var impatto     = document.getElementById('f-impatto').value;
    var probabilita = document.getElementById('f-probabilita').value;
    var rischio     = calculateRischio(impatto, probabilita);
    var display     = document.getElementById('f-rischio-display');
    var badge       = document.getElementById('ra-rischio-badge');
    var badgeValue  = document.getElementById('ra-badge-value');
    var badgeLevels = ['badge-alto', 'badge-medio', 'badge-basso'];

    // Update select colour coding via data attribute
    document.getElementById('f-impatto').setAttribute('data-value', impatto || '');
    document.getElementById('f-probabilita').setAttribute('data-value', probabilita || '');

    if (rischio) {
      var labelMap = { alto: 'Alto', medio: 'Medio', basso: 'Basso' };
      display.innerHTML =
        '<div class="ra-rischio-value level-' + rischio + '">' +
          '<div class="ra-rischio-dot level-' + rischio + '"></div>' +
          labelMap[rischio] +
        '</div>';

      // Header badge
      badge.style.display = '';
      badgeLevels.forEach(function (c) { badge.classList.remove(c); });
      badge.classList.add('badge-' + rischio);
      badgeValue.textContent = labelMap[rischio];
    } else {
      display.innerHTML = '<div class="ra-rischio-placeholder">Verrà calcolato automaticamente dopo la selezione di Impatto e Probabilità</div>';
      badge.style.display = 'none';
    }
  }

  /* ── TABLE API HELPERS ── */
  function apiUrl(table, sysId, params) {
    var base = '/api/now/table/' + table;
    if (sysId) base += '/' + sysId;
    if (params) base += '?' + params;
    return base;
  }

  function apiFetch(method, url, body, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-UserToken', window.g_ck || '');

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          onSuccess(data);
        } catch (e) {
          onSuccess({});
        }
      } else {
        var errMsg = 'HTTP ' + xhr.status;
        try {
          var errData = JSON.parse(xhr.responseText);
          if (errData.error && errData.error.message) {
            errMsg = errData.error.message;
          }
        } catch (e) { /* ignore */ }
        onError(errMsg);
      }
    };

    xhr.send(body ? JSON.stringify(body) : null);
  }

  /* ── LOAD MAIN RECORD ── */
  function loadMainRecord() {
    var fields = [
      CONFIG.fields.impatto,
      CONFIG.fields.probabilita,
      CONFIG.fields.rischio,
      'sys_created_on',
      'number'
    ].join(',');

    var url = apiUrl(CONFIG.mainTable, state.sysId, 'sysparm_fields=' + fields);

    apiFetch('GET', url, null,
      function (data) {
        var rec = data.result;
        if (!rec) {
          showAlert('Record non trovato (sys_id: ' + state.sysId + ')', 'error');
          return;
        }

        // Populate fields
        setSelectValue('f-impatto',     getFieldValue(rec, CONFIG.fields.impatto));
        setSelectValue('f-probabilita', getFieldValue(rec, CONFIG.fields.probabilita));

        // Header info
        var info = [];
        if (rec.number && rec.number.value) info.push(rec.number.value);
        if (rec.sys_created_on && rec.sys_created_on.display_value) {
          info.push('Creato il ' + rec.sys_created_on.display_value);
        }
        if (info.length) {
          document.getElementById('ra-record-info').textContent = info.join(' · ');
        } else {
          document.getElementById('ra-record-info').textContent = 'sys_id: ' + state.sysId;
        }

        updateRischioDisplay();
        loadControls();
      },
      function (err) {
        showAlert('Errore nel caricamento del record: ' + err, 'error');
        document.getElementById('ra-controls-loading').style.display = 'none';
        document.getElementById('ra-controls-empty').style.display   = 'flex';
      }
    );
  }

  function getFieldValue(rec, fieldName) {
    var field = rec[fieldName];
    if (!field) return '';
    return (typeof field === 'object') ? (field.value || field.display_value || '') : field;
  }

  function setSelectValue(id, value) {
    var sel = document.getElementById(id);
    if (!sel) return;
    sel.value = value || '';
    sel.setAttribute('data-value', value || '');
  }

  /* ── LOAD CONTROLS ── */
  function loadControls() {
    var parentField = CONFIG.fields.m2mParent;
    var url = apiUrl(
      CONFIG.m2mTable, null,
      'sysparm_query=' + parentField + '=' + state.sysId +
      '&sysparm_fields=' + [
        'sys_id',
        CONFIG.fields.m2mControl,
        CONFIG.fields.m2mRisultato
      ].join(',') +
      '&sysparm_limit=100'
    );

    apiFetch('GET', url, null,
      function (data) {
        document.getElementById('ra-controls-loading').style.display = 'none';
        var results = data.result;

        if (!results || results.length === 0) {
          document.getElementById('ra-controls-empty').style.display = 'flex';
          return;
        }

        state.controls = results.map(function (r) {
          var controlRef = r[CONFIG.fields.m2mControl];
          var risultatoField = r[CONFIG.fields.m2mRisultato];
          return {
            m2mSysId:    r.sys_id.value || r.sys_id,
            controlSysId: controlRef ? (controlRef.value || '') : '',
            controlName:  controlRef ? (controlRef.display_value || controlRef.value || 'Controllo') : 'Controllo',
            risultato:    risultatoField ? (risultatoField.value || risultatoField.display_value || '') : ''
          };
        });

        renderControls();
      },
      function (err) {
        document.getElementById('ra-controls-loading').style.display = 'none';
        showAlert('Errore nel caricamento dei controlli: ' + err, 'error');
        document.getElementById('ra-controls-empty').style.display = 'flex';
      }
    );
  }

  /* ── RENDER CONTROLS ── */
  function renderControls() {
    var container = document.getElementById('ra-controls-list');
    container.className = 'ra-controls-list';
    container.innerHTML = '';

    state.controls.forEach(function (ctrl) {
      var item = document.createElement('div');
      item.className = 'ra-control-item';

      // Control name column
      var nameDiv = document.createElement('div');
      nameDiv.className = 'ra-control-name';
      nameDiv.textContent = ctrl.controlName;

      // Risultato select column
      var fieldDiv = document.createElement('div');
      fieldDiv.className = 'ra-control-field';

      var lbl = document.createElement('label');
      lbl.textContent = 'Risultato';
      lbl.setAttribute('for', 'ctrl-' + ctrl.m2mSysId);

      var selWrapper = document.createElement('div');
      selWrapper.className = 'ra-select-wrapper';

      var sel = document.createElement('select');
      sel.id        = 'ctrl-' + ctrl.m2mSysId;
      sel.className = 'ra-select';
      sel.setAttribute('data-m2m-sys-id', ctrl.m2mSysId);

      [
        { value: '',      label: '— Seleziona —' },
        { value: 'alto',  label: 'Alto' },
        { value: 'medio', label: 'Medio' },
        { value: 'basso', label: 'Basso' }
      ].forEach(function (opt) {
        var o = document.createElement('option');
        o.value       = opt.value;
        o.textContent = opt.label;
        if (opt.value === ctrl.risultato) o.selected = true;
        sel.appendChild(o);
      });

      sel.setAttribute('data-value', ctrl.risultato || '');

      sel.addEventListener('change', function () {
        this.setAttribute('data-value', this.value);
      });

      var chevron = document.createElement('div');
      chevron.className = 'ra-select-chevron';
      chevron.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">' +
        '<polyline points="6 9 12 15 18 9"/></svg>';

      selWrapper.appendChild(sel);
      selWrapper.appendChild(chevron);
      fieldDiv.appendChild(lbl);
      fieldDiv.appendChild(selWrapper);

      item.appendChild(nameDiv);
      item.appendChild(fieldDiv);
      container.appendChild(item);
    });
  }

  /* ── SUBMIT ── */
  function handleSubmit(e) {
    e.preventDefault();
    if (state.saving) return;
    hideAlert();

    var impatto     = document.getElementById('f-impatto').value;
    var probabilita = document.getElementById('f-probabilita').value;

    // Validation
    var valid = true;
    if (!impatto) {
      markInvalid('f-impatto', true);
      valid = false;
    } else {
      markInvalid('f-impatto', false);
    }

    if (!probabilita) {
      markInvalid('f-probabilita', true);
      valid = false;
    } else {
      markInvalid('f-probabilita', false);
    }

    if (!valid) {
      showAlert('Compila tutti i campi obbligatori prima di salvare.', 'error');
      return;
    }

    var rischio = calculateRischio(impatto, probabilita);

    state.saving = true;
    setSavingState(true);

    // Build update payload for main record
    var mainPayload = {};
    mainPayload[CONFIG.fields.impatto]     = impatto;
    mainPayload[CONFIG.fields.probabilita] = probabilita;
    if (rischio) {
      mainPayload[CONFIG.fields.rischio] = rischio;
    }

    // STEP 1: Update main record
    var mainUrl = apiUrl(CONFIG.mainTable, state.sysId, null);

    apiFetch('PATCH', mainUrl, mainPayload,
      function () {
        // STEP 2: Update m2m records (in parallel)
        updateControlsRisultato(function (allOk, errors) {
          state.saving = false;
          setSavingState(false);

          if (allOk) {
            showAlert('Record aggiornato con successo.', 'success');
          } else {
            showAlert(
              'Record principale aggiornato, ma alcuni controlli non sono stati salvati: ' +
              errors.join('; '),
              'info'
            );
          }
        });
      },
      function (err) {
        state.saving = false;
        setSavingState(false);
        showAlert('Errore durante il salvataggio del record principale: ' + err, 'error');
      }
    );
  }

  function updateControlsRisultato(callback) {
    if (state.controls.length === 0) {
      callback(true, []);
      return;
    }

    var pending = 0;
    var errors  = [];

    state.controls.forEach(function (ctrl) {
      var sel = document.getElementById('ctrl-' + ctrl.m2mSysId);
      if (!sel) return;

      var newRisultato = sel.value;

      // Only update if a value is set
      if (!newRisultato) return;

      pending++;
      var payload = {};
      payload[CONFIG.fields.m2mRisultato] = newRisultato;
      var url = apiUrl(CONFIG.m2mTable, ctrl.m2mSysId, null);

      apiFetch('PATCH', url, payload,
        function () {
          pending--;
          if (pending === 0) callback(errors.length === 0, errors);
        },
        function (err) {
          errors.push(ctrl.controlName + ': ' + err);
          pending--;
          if (pending === 0) callback(errors.length === 0, errors);
        }
      );
    });

    // If nothing to update (all risultato empty), resolve immediately
    if (pending === 0) {
      callback(true, []);
    }
  }

  /* ── UI STATE HELPERS ── */
  function setSavingState(saving) {
    var btn = document.getElementById('ra-btn-submit');
    if (saving) {
      btn.classList.add('ra-saving');
      btn.disabled = true;
      btn.querySelector('svg') && (btn.querySelector('svg').style.display = 'none');
    } else {
      btn.classList.remove('ra-saving');
      btn.disabled = false;
      btn.querySelector('svg') && (btn.querySelector('svg').style.display = '');
    }
    document.getElementById('ra-btn-cancel').disabled = saving;
  }

  function markInvalid(selectId, invalid) {
    var sel   = document.getElementById(selectId);
    var group = sel ? sel.closest('.ra-field-group') : null;
    if (!group) return;

    if (invalid) {
      sel.classList.add('ra-invalid');
      group.classList.add('ra-has-error');
      var msg = group.querySelector('.ra-validation-msg');
      if (!msg) {
        msg = document.createElement('div');
        msg.className = 'ra-validation-msg';
        msg.textContent = 'Questo campo è obbligatorio.';
        group.appendChild(msg);
      }
    } else {
      sel.classList.remove('ra-invalid');
      group.classList.remove('ra-has-error');
    }
  }

  /* ── CANCEL ── */
  function handleCancel() {
    if (window.history && window.history.length > 1) {
      window.history.back();
    } else {
      // Fall back to record form
      window.location.href = '/' + CONFIG.mainTable + '.do?sys_id=' + state.sysId;
    }
  }

  /* ── INIT ── */
  function init() {
    state.sysId = getQueryParam('sys_id');

    if (!state.sysId) {
      showAlert(
        'Nessun sys_id fornito. Aprire questa pagina con il parametro ?sys_id=<record_sys_id>',
        'error'
      );
      document.getElementById('ra-btn-submit').disabled = true;
      document.getElementById('ra-controls-loading').style.display = 'none';
      document.getElementById('ra-controls-empty').style.display   = 'flex';
      return;
    }

    // Wire up live rischio calculation
    document.getElementById('f-impatto').addEventListener('change', updateRischioDisplay);
    document.getElementById('f-probabilita').addEventListener('change', updateRischioDisplay);

    // Wire up form submission
    document.getElementById('ra-form').addEventListener('submit', handleSubmit);

    // Wire up cancel
    document.getElementById('ra-btn-cancel').addEventListener('click', handleCancel);

    // Load data
    loadMainRecord();
  }

  /* ── BOOT ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
