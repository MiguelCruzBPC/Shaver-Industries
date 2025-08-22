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
      // Get the purchase order ID
      const poID = scriptContext.newRecord.id;

      // get the sales order rec
      const interPurchaseOrder = scriptContext.newRecord;
      if (poID) {
        // Get the triggered sales order record
        const salesOrdCustomerData = getSOTriggerData(interPurchaseOrder);
        log.debug({
          title: 'salesOrdCustomerData',
          details: salesOrdCustomerData
        });

        // Validate if the customer sales order has data for the intercompany creation
        if (salesOrdCustomerData && salesOrdCustomerData.arrayLineItem.length) {
          // Get the value of Paired internal ID from script parameter
          const intercompanyPairedStatus = runtime
            .getCurrentScript()
            .getParameter({ name: 'custscript_bpc_inter_status_paired' });

          // Create the sales order intercompany
          const soIdCreated = createInterTransaction(
            salesOrdCustomerData,
            intercompanyPairedStatus,
            poID
          );
          if (soIdCreated) {
            // Get the approval status from parameters to update the intercompany purchase order
            const approvalStatusApproved = runtime
              .getCurrentScript()
              .getParameter({ name: 'custscript_bpc_approval_status' });

            // Update the intercompany purchase order
            record.submitFields({
              type: record.Type.PURCHASE_ORDER,
              id: poID,
              values: {
                intercotransaction: soIdCreated,
                intercostatus: intercompanyPairedStatus,
                approvalstatus: approvalStatusApproved
              }
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
  const createInterTransaction = (customerSalesOrderData, intercompanyPairedStatus, poID) => {
    // Create the Sales Order
    const soRecord = record.create({
      type: record.Type.SALES_ORDER,
      isDynamic: true
    });

    // Set main body fields
    // hardcode customer - IC-Shaver Industries, LLC
    const interSOcustomerId = runtime
      .getCurrentScript()
      .getParameter({ name: 'custscript_bpc_inter_so_customer' });

    if (interSOcustomerId) {
      soRecord.setValue({
        fieldId: 'entity',
        value: interSOcustomerId
      });
    }

    if (intercompanyPairedStatus) {
      // Set the intercompany status as Paired
      soRecord.setValue({
        fieldId: 'intercostatus',
        value: intercompanyPairedStatus // Paired
      });
    }

    // Set the Paired Intercompany Transaction field in the PURCHASE ORDER
    if (poID) {
      soRecord.setValue({
        fieldId: 'intercotransaction',
        value: poID
      });
    }

    // Start Date - TODO
    soRecord.setValue({
      fieldId: 'trandate',
      value: new Date()
    });

    // Lcoation
    soRecord.setValue({
      fieldId: 'location',
      value: customerSalesOrderData.location
    });

    // Department
    soRecord.setValue({
      fieldId: 'department',
      value: customerSalesOrderData.department
    });

    // PO Number
    soRecord.setValue({
      fieldId: 'otherrefnum',
      value: customerSalesOrderData.poNumber
    });

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
    const transactionID = soRecord.save();
    log.debug({
      title: 'Intercompany sales Order Created',
      details: transactionID
    });
    return transactionID;
  };

  const getSOTriggerData = (interPurchaseOrder) => {
    const createdfromSO = interPurchaseOrder.getValue({
      fieldId: 'createdfrom'
    });

    // Get the value of intercompany status pending
    const intercompanyStatus = runtime
      .getCurrentScript()
      .getParameter({ name: 'custscript_bpc_inter_status_pending' });
    // Get the current intercompany status
    const poInterStatus = interPurchaseOrder.getValue({
      fieldId: 'intercostatus'
    });
    if (createdfromSO && Number(intercompanyStatus) === Number(poInterStatus)) {
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

  return { afterSubmit };
});
