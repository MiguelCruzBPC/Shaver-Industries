/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/search', 'N/runtime'], /**
 * @param{record} record
 * @param{search} search
 * @param{runtime} runtime
 */ (record, search, runtime) => {
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
      const soID = scriptContext.newRecord.id;
      if (!soID) {
        return;
      }

      // Load the sales order record (this is the record to update)
      const soLoadRec = record.load({
        type: record.Type.SALES_ORDER,
        id: soID,
        isDynamic: true
      });
      // Get the status
      const soLoadedStatus = soLoadRec.getValue({
        fieldId: 'statusRef'
      });

      // Get the allow cross subsidiary fulfillment field
      const allowCrossSub = soLoadRec.getValue({
        fieldId: 'iscrosssubtransaction'
      });

      // Get the Advanced Intercompany Journal Entry Link field
      const advInterJournalEntry = soLoadRec.getValue({
        fieldId: 'custbody_bpc_adv_inter_je'
      });

      // this if validates that logic runs only when the button "Approve" is clicked.
      if (soLoadedStatus === 'pendingFulfillment' && allowCrossSub && !advInterJournalEntry) {
        // Get the sales order information
        const { arrayItemIds, arrayLineData, headerDataSO } = getSalesOrderData(soLoadRec);
        if (arrayItemIds.length > 0) {
          const itemVendorRates = getAllResultsPaged(getItemVendorRate(arrayItemIds));

          // Get the total amount sales order
          const totalAmounSO = getTotalVendorAmountSO(itemVendorRates, arrayLineData);
          log.debug({
            title: 'totalAmounSO',
            details: totalAmounSO
          });

          if (Number(totalAmounSO) > 0) {
            // Create the Advanced Intercompany Journal Entry
            const advInterJournalEntryID = createJournalEntry(
              totalAmounSO,
              headerDataSO.subsidiary
            );
            log.debug({
              title: 'advInterJournalEntryID',
              details: advInterJournalEntryID
            });
            if (advInterJournalEntryID && soID) {
              // Submit the advanced intercompany JE in the sales order
              soLoadRec.setValue({
                fieldId: 'custbody_bpc_adv_inter_je',
                value: advInterJournalEntryID
              });
            }
          }
        }
      }

      // Save the sales order loaded
      soLoadRec.save();
    } catch (e) {
      log.error({
        title: 'Error AfterSubmit',
        details: e
      });
    }
  };

  const createJournalEntry = (totalAmounSO, subsidiary) => {
    const journalRec = record.create({
      type: record.Type.ADV_INTER_COMPANY_JOURNAL_ENTRY,
      isDynamic: true
    });

    // Set the subsidiary
    journalRec.setValue({
      fieldId: 'subsidiary',
      value: subsidiary
    });

    // set the approval status
    journalRec.setValue({
      fieldId: 'approvalstatus',
      value: 2 // Approved
    });

    // Get Script Parameters (accounts)
    const scriptObj = runtime.getCurrentScript();
    const accInterPayables = scriptObj.getParameter({ name: 'custscript_bpc_acc_inter_payables' });
    const accInterCOGS = scriptObj.getParameter({ name: 'custscript_bpc_acc_inter_cogs' });
    const accInterReceivables = scriptObj.getParameter({
      name: 'custscript_bpc_acc_inter_receivables'
    });
    const accInterIncome = scriptObj.getParameter({ name: 'custscript_bpc_acc_inter_income' });
    const interVendorInc = scriptObj.getParameter({ name: 'custscript_bpc_inter_vendor' }); //	IC-Shaver Industries Inc
    const interVendorLLC = scriptObj.getParameter({ name: 'custscript_bpc_vendor_llc' }); //	IC-Shaver Industries, LLC
    const subsidiaryLLC = scriptObj.getParameter({ name: 'custscript_bpc_subsidiary_llc' }); // Shaver Industries, LLC
    const subsidiaryInc = scriptObj.getParameter({ name: 'custscript_bpc_subsidiary_inc' }); // Shaver Industries Inc

    // Debit line
    addLineJournal(
      journalRec,
      'debit',
      accInterCOGS,
      totalAmounSO,
      subsidiaryLLC,
      subsidiaryInc,
      interVendorInc
    );
    // Credit line
    addLineJournal(
      journalRec,
      'credit',
      accInterPayables,
      totalAmounSO,
      subsidiaryLLC,
      subsidiaryInc,
      interVendorInc
    );
    // Debit line
    addLineJournal(
      journalRec,
      'debit',
      accInterReceivables,
      totalAmounSO,
      subsidiaryInc,
      subsidiaryLLC,
      interVendorLLC
    );
    // Credit line
    addLineJournal(
      journalRec,
      'credit',
      accInterIncome,
      totalAmounSO,
      subsidiaryInc,
      subsidiaryLLC,
      interVendorLLC
    );

    return journalRec.save();
  };

  const addLineJournal = (
    journalRec,
    typeLine,
    accParam,
    soAmount,
    subsidiary,
    dueToSubsidiary,
    vendorId
  ) => {
    // ADD the new line DEBIT OR CREDIT
    journalRec.selectNewLine({
      sublistId: 'line'
    });
    // Subsidiary
    if (subsidiary) {
      journalRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'linesubsidiary',
        value: subsidiary
      });
    }

    // account
    if (accParam) {
      journalRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: accParam
      });
    }

    // amount
    if (soAmount) {
      journalRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: typeLine,
        value: soAmount
      });
    }

    // set Entity
    if (vendorId) {
      journalRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'entity',
        value: vendorId
      });
    }

    // Set the Due To Subsidiary
    if (dueToSubsidiary) {
      journalRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'duetofromsubsidiary',
        value: dueToSubsidiary
      });
    }

    // commit the line
    journalRec.commitLine({
      sublistId: 'line'
    });
  };

  const getTotalVendorAmountSO = (itemVendorRates, arrayLineData) => {
    // Build a map { itemId: vendorCost }
    const vendorCostMap = itemVendorRates.reduce((acc, item) => {
      acc[item.itemId] = Number(item.vendorCost);
      return acc;
    }, {});

    // Enrich arrayLineData with vendorCost
    const enrichedData = arrayLineData.map((line) => ({
      ...line,
      vendorCost: vendorCostMap[line.itemID] ?? null
    }));

    // Calculate total amount = sum(qty * vendorCost) where vendorCost exists
    return (
      enrichedData.reduce((sum, line) => {
        return sum + (line.vendorCost !== null ? line.itemQty * line.vendorCost : 0);
      }, 0) || null
    );
  };

  const getItemVendorRate = (arrayItemIds) => {
    return search.create({
      type: 'item',
      filters: [
        ['internalid', 'anyof', arrayItemIds],
        'AND',
        ['vendor.internalidnumber', 'equalto', '314']
      ],
      columns: [
        search.createColumn({ name: 'vendorcost', label: 'Vendor Price' }),
        search.createColumn({ name: 'internalid', label: 'ID' })
      ]
    });
  };

  function getAllResultsPaged(mySearch) {
    const results = [];

    const pagedData = mySearch.runPaged({ pageSize: 1000 });
    pagedData.pageRanges.forEach((pageRange) => {
      const page = pagedData.fetch({ index: pageRange.index });
      page.data.forEach((result) => {
        results.push({
          itemId: Number(result.getValue({ name: 'internalid' })),
          vendorCost: parseFloat(result.getValue({ name: 'vendorcost' }))
        });
      });
    });

    return results;
  }

  const getSalesOrderData = (soRecord) => {
    // Get the header data
    const headerDataSO = {
      subsidiary: soRecord.getValue({ fieldId: 'subsidiary' })
    };
    const soLineCount = soRecord.getLineCount({
      sublistId: 'item'
    });
    // Array to store the IDs
    const arrayItemIds = [];
    // Array to store the sales order data
    const arrayLineData = [];

    if (soLineCount > 0) {
      // Get the sales order line information
      for (let i = 0; i < soLineCount; i++) {
        // Get the inventory location
        const invLocation = soRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'inventorylocation',
          line: i
        });

        // Get the inventory subsidiary
        const invSubsidiary = soRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'inventorysubsidiary',
          line: i
        });

        // Get the item ID
        const itemID = Number(
          soRecord.getSublistValue({
            sublistId: 'item',
            fieldId: 'item',
            line: i
          })
        );

        // Get the quantity
        const itemQty = soRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'quantity',
          line: i
        });

        if (invLocation && invSubsidiary) {
          arrayLineData.push({
            itemID,
            itemQty
          });

          // Store the item ID as unique time
          if (!arrayItemIds.includes(itemID)) {
            arrayItemIds.push(itemID);
          }
        }
      }
    }

    return {
      arrayItemIds,
      arrayLineData,
      headerDataSO
    };
  };

  return { afterSubmit };
});
