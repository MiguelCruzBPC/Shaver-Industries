/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/search'], /**
 * @param{record} record
 * @param{search} search
 */ (record, search) => {
  /**
   * Defines the function definition that is executed after record is submitted.
   * @param {Object} scriptContext
   * @param {Record} scriptContext.newRecord - New record
   * @param {Record} scriptContext.oldRecord - Old record
   * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
   * @since 2015.2
   */
  const afterSubmit = (scriptContext) => {
    try {
      // Get the sales order record
      const soRecord = scriptContext.newRecord;
      // Get the sales order information
    } catch (e) {
      log.error({
        title: 'Error AfterSubmit',
        details: e
      });
    }
  };

  const getSalesOrderData = (soRecord) => {
    const soLineCount = soRecord.getLineCount({
      sublistId: 'item'
    });
    if (soLineCount > 0) {
    }
  };

  return { afterSubmit };
});
