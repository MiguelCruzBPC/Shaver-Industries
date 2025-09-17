/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/runtime'], /**
 * @param{record} record
 * @param{runtime} runtime
 */ (record, runtime) => {
  /**
   * Defines the function definition that is executed before record is submitted.
   * @param {Object} scriptContext
   * @param {Record} scriptContext.newRecord - New record
   * @param {Record} scriptContext.oldRecord - Old record
   * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
   * @since 2015.2
   */
  const beforeSubmit = (scriptContext) => {
    try {
      // Intercompany Sales Order Process
      salesOrderProcess(scriptContext);
    } catch (e) {
      log.error({
        title: 'Error beforeSubmit',
        details: e
      });
    }
  };

  const salesOrderProcess = (scriptContext) => {
    if (scriptContext.type !== scriptContext.UserEventType.CREATE) {
      return;
    }

    // Get the value of internal id for approve the purchase order
    const purchaseOrdApproveStatus = runtime
      .getCurrentScript()
      .getParameter({ name: 'custscript_bpc_approval_status' });
    if (purchaseOrdApproveStatus) {
      const purchOrdRec = scriptContext.newRecord;

      // Get the intercompany status in the purchase order
      const interStatus = purchOrdRec.getValue({
        fieldId: 'approvalstatus'
      });
      log.debug({
        title: 'interStatus',
        details: interStatus
      });
      // ONLY UPDATE THE APPROVED STATUS IF THE TRANSACTION IS A INTERCOMPANY TRANS
      if (interStatus) {
        // Set the value into the record
        purchOrdRec.setValue({
          fieldId: 'approvalstatus',
          value: purchaseOrdApproveStatus
        });
      }
    }
  };

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
      // Get the purchase order ID
      const poID = scriptContext.newRecord.id;

      // get the purchase order rec
      const interPurchaseOrder = scriptContext.newRecord;
      if (poID) {
        // Get the triggered sales order record data
        const salesOrdCustomerData = getSOTriggerData(interPurchaseOrder);
        log.debug({
          title: 'salesOrdCustomerData',
          details: salesOrdCustomerData
        });

        // Validate if the customer sales order has data for the intercompany creation
        if (salesOrdCustomerData && salesOrdCustomerData.arrayLineItem.length) {
          // Create the sales order intercompany
          const soIdCreated = createInterTransaction(salesOrdCustomerData, poID);
          if (soIdCreated) {
            log.debug({
              title: 'soIdCreated',
              details: soIdCreated
            });
          }
        }
      }
    } catch (e) {
      log.error({
        title: 'Error AfterSubmit Function',
        details: e
      });
    }
  };

  /** This function allow the creation of sales order and purchase order intercompany transactions* */
  const createInterTransaction = (customerSalesOrderData, poID) => {
    // Set main body fields
    // hardcode customer - IC-Shaver Industries, LLC
    const interSOcustomerId = runtime
      .getCurrentScript()
      .getParameter({ name: 'custscript_bpc_inter_so_customer' });

    // harcode subsidiary - Shaver Industries Inc
    const interSOsubsidiaryId = runtime
      .getCurrentScript()
      .getParameter({ name: 'custscript_bpc_inter_so_subsidiary' });

    // hardcode currency - Canadian Dollar CAD
    const interSOCadId = runtime
      .getCurrentScript()
      .getParameter({ name: 'custscript_bpc_inter_co_currency' });

    // Create the Sales Order
    const soRecord = record.create({
      type: record.Type.SALES_ORDER,
      isDynamic: true,
      defaultValues: {
        ictran: 8639,
        entity: interSOcustomerId, // Intercompany vendor,
        // otherrefnum: customerSalesOrderData.poNumber,
        subsidiary: interSOsubsidiaryId,
        // department: customerSalesOrderData.department,
        currency: interSOCadId
      }
    });

    /* // Customer set
    if (interSOcustomerId) {
      log.debug({
        title: 'interSOcustomerId',
        details: interSOcustomerId
      });
      soRecord.setValue({
        fieldId: 'entity',
        value: interSOcustomerId
      });
    } */

    if (customerSalesOrderData.poNumber) {
      // PO Number
      soRecord.setValue({
        fieldId: 'otherrefnum',
        value: customerSalesOrderData.poNumber
      });
    }

    // Start Date - TODO
    soRecord.setValue({
      fieldId: 'trandate',
      value: new Date()
    });

    /* Subsidiary from parameters
    if (interSOsubsidiaryId) {
      log.debug({
        title: 'interSOsubsidiaryId',
        details: interSOsubsidiaryId
      });
      soRecord.setValue({
        fieldId: 'subsidiary',
        value: interSOsubsidiaryId
      });
    } */

    if (customerSalesOrderData.department) {
      // Department
      soRecord.setValue({
        fieldId: 'department',
        value: customerSalesOrderData.department
      });
    }

    if (customerSalesOrderData.location) {
      // Lcoation
      soRecord.setValue({
        fieldId: 'location',
        value: customerSalesOrderData.location
      });
    }

    /* Set the currency as Canadian Dollar CAD
    if (interSOCadId) {
      log.debug({
        title: 'interSOCadId',
        details: interSOCadId
      });
      soRecord.setValue({
        fieldId: 'currency',
        value: interSOCadId
      });
    }

    // Set the intercompany Purchase Order
    if (poID) {
      soRecord.setValue({
        fieldId: 'intercotransaction',
        value: poID
      });
    } */

    // Create the lines from the trigger sales order
    if (customerSalesOrderData.arrayLineItem.length > 0) {
      for (let i = 0; i < customerSalesOrderData.arrayLineItem.length; i++) {
        // Add an Item line
        soRecord.selectNewLine({ sublistId: 'item' });

        // Item ID
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'item',
          value: customerSalesOrderData.arrayLineItem[i].itemId
        });

        // Item Quantity
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'quantity',
          value: customerSalesOrderData.arrayLineItem[i].itemQty
        });

        // Item Rate
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'rate',
          value: customerSalesOrderData.arrayLineItem[i].itemRate
        });

        // Item Location
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'location',
          value: customerSalesOrderData.location
        });

        // Item Department
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'department',
          value: customerSalesOrderData.arrayLineItem[i].itemDepartment
        });

        // Commit the line
        soRecord.commitLine({ sublistId: 'item' });
      }
    }

    // Save the Sales Order
    const transactionID = soRecord.save({
      enableSourcing: true,
      ignoreMandatoryFields: true
    });
    log.debug({
      title: 'Intercompany sales Order Created',
      details: transactionID
    });

    return transactionID;
  };

  const getSOTriggerData = (interPurchaseOrder) => {
    // Get the created from sales order = Customer Sales Order
    const createdfromSO = interPurchaseOrder.getValue({
      fieldId: 'createdfrom'
    });

    if (createdfromSO) {
      // Load the customer sales order
      const triggerSORec = record.load({
        type: record.Type.SALES_ORDER,
        id: createdfromSO,
        isDynamic: true
      });
      // Validate information in the sales order
      const interFulfillmentLocation = triggerSORec.getValue({
        fieldId: 'custbody_bpc_ic_location'
      });

      if (interFulfillmentLocation) {
        // Get the header and line item information

        // Get line information
        const lineCount = triggerSORec.getLineCount({
          sublistId: 'item'
        });
        // Array with the item information
        const arrayLineItem = [];
        if (lineCount) {
          for (let j = 0; j < lineCount; j++) {
            const createPo = triggerSORec.getSublistValue({
              sublistId: 'item',
              fieldId: 'createpo',
              line: j
            });
            if (createPo) {
              arrayLineItem.push({
                itemId: triggerSORec.getSublistValue({
                  sublistId: 'item',
                  fieldId: 'item',
                  line: j
                }),
                itemQty: triggerSORec.getSublistValue({
                  sublistId: 'item',
                  fieldId: 'quantity',
                  line: j
                }),
                itemRate: triggerSORec.getSublistValue({
                  sublistId: 'item',
                  fieldId: 'rate',
                  line: j
                }),
                itemDepartment: triggerSORec.getSublistValue({
                  sublistId: 'item',
                  fieldId: 'department',
                  line: j
                })
              });
            }
          }
        }

        // Header information
        const trandate = triggerSORec.getValue({
          fieldId: 'trandate'
        });
        const poNumber = triggerSORec.getValue({
          fieldId: 'otherrefnum'
        });
        const subsidiary = triggerSORec.getValue({
          fieldId: 'subsidiary'
        });
        const location = triggerSORec.getValue({
          fieldId: 'custbody_bpc_ic_location'
        });
        const department = triggerSORec.getValue({
          fieldId: 'department'
        });

        // return the sales order information
        return {
          trandate,
          poNumber,
          subsidiary,
          location,
          department,
          arrayLineItem
        };
      }
    }

    return false;
  };

  return { beforeSubmit, afterSubmit };
});
