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
      // Get the sales order ID
      const soId = scriptContext.newRecord.id;

      // get the sales order rec
      const triggerSORec = scriptContext.newRecord;
      if (soId) {
        // Get the triggered sales order record
        const triggerSOInfo = getSOTriggerData(triggerSORec);
        log.debug({
          title: 'triggerSOInfo',
          details: triggerSOInfo
        });
        if (triggerSOInfo && triggerSOInfo.arrayLineItem.length) {
          // Create the sales order intercompany
          createInterSOTransaction(triggerSOInfo);
        }
      }
    } catch (e) {
      log.error({
        title: 'Error AfterSubmit Function',
        details: e
      });
    }
  };

  const createInterSOTransaction = (triggerSOInfo) => {
    // Create the Sales Order
    const soRecord = record.create({
      type: record.Type.SALES_ORDER,
      isDynamic: true
    });

    // Set main body fields
    // Customer
    soRecord.setValue({
      fieldId: 'entity',
      value: triggerSOInfo.customer
    });

    // Start Date
    soRecord.setValue({
      fieldId: 'trandate',
      value: new Date()
    });

    // Lcoation
    soRecord.setValue({
      fieldId: 'location',
      value: triggerSOInfo.location
    });

    // Department
    soRecord.setValue({
      fieldId: 'department',
      value: triggerSOInfo.department
    });

    // PO Number
    soRecord.setValue({
      fieldId: 'otherrefnum',
      value: triggerSOInfo.poNumber
    });

    // Create the lines from the trigger sales order
    if (triggerSOInfo.arrayLineItem.length > 0) {
      for (let i = 0; i < triggerSOInfo.arrayLineItem.length; i++) {
        // Add an Item line
        soRecord.selectNewLine({ sublistId: 'item' });

        // Item ID
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'item',
          value: triggerSOInfo.arrayLineItem[i].itemId
        });

        // Item Quantity
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'quantity',
          value: triggerSOInfo.arrayLineItem[i].itemQty
        });

        // Item Rate
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'rate',
          value: triggerSOInfo.arrayLineItem[i].itemRate
        });

        // Item Location
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'location',
          value: triggerSOInfo.location
        });

        // Item Department
        soRecord.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'department',
          value: triggerSOInfo.arrayLineItem[i].itemDepartment
        });

        // Commit the line
        soRecord.commitLine({ sublistId: 'item' });
      }
    }

    // Save the Sales Order
    const soId = soRecord.save({
      enableSourcing: true,
      ignoreMandatoryFields: false
    });
    log.debug({
      title: 'Created Sales Order',
      details: soId
    });
  };

  const getSOTriggerData = (triggerSORec) => {
    // validate if sales order is intercompany sales order.
    // if intercompany fulfillment location has a value that means this sales order is the trigger so
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
              itemId: triggerSORec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: j }),
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
      const customer = triggerSORec.getValue({
        fieldId: 'entity'
      });
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
        customer,
        trandate,
        poNumber,
        subsidiary,
        location,
        department,
        arrayLineItem
      };
    }

    return false;
  };

  return { afterSubmit };
});
