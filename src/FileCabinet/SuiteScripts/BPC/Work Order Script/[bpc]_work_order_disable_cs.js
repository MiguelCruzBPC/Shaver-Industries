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
   * Function to be executed after page is initialized.
   *
   * @param {Object} scriptContext
   * @param {Record} scriptContext.currentRecord - Current form record
   * @param {string} scriptContext.mode - The mode in which the record is being accessed (create, copy, or edit)
   *
   * @since 2015.2
   */
  function pageInit(scriptContext) {
    try {
      updateStatusProperty(scriptContext);
    } catch (e) {
      console.log(e);
    }
  }

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
      const { fieldId } = scriptContext;
      if (
        fieldId === 'custbody_bpc_engineering_required' ||
        fieldId === 'custbody_bpc_engineering_complete'
      ) {
        updateStatusProperty(scriptContext);
      }
    } catch (e) {
      console.log(e);
    }
  }

  const updateStatusProperty = (scriptContext) => {
    const { currentRecord } = scriptContext;
    const assemblyItem = currentRecord.getValue({
      fieldId: 'assemblyitem'
    });
    const orderStatusFieldId = 'orderstatus';
    if (assemblyItem) {
      const engRequired = currentRecord.getValue({
        fieldId: 'custbody_bpc_engineering_required'
      });
      const engComplete = currentRecord.getValue({
        fieldId: 'custbody_bpc_engineering_complete'
      });
      currentRecord.getField({ fieldId: orderStatusFieldId }).isDisabled =
        engRequired && !engComplete;
    } else {
      currentRecord.getField({ fieldId: orderStatusFieldId }).isDisabled = true;
    }
  };

  return {
    fieldChanged,
    pageInit
  };
});
