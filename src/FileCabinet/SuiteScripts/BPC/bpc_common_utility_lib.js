/**
 * @NApiVersion 2.1
 * @NAmdConfig /SuiteScripts/BPC/config.json
 */

define(['N/error', 'N/record', 'N/runtime', 'N/search'], (error, record, runtime, search) => {
  /**
   * Searches for records of a specific type in NetSuite and returns a mapping of their script IDs to internal IDs.
   *
   * @param {string} type - The NetSuite record type or list to search for.
   * @returns {Object} An object mapping lowercase script IDs to internal IDs of the records found.
   */
  const searchConstant = (type) => {
    const results = {};

    search
      .create({
        type,
        filters: [{ name: 'isinactive', operator: search.Operator.IS, values: false }],
        columns: ['internalId', 'scriptid']
      })
      .run()
      .each((result) => {
        const scriptId = result.getValue({ name: 'scriptid' })?.toLowerCase();

        if (scriptId) {
          Object.assign(results, { [scriptId]: String(result.getValue({ name: 'internalId' })) });
        }

        return true;
      });

    return results;
  };

  const asyncLib = {
    /**
     * Handles a request by executing an asynchronous callback function and returning a standardized response.
     *
     * @param {Object} params - An object containing the function parameters.
     * @param {function} params.callback - The asynchronous callback function to execute. This function should return a Promise.
     * @returns {Promise<Object>} A Promise that resolves to a response object with the following properties:
     *   - isSuccess: (boolean) Indicates whether the callback was successful (true) or not (false).
     *   - ...otherProperties: (any) If successful, the properties returned by the callback function are directly merged into the response object.
     *   - error: (string) A formatted error message (if an error occurred).
     */
    async handleRequest({ callback }) {
      const response = {};

      try {
        const callbackValues = await callback();

        if (callbackValues) {
          Object.assign(response, callbackValues);
        }

        Object.assign(response, { isSuccess: true });
      } catch (e) {
        log.error(`handleRequest`, e);
        Object.assign(response, { isSuccess: false, error: `${e.name}: ${e.message}` });
      }

      return response;
    },

    /**
     * Creates a new NetSuite record asynchronously and populates it with provided data.
     *
     * @param {Object} options - Options for creating the record.
     * @param {Set<string>} [options.apply] - A Set of transaction IDs to apply the new record to (if applicable).
     * @param {Object} options.body - An object containing body field values for the new record.
     * @param {boolean} [options.ignoreMandatoryFields=false] - Whether to ignore mandatory fields during save.
     * @param {boolean} [options.isDynamic=true] - Whether to create the record in dynamic mode.
     * @param {Object} options.sublists - An object where keys are sublist IDs and values are arrays of line objects representing the sublist data.
     * @param {boolean} [options.throwOnApplyFailure=true] - Whether to throw an error if some IDs could not be applied.
     * @param {string} options.type - The type of the record to create (e.g., record.Type.INVOICE, 'customrecord_123', etc.).
     * @returns {Promise<number>} A Promise that resolves to the internal ID of the newly created record.
     * @throws {Error} If an error occurs during record creation or saving, or if some IDs could not be applied and `throwOnApplyFailure` is true.
     */
    async createRecord(options) {
      try {
        const {
          apply,
          body,
          ignoreMandatoryFields = false,
          isDynamic = true,
          sublists,
          throwOnApplyFailure = true,
          type
        } = options;
        const newRecord = await record.create.promise({ type, isDynamic });

        lib.setBodyValues(newRecord, body);

        for (const sublistId in sublists) {
          if (Object.hasOwnProperty.call(sublists, sublistId)) {
            for (const line of sublists[sublistId]) {
              lib.setNewLineValues(newRecord, { line, sublistId });
            }
          }
        }

        if (apply?.size) {
          lib.applyToTransactions(newRecord, { throwOnApplyFailure, ids: apply });
        }

        return newRecord.save.promise({ enableSourcing: isDynamic, ignoreMandatoryFields });
      } catch (e) {
        log.error(`createRecord`, `options: ${JSON.stringify(options)}`);
        throw e;
      }
    },

    /**
     * Deletes a set of records asynchronously.
     *
     *  @param {Object[]} recordsToProcess - An array of objects containing the internal ID and type of each record to delete.
     * @returns {Promise<PromiseSettledResult[]>} A Promise that resolves to an array of PromiseSettledResult objects.
     * @throws {Error} If there are issues deleting the records.
     */
    async deleteRecords(recordsToProcess, { purgeRecords = false }) {
      try {
        if (!Array.isArray(recordsToProcess)) {
          throw error.create({
            name: error.Type.MISSING_REQD_ARGUMENT,
            message: 'recordsToProcess is required and must be an array'
          });
        }

        if (purgeRecords) {
          const purgeRecordTypes = new Set([
            record.Type.CREDIT_MEMO,
            record.Type.CUSTOMER_PAYMENT,
            record.Type.VENDOR_CREDIT
          ]);
          let purgePromises = [];

          for (const { id, type } of recordsToProcess) {
            if (!purgeRecordTypes.has(type)) {
              continue;
            }

            purgePromises.push(record.load.promise({ id, type }));
          }

          purgePromises = await Promise.allSettled(purgePromises);

          const sublistId = 'apply';

          purgePromises = purgePromises.map(({ value: recordToProcess }) => {
            const lineCount = recordToProcess.getLineCount({ sublistId });

            for (let line = 0; line < lineCount; line++) {
              lib.setLineValues(recordToProcess, { sublistId, line: { line, apply: false } });
            }

            return recordToProcess.save.promise({
              enableSourcing: false,
              ignoreMandatoryFields: true
            });
          });

          await Promise.allSettled(purgePromises);
        }

        const promises = recordsToProcess.map(({ id, type }) =>
          record.delete.promise({ id, type })
        );

        return Promise.allSettled(promises);
      } catch (e) {
        log.error(`deleteRecords`, `recordsToProcess: ${JSON.stringify(recordsToProcess)}`);
        log.error(`deleteRecords`, e);
        throw e;
      }
    },

    /**
     * Converts a synchronous callback function into a Promise-based function.
     *
     * @param {Function} callback - The synchronous callback function to promisify.
     * @returns {Function} A new Promise-based function that wraps the original callback.
     */
    promisify(callback) {
      return (...options) => {
        return new Promise((resolve, reject) => {
          try {
            resolve(callback(...options));
          } catch (e) {
            reject(e);
          }
        });
      };
    },

    /**
     * Updates an invoice record with the specified values asynchronously.
     *
     * @param {Object} params - Parameters for updating the invoice.
     * @param {number} params.id - The internal ID of the invoice record to be updated.
     * @param {Object} params.values - The field values to be updated on the invoice.
     * @returns {Promise} A Promise that resolves when the invoice is updated.
     * @throws {SuiteScriptError} Throws an error if there are issues updating the invoice.
     */
    updateInvoice({ id, values }) {
      return record.submitFields.promise({
        id,
        values,
        type: record.Type.INVOICE,
        options: { enableSourcing: true, ignoreMandatoryFields: true }
      });
    }
  };

  const lib = {
    constants: {
      // constant1: {
      //   KEY_1: '_bpc_key_1',
      //   KEY_2: '_bpc_key_2',
      //   load: () => searchConstant('customlist_constant1')
      // }
    },

    /**
     * Applies a record to a set of specified transactions on its "apply" sublist.
     *
     * @param {record.Record} recordToProcess - The NetSuite record object to process.
     * @param {Object} options - An object containing the function parameters.
     * @param {Set<string>} options.ids - A Set of transaction IDs to apply the record to.
     * @param {boolean} [options.throwOnApplyFailure=true] - Whether to throw an error if some IDs could not be applied. Defaults to true.
     * @returns {boolean} - Returns true if at least one ID was applied, otherwise false.
     * @throws {Error} UNAPPLIED_TRANSACTION_IDS if some IDs could not be applied and `throwOnApplyFailure` is true.
     */
    applyToTransactions(recordToProcess, { ids, throwOnApplyFailure = true }) {
      const sublistId = 'apply';
      const lineCount = recordToProcess.getLineCount({ sublistId });
      const idsToProcess = new Set(ids); // To avoid updating object by reference
      let isApplied = false;

      for (let line = 0; line < lineCount; line++) {
        if (!idsToProcess?.size) {
          break;
        }

        const doc = recordToProcess.getSublistValue({ sublistId, line, fieldId: 'doc' });

        if (idsToProcess.has(doc)) {
          lib.setLineValues(recordToProcess, { sublistId, line: { line, apply: true } });
          idsToProcess.delete(doc);
          isApplied = true;
        }
      }

      if (throwOnApplyFailure && idsToProcess.size) {
        throw error.create({
          message: `Some IDs could not be applied to the transaction: ${JSON.stringify([
            ...idsToProcess
          ])}`,
          name: 'UNAPPLIED_TRANSACTION_IDS'
        });
      }

      return isApplied;
    },

    /**
     * Clamps a numerical value to a specified range.
     *
     * @param {number} value - The number to be clamped.
     * @param {number} min - The minimum allowed value.
     * @param {number} max - The maximum allowed value.
     * @returns {number} - The clamped value, within the range [min, max].
     * @throws {Error} If `min` is greater than to `max`.
     */
    clampToRange({ value, min, max }) {
      if (min !== undefined && max !== undefined && min > max) {
        throw error.create({
          message: `Invalid range: min {${min}} must be strictly less or equal than max {${max}}`,
          name: error.Type.INVALID_FLD_VALUE
        });
      }

      let newValue = value;

      if (min !== undefined) {
        newValue = Math.max(min, newValue);
      }

      if (max !== undefined) {
        newValue = Math.min(max, newValue);
      }

      return newValue;
    },

    /**
     * Creates a new NetSuite record and populates it with provided data.
     *
     * @param {Object} options - Options for creating the record.
     * @param {Set<string>} [options.apply] - (Optional) A Set of transaction IDs to apply the new record to (if applicable).
     * @param {Object} options.body - An object containing body field values for the new record.
     * @param {boolean} [options.ignoreMandatoryFields=false] - Whether to ignore mandatory fields during save (defaults to false).
     * @param {boolean} [options.isDynamic=true] - Whether to create the record in dynamic mode (defaults to true).
     * @param {Object} options.sublists - An object where keys are sublist IDs and values are arrays of line objects representing the sublist data.
     * @param {boolean} [options.throwOnApplyFailure=true] - Whether to throw an error if some IDs could not be applied. Defaults to true.
     * @param {string} options.type - The type of the record to create (e.g., record.Type.INVOICE, 'customrecord_123', etc.).
     * @throws {Error} If an error occurs during record creation or saving, or if some IDs could not be applied and `throwOnApplyFailure` is true.
     * @returns {number} The internal ID of the newly created record.
     */
    createRecord(options) {
      try {
        const {
          apply,
          body,
          ignoreMandatoryFields = false,
          isDynamic = true,
          sublists,
          throwOnApplyFailure = true,
          type
        } = options;
        const newRecord = record.create({ type, isDynamic });

        lib.setBodyValues(newRecord, body);

        for (const sublistId in sublists) {
          if (Object.hasOwnProperty.call(sublists, sublistId)) {
            for (const line of sublists[sublistId]) {
              lib.setNewLineValues(newRecord, { line, sublistId });
            }
          }
        }

        if (apply?.size) {
          lib.applyToTransactions(newRecord, { throwOnApplyFailure, ids: apply });
        }

        const id = newRecord.save({ enableSourcing: isDynamic, ignoreMandatoryFields });
        log.debug(`createRecord`, `type: ${type}, id: ${id}`);

        return id;
      } catch (e) {
        log.error(`createRecord`, `options: ${JSON.stringify(options)}`);
        throw e;
      }
    },

    /**
     * Ensures that the provided value is represented as an array.
     * @param {*} data - The value to be converted or wrapped in an array.
     * @returns {Array} The input value represented as an array.
     */
    ensureArray(data) {
      return Array.isArray(data) ? data : [data];
    },

    /**
     *Ensures that columns within the provided search object are unique based on their names and properly named.
     *@param {Object} searchToProcess - The search object to process.
     */
    ensureUniqueColumns(searchToProcess) {
      const columnIds = new Set();
      const columns = [];

      for (const column of searchToProcess.columns) {
        const { formula, join, label, name, summary } = column;
        let newName = name;

        if (formula) {
          if (label) {
            newName += `_${label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
          }

          if (columnIds.has(newName)) {
            newName = `${name}_${columns.length}`;
          }

          columns.push(search.createColumn({ formula, label, summary, name: newName }));
          columnIds.add(newName);
        } else {
          if (join) {
            newName += `_${join}`;
          }

          if (!columnIds.has(newName)) {
            columns.push(column);
            columnIds.add(newName);
          }
        }
      }

      Object.assign(searchToProcess, { columns });
    },

    /**
     * Executes a callback function with automatic retries on failure.
     *
     * This function attempts to execute the provided `callback` function. If the callback fails (throws an error),
     * it retries execution after a specified delay. Retries continue until either the callback succeeds,
     * or the maximum number of retries is exhausted. If all retries fail, a custom 'RETRY_EXHAUSTED' error is thrown.
     *
     * @param {Object} options - Parameters for the function.
     * @param {function} options.callback - The function to execute.
     * @param {number} [options.delay=1000] - (Optional) Delay between retries in milliseconds (defaults to 1 second).
     * @param {number} [options.retries=1] - (Optional) Maximum number of retries (defaults to 1).
     * @param {number} [options.originalRetries=retries] - (Optional) Original number of retries (used for logging).
     *
     * @throws {Error} A custom error with the name 'RETRY_EXHAUSTED' if all retries fail.
     *
     * @returns {any} The return value of the `callback` function if it succeeds.
     */
    executeWithRetry(options) {
      const { callback, delay = 1000, retries = 1, originalRetries = retries } = options;

      try {
        return callback();
      } catch (e) {
        if (retries > 0) {
          log.error(
            `executeWithRetry - ${originalRetries - retries + 1}/${originalRetries}`,
            `Waiting ${delay / 1000} seconds for next attempt`
          );
          const date = new Date();

          date.setMilliseconds(date.getMilliseconds() + delay);

          while (new Date() < date) {
            // wait for timeout
          }

          return lib.executeWithRetry({ ...options, originalRetries, retries: retries - 1 });
        }

        throw error.create({
          message: `All ${originalRetries} retries failed for operation: ${e}`,
          name: `RETRY_EXHAUSTED`
        });
      }
    },

    /**
     * Provides default request method handlers that throw an error if the request method is not allowed.
     *
     * @param {Object} options - An object containing the following parameters.
     * @param {string[]} options.allowedMethods - An array of allowed HTTP request methods (e.g., ['GET', 'POST']).
     * @returns {Object} An object with methods for handling GET, POST, PUT, and DELETE requests.
     *                   Each method returns the result of calling `lib.handleRequest` with an error-throwing callback.
     */
    getDefaultRequestMethods({ allowedMethods }) {
      const defaultHandler = () =>
        lib.handleRequest({
          callback() {
            throw error.create({
              message: `This endpoint only supports ${allowedMethods.join(', ')} requests.`,
              name: 'INVALID_REQUEST_METHOD'
            });
          }
        });

      return {
        get() {
          return defaultHandler();
        },
        post() {
          return defaultHandler();
        },
        put() {
          return defaultHandler();
        },
        delete() {
          return defaultHandler();
        }
      };
    },

    /**
     * Retrieves the ISO week number for a given date.
     *
     * @param {Date} date - The date for which to retrieve the ISO week number.
     * @returns {Object} An object containing the year, week number, and ISO week string.
     */
    getISOWeek(date) {
      const d = new Date(date);

      // Find the Thursday in the current week
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));

      // Calculate the ISO week number
      const year = d.getFullYear();
      const week = Math.floor((d.getTime() - new Date(year, 0, 1).getTime()) / 604800000) + 1;

      return { year, week, iso: `${year}-W${String(week).padStart(2, '0')}` };
    },

    /**
     *Retrieves script parameters by their IDs and checks for any empty parameters.
     *@param {string | string[]} paramIds - An array of parameter IDs to retrieve.
     *@returns {Object} - An object containing empty parameter IDs and script parameters.
     */
    getScriptParams(paramIds) {
      const emptyParamIds = new Set();
      const scriptParams = {};
      const paramIdsArray = lib.ensureArray(paramIds);
      const script = runtime.getCurrentScript();

      for (const id of paramIdsArray) {
        Object.assign(scriptParams, { [id]: script.getParameter({ name: id }) });

        if (!scriptParams[id]) {
          emptyParamIds.add(id);
        }
      }

      return { emptyParamIds, scriptParams };
    },

    /**
     * Generates a timestamp string from a given Date object or the current date and time.
     *
     * @param {Object} [options] - An optional object containing the following properties:
     * @param {Date} [options.date=new Date()] - The Date object to generate the timestamp from (defaults to the current date and time).
     * @param {string} [options.formatType=''] - The desired format of the timestamp (optional, defaults to 'YYYYMMDDHHmmss').
     * @returns {string} The timestamp string in the specified format.
     */
    getTimestamp({ date = new Date(), formatType = '' } = {}) {
      const dateString = date.toISOString().replace(/[-:T.Z]/g, '');

      switch (formatType.toLowerCase()) {
        case 'mmss': {
          return dateString.slice(10, 14);
        }

        case 'yyyymmdd': {
          return dateString.slice(0, 8);
        }

        default: {
          return dateString.slice(0, 14);
        }
      }
    },

    /**
     * Groups an array of objects by specified keys.
     *
     * @param {Object} options - The options for grouping.
     * @param {Object[]} options.array - The array of objects to be grouped.
     * @param {string|string[]} options.keys - The key or keys to group by.
     * @param {string} [options.separator='|'] - The separator to use for concatenating keys.
     * @param {string} [options.groupKey='values'] - The key to use for the grouped values.
     * @returns {Object} An object where each key is a concatenation of the specified keys' values,
     *                   and each value is an object containing the grouped key values and an array of objects.
     */
    groupByKeys({ array, keys, separator = '|', groupKey = 'values' }) {
      const parsedKeys = lib.ensureArray(keys);

      return array.reduce((accum, line) => {
        const key = parsedKeys.map((lineKey) => String(line?.[lineKey])).join(separator);

        if (!accum[key]) {
          const keyObject = parsedKeys.reduce((obj, lineKey) => {
            Object.assign(obj, { [lineKey]: line[lineKey] });
            return obj;
          }, {});

          Object.assign(accum, { [key]: { ...keyObject, [groupKey]: [] } });
        }

        accum[key][groupKey].push(line);
        return accum;
      }, {});
    },

    /**
     * Handles a request by executing a callback function and returning a standardized response.
     *
     * @param {Object} options - An object containing the function parameters.
     * @param {function} options.callback - The callback function to execute. This function can return a value or throw an error.
     * @returns {Object} A response object with the following properties:
     *    - isSuccess: (boolean) Indicates whether the callback was successful (true) or not (false).
     *    - ...otherProperties: (any) If successful, the properties returned by the callback function are directly merged into the response object.
     *    - error: (string) A formatted error message (if an error occurred).
     */
    handleRequest({ callback }) {
      const response = {};

      try {
        const callbackValues = callback();

        if (callbackValues) {
          Object.assign(response, callbackValues);
        }

        Object.assign(response, { isSuccess: true });
      } catch (e) {
        log.error(`handleRequest`, e);
        Object.assign(response, { isSuccess: false, error: `${e.name}: ${e.message}` });
      }

      return response;
    },

    /**
     * Validates the email format using regex.
     *
     * @param {string} emailToProcess - The email to validate.
     * @returns {boolean} - True if the email is valid, false otherwise.
     */
    isValidEmail(emailToProcess) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      return emailToProcess ? emailRegex.test(String(emailToProcess).toLowerCase()) : false;
    },

    /**
     * Loads a constant value from a predefined set of constants.
     *
     * @param {string} name - The name of the constant to load.
     * @param {Object} [constants={}] - An object to store the loaded constant value (optional, defaults to an empty object).
     * @param {boolean} [forceLoad=false] - A flag indicating whether to force the loading of the constant, even if it's already present in the `constants` object (optional, defaults to false).
     * @throws {Error} INVALID_FLD_VALUE if the constant with the specified `name` is not found.
     * @returns {Object} The `constants` object with the loaded constant value added.
     */
    loadConstant(name, constants = {}, forceLoad = false) {
      if (!lib.constants[name]) {
        throw error.create({
          name: error.Type.INVALID_FLD_VALUE,
          message: `Constant '${name}' not found.`
        });
      }

      if (!constants[name] || forceLoad) {
        Object.assign(constants, { [name]: lib.constants[name].load() });
      }

      return constants;
    },

    /**
     * Parses a value and determines if it represents a boolean true.
     * @param   {any}       valueToParse    The value to be parsed and evaluated as a boolean.
     * @returns {Boolean}   True if the value is considered true; otherwise, false.
     */
    parseBoolean(valueToParse) {
      if (typeof valueToParse === 'string') {
        // eslint-disable-next-line no-param-reassign
        valueToParse = valueToParse.toLowerCase();
      }

      return [true, 'true', 1, '1', 't'].includes(valueToParse);
    },

    /**
     * Parses a value into a number, rounding it to the specified number of decimal places.
     *
     * @param {Object} options - An object containing the function parameters.
     * @param {number} [options.decimalPlaces=2] - (Optional) The number of decimal places to round to (defaults to 2).
     * @param {any} options.value - The value to parse into a number.
     * @returns {number} The parsed and rounded number, or 0 if the input value cannot be converted to a number.
     */
    parseNumber({ decimalPlaces = 2, value }) {
      return value ? Number(Number(value).toFixed(decimalPlaces)) : 0;
    },

    /**
     * Runs a paged search and invokes a callback for each result.
     *
     * @param {Object} options - Options for running the paged search.
     * @param {function} options.callback - The callback function to be invoked for each result.
     * @param {number} [options.pageSize=1000] - The page size for the paged search.
     * @param {Object} options.searchToProcess - The search object to be processed.
     * @returns {number} The total count of results from the paged search.
     */
    runPagedSearch({ callback, pageSize = 1000, searchToProcess }) {
      const pagedData = searchToProcess.runPaged({ pageSize });

      if (callback) {
        pagedData.pageRanges.forEach(function (pageRange) {
          const { data } = pagedData.fetch({ index: pageRange.index });

          data.forEach(callback);
        });
      }

      return pagedData.count;
    },

    /**
     * Sets values for the body fields of a NetSuite record.
     * @param {record.Record} recordToProcess - The NetSuite record to process.
     * @param {Object} options - Options for setting body values.
     * @param {string} options.country - The country value to set.
     * @param {string} options.customform - The custom form value to set.
     * @param {string} options.entity - The entity value to set.
     * @param {string} options.subsidiary - The subsidiary value to set.
     * @param {Object} options.fieldValues - Additional field values to set.
     */
    setBodyValues(recordToProcess, { country, customform, entity, subsidiary, ...fieldValues }) {
      /* eslint-disable no-unused-expressions */
      customform && recordToProcess.setValue({ fieldId: 'customform', value: customform });
      country && recordToProcess.setValue({ fieldId: 'country', value: country });
      entity && recordToProcess.setValue({ fieldId: 'entity', value: entity });
      subsidiary && recordToProcess.setValue({ fieldId: 'subsidiary', value: subsidiary });

      for (const fieldId in fieldValues) {
        if (Object.hasOwnProperty.call(fieldValues, fieldId)) {
          recordToProcess.setValue({ fieldId, value: fieldValues[fieldId] });
        }
      }
    },

    /**
     *Sets values for a line in a NetSuite record sublist.
     *@param {record.Record} recordToProcess - The NetSuite record to process.
     *@param {Object} options - Options for setting line values.
     *@param {Object} options.line - Object containing line values to set.
     *@param {number} options.line.line - The line number to set values for.
     *@param {Object} options.fieldValues - Field values to set for the line.
     *@param {string} options.sublistId - The sublist ID.
     */
    setLineValues(recordToProcess, { line: { line, ...fieldValues }, sublistId }) {
      if (recordToProcess.isDynamic) {
        recordToProcess.selectLine({ sublistId, line });
      }

      for (const fieldId in fieldValues) {
        if (!Object.hasOwnProperty.call(fieldValues, fieldId)) {
          continue;
        }

        if (recordToProcess.isDynamic) {
          recordToProcess.setCurrentSublistValue({
            sublistId,
            fieldId,
            value: fieldValues[fieldId]
          });
        } else {
          recordToProcess.setSublistValue({
            sublistId,
            fieldId,
            line,
            value: fieldValues[fieldId]
          });
        }
      }

      if (recordToProcess.isDynamic) {
        recordToProcess.commitLine({ sublistId });
      }
    },

    /**
     * Sets values for a new line in a NetSuite record sublist.
     * @param {record.Record} recordToProcess - The NetSuite record to process.
     * @param {Object} options - Options for setting new line values.
     * @param {Object} options.line - Object containing line values to set.
     * @param {string} options.line.account - The account value to set.
     * @param {string} options.line.item - The item value to set.
     * @param {Object} options.fieldValues - Additional field values to set.
     * @param {string} options.sublistId - The sublist ID.
     */
    setNewLineValues(recordToProcess, { line: { account, item, ...fieldValues }, sublistId }) {
      /* eslint-disable no-unused-expressions */
      recordToProcess.selectNewLine({ sublistId });
      item && recordToProcess.setCurrentSublistValue({ sublistId, fieldId: 'item', value: item });
      account &&
        recordToProcess.setCurrentSublistValue({ sublistId, fieldId: 'account', value: account });

      for (const fieldId in fieldValues) {
        if (Object.hasOwnProperty.call(fieldValues, fieldId)) {
          recordToProcess.setCurrentSublistValue({
            sublistId,
            fieldId,
            value: fieldValues[fieldId]
          });
        }
      }

      recordToProcess.commitLine({ sublistId });
    }
  };

  return { ...lib, asyncLib };
});
