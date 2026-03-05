/* ============================================================
   UI Action – "Valuta Rischio"
   Tabella: u_risk_assessment_custom
   ============================================================
   Come configurarlo in ServiceNow:
   1. Naviga su System UI → UI Actions → New
   2. Name:        Valuta Rischio
   3. Table:       u_risk_assessment_custom
   4. Action name: valuta_rischio
   5. Form button: ✔ (spunta "Form button")
   6. Client:      ✔ (spunta "Client")
   7. Incolla il codice qui sotto nel campo "Script"
   ============================================================ */

function valutaRischio() {
  var sysId = g_form.getUniqueValue();
  if (!sysId) {
    alert('Impossibile aprire il form: sys_id non disponibile.');
    return;
  }
  var url = '/risk_assessment_form.do?sys_id=' + sysId;
  /* Apre la UI Page nella stessa finestra.
     Sostituisci con window.open(url, '_blank') se preferisci una nuova tab. */
  window.location.href = url;
}
