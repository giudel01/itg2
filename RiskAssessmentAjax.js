/**
 * Script Include – RiskAssessmentAjax
 *
 * Client-callable: true
 * Name: RiskAssessmentAjax
 * Extends: AbstractAjaxProcessor
 */
var RiskAssessmentAjax = Class.create();
RiskAssessmentAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {

  saveRecord: function () {
    var sysId   = this.getParameter('sysparm_sys_id');
    var impatto = this.getParameter('sysparm_impatto');
    var prob    = this.getParameter('sysparm_prob');
    var rischio = this.getParameter('sysparm_rischio');

    if (!sysId || !impatto || !prob) {
      return 'Parametri mancanti.';
    }

    var gr = new GlideRecord('u_risk_assessment_custom');
    if (!gr.get(sysId)) {
      return 'Record non trovato: ' + sysId;
    }

    gr.setValue('u_impatto_inerente231',     impatto);
    gr.setValue('u_probabilita_inerente231', prob);
    gr.setValue('u_rischio_inerente',        rischio);
    gr.update();

    return 'ok';
  },

  type: 'RiskAssessmentAjax'
});
