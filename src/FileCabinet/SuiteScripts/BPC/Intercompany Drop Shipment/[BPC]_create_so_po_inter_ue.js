/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/runtime'], /**
 * @param{record} record
 * @param{runtime} runtime
 */ (record, runtime) => {
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
          // Get the value of Paired internal ID from script parameter
          const intercompanyPairedStatus = runtime
            .getCurrentScript()
            .getParameter({ name: 'custscript_bpc_inter_status_paired' });

          // Create the sales order intercompany
          const soIdCreated = createInterTransaction(triggerSOInfo, 'salesorder');
          if (soIdCreated) {
            // Create the purchase order
            const poIdCreated = createInterTransaction(
              triggerSOInfo,
              'purchaseorder',
              soIdCreated,
              intercompanyPairedStatus
            );

            if (poIdCreated) {
              // Set the sales order value in the Paired Intercompany Transaction
              record.submitFields({
                type: record.Type.SALES_ORDER,
                id: poIdCreated,
                values: {
                  intercotransaction: poIdCreated,
                  intercostatus: intercompanyPairedStatus
                }
              });
            }
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
  const createInterTransaction = (
    triggerSOInfo,
    typeTransaction,
    soIdCreated,
    intercompanyPairedStatus
  ) => {
    // Create the Sales Order
    const soRecord = record.create({
      type: typeTransaction,
      isDynamic: true
    });

    // Set main body fields
    // Vendor for Purchase Order or Customer for Sales Order
    if (typeTransaction === 'salesorder') {
      soRecord.setValue({
        fieldId: 'entity',
        value: triggerSOInfo.customer
      });
    } else {
      // Set the Vendor
      soRecord.setValue({
        fieldId: 'entity',
        value: 314 // Vendor: IC-Shaver Industries Inc
      });

      if (intercompanyPairedStatus) {
        // Set the intercompany status as Paired
        soRecord.setValue({
          fieldId: 'intercostatus',
          value: intercompanyPairedStatus // Paired
        });
      }

      // Set the Paired Intercompany Transaction field in the PURCHASE ORDER
      if (soIdCreated) {
        soRecord.setValue({
          fieldId: 'intercotransaction',
          value: soIdCreated
        });
      }
    }

    // Start Date - TODO
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
    const transactionID = soRecord.save();
    log.debug({
      title: 'Transaction ' + typeTransaction + ' Created',
      details: transactionID
    });
    return transactionID;
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
