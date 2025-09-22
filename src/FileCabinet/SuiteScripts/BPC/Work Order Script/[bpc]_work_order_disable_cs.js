/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/log', 'N/record'], /**
 * @param{log} log
 * @param{record} record
 */ function (log, record) {
  /**
   * Function to be executed when field is changed.
   *
   * @param {Object} scriptContext
   * @param {Record} scriptContext.currentRecord - Current form record
   * @param {string} scriptContext.sublistId - Sublist name
   * @param {string} scriptContext.fieldId - Field name
   * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field
   * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field
   *
   * @since 2015.2
   */
  function fieldChanged(scriptContext) {
    try {
      const { currentRecord } = scriptContext;
      const engRequired = currentRecord.getValue({ fieldId: 'custbody_bpc_engineering_required' });
      const engComplete = currentRecord.getValue({ fieldId: 'custbody_bpc_engineering_complete' });
      const { fieldId } = scriptContext;
      if (
        fieldId === 'custbody_bpc_engineering_required' ||
        fieldId === 'custbody_bpc_engineering_complete'
      ) {
        const orderStatusFieldId = 'orderstatus';
        currentRecord.getField({ fieldId: orderStatusFieldId }).isDisabled =
          engRequired && !engComplete;
      }
    } catch (e) {
      console.log(e);
    }
  }

  return {
    fieldChanged
  };
});
