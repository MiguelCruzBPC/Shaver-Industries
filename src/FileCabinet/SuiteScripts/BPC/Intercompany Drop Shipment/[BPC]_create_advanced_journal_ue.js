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
      const { arrayItemIds, arrayLineData } = getSalesOrderData(soRecord);
      log.debug({
        title: 'arrayLineData',
        details: arrayLineData
      });
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
          createJournalEntry(arrayLineData, itemVendorRates);
        }
      }
    } catch (e) {
      log.error({
        title: 'Error AfterSubmit',
        details: e
      });
    }
  };

  const createJournalEntry = (totalAmounSO) => {};

  const getTotalVendorAmountSO = (itemVendorRates, arrayLineData) => {
    log.debug({
      title: 'itemVendorRates',
      details: itemVendorRates
    });
    log.debug({
      title: 'arrayLineData',
      details: arrayLineData
    });
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
      arrayLineData
    };
  };

  return { afterSubmit };
});
