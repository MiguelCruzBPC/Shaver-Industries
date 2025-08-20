/**
 * @NApiVersion 2.1
 * @NScriptType plugintypeimpl
 */
define([
  'N/search',
  'N/runtime',
  'N/format',
  'N/email',
  'N/error',
  'N/record',
  'N/query',
  'N/xml'
], (search, runtime, format, email, error, record, query, xml) => ({
  /**
   * Converts string to integer. If value is infinity or can't be converted to a number,
   * 0 will be returned
   * @param {String} stValue - string to be converted
   */
  forceInt(stValue) {
    const intValue = parseInt(stValue, 10);

    if (Number.isNaN(intValue) || stValue == Infinity) {
      return 0;
    }

    return intValue;
  },

  /**
   * Converts string to float. If value is infinity or can't be converted to a number,
   * 0.00 will be returned.
   * @param {String} stValue - string to be converted
   */
  forceFloat(stValue) {
    const flValue = parseFloat(stValue);

    if (Number.isNaN(flValue) || stValue == Infinity) {
      return 0.0;
    }

    return flValue;
  },

  /**
   * Remove duplicate values from an array
   * @param {Array} a - array to remove duplicate values
   */
  uniq(a) {
    return Array.from(new Set(a));
  },

  /**
   * Replaces the character based on the position defined (0-based index
   * @param {String} stValue - any string
   * @param {Integer} intPos - index of character to be replaced
   * @param {String} stReplacement - any string to insert
   */
  replaceCharAt(stValue, intPos, stReplacement) {
    return stValue.substr(0, intPos) + stReplacement + stValue.substr(intPos + 1);
  },

  /**
   * Inserts string to the position defined (0-based index)
   * @param {String} stValue - any string
   * @param {Integer} intPos - index of the character to be replaced
   * @param {String} stInsert - any string to insert
   */
  insertStringAt(stValue, intPos, stInsert) {
    return [stValue.slice(0, intPos), stInsert, stValue.slice(intPos)].join('');
  },

  /**
   * Round off floating number and appends it with currency symbol
   * @param {Float} flValue - floating nu,ber
   * @param {String} stCurrencySymbol - curreny symbol
   * @param {Integer} intDecimalPrecision - number of decimal places
   */
  formatCurrency(flValue, stCurrencySymbol, intDecimalPrecision) {
    let flAmount = flValue;

    if (typeof flValue != 'number') {
      flAmount = parseFloat(flValue);
    }

    const arrDigits = roundToDecimals(flAmount, intDecimalPrecision).toString().split('.');
    arrDigits[0] = arrDigits[0]
      .split('')
      .reverse()
      .join('')
      .replace(/(\d{3})(?=\d)/g, '$1,')
      .split('')
      .reverse()
      .join('');

    return stCurrencySymbol + arrDigits.join('.');
  },

  /**
   * Round decimal number and add percent symbol
   * @param {Float} flValue - floating number
   * @param {String} stPercentSymbol - percent symbol
   * @param {Integer} intDecimalPrecision - number of decimal places
   */
  formatPercent(flValue, stPercentSymbol, intDecimalPrecision) {
    let flAmount = flValue;

    if (typeof flValue != 'number') {
      flAmount = parseFloat(flValue);
    }

    const arrDigits = flAmount.toFixed(intDecimalPrecision).split('.');
    arrDigits[0] = arrDigits[0]
      .split('')
      .reverse()
      .join('')
      .replace(/(\d{3})(?=\d)/g, '$1,')
      .split('')
      .reverse()
      .join('');

    return arrDigits.join('.') + stPercentSymbol;
  },

  /**
   * Round decimal number
   * @param {Float} value - number to round
   * @param {Integer} decimals - number of decimals
   */
  round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
  },

  /**
   * Convert item record type to its corresponding internal id
   * (e.g. 'invtpart' to 'inventoryitem')
   * @param {String} stRecordType - item record to be converted
   */
  toItemInternalId(stRecordType) {
    const stRecordTypeInLowerCase = stRecordType.toLowerCase().trim();

    switch (stRecordTypeInLowerCase) {
      case 'invtpart':
        return record.Type.INVENTORY_ITEM;
      case 'description':
        return record.Type.DESCRIPTION_ITEM;
      case 'assembly':
        return record.Type.ASSEMBLY_ITEM;
      case 'discount':
        return record.Type.DISCOUNT_ITEM;
      case 'group':
        return record.Type.ITEM_GROUP;
      case 'markup':
        return record.Type.MARKUP_ITEM;
      case 'noninvtpart':
        return record.Type.NON_INVENTORY_ITEM;
      case 'othcharge':
        return record.Type.OTHER_CHARGE_ITEM;
      case 'payment':
        return record.Type.PAYMENT_ITEM;
      case 'service':
        return record.Type.SERVICE_ITEM;
      case 'subtotal':
        return record.Type.SUBTOTAL_ITEM;
      case 'giftcert':
        return record.Type.GIFT_CERTIFICATE_ITEM;
      case 'dwnlditem':
        return record.Type.DOWNLOAD_ITEM;
      case 'kit':
        return record.Type.KIT_ITEM;
      default:
        return stRecordTypeInLowerCase;
    }
  },

  /**
   * Get base price of an item
   * @param {String} stItemId - item internal id
   * @param {String} stPriceLevel - price level internal id
   */
  getItemPrice(stItemId, stPriceLevel) {
    if (stPriceLevel == '1') {
      return search.lookupFields({
        type: 'item',
        id: stItemId,
        columns: 'baseprice'
      });
    }

    const objItemSearch = search.create({
      type: 'employee',
      filters: [['isinactive', 'is', 'F'], 'AND', ['internalid', 'is', stItemId]],
      columns: ['otherprices']
    });

    let stId = null;
    objItemSearch.run().each((objResult) => {
      stId = objResult.getValue('price' + stPriceLevel);
      return false;
    });
    return stId;
  },

  /**
   * This function return more than the max 1000 records for a search
   * @param {Object} searchResult - search.ResultSet; pass over result set of search
   */
  getAllSearchResults(searchResult) {
    let arrResults = [];
    let resultSet = [];
    const MAX_SEARCH_SIZE = 1000;
    let count = 0;

    do {
      resultSet = searchResult.getRange({
        start: count,
        end: count + MAX_SEARCH_SIZE
      });
      arrResults = arrResults.concat(resultSet);
      count += MAX_SEARCH_SIZE;
    } while (resultSet.length > 0);

    return arrResults;
  },

  /**
   * return today is weekend or not
   * @param {Date} currentDate
   */
  isWeekend(currentDate) {
    return currentDate.getDay() === 0 || currentDate.getDay() === 6;
  },

  /**
   * returns latest date from array of dates
   * @param {Array} dateList
   */
  getLatestDate(dateList) {
    let lastDate = dateList[0];
    for (let i = 1; i < dateList.length; i += 1) {
      const gap = dateList[i] - lastDate;
      lastDate = gap > 0 ? dateList[i] : lastDate;
    }

    return lastDate;
  },

  /**
   * returns earliest date from array of dates
   * @param {Array} dateList
   */
  getEarliestDate(dateList) {
    let ealierDate = new Date();
    ealierDate.setFullYear(2999);
    ealierDate.setMonth(12);
    ealierDate.setDate(31);
    if (dateList[0]) {
      [ealierDate] = dateList;
    }

    for (let i = 1; i < dateList.length; i += 1) {
      let tempDate = new Date();
      tempDate.setFullYear(2999);
      tempDate.setMonth(12);
      tempDate.setDate(31);
      if (dateList[i]) {
        tempDate = dateList[i];
      }

      const gap = tempDate - ealierDate;
      ealierDate = gap < 0 ? dateList[i] : ealierDate;
    }

    return ealierDate;
  },

  /**
   * get first day in current month
   */
  getFirstDayInCurrent() {
    const firstDate = new Date();
    firstDate.setDate(1); // first Day
    return firstDate;
  },

  /**
   * get last day in current month
   */
  getLastDayInCurrent() {
    const firstDate = new Date();
    firstDate.setDate(1); // first Day
    const endDate = new Date(firstDate);
    endDate.setMonth(firstDate.getMonth() + 1);
    endDate.setDate(0);
    return endDate;
  },

  /**
   * server side delay function
   * @param {Function} aFunction
   * @param {Integer} milliseconds
   */
  setTimeout(aFunction, milliseconds) {
    const date = new Date();
    date.setMilliseconds(date.getMilliseconds() + milliseconds);
    while (new Date() < date) {
      // wait for timeout
    }

    return aFunction();
  },

  /**
   * map reduce error handling, email notification and summary audit
   * @param {Object} summary - Map/Reduce Summary Object
   * @param {String} rcpts - Employee Internal Id, Email string or comma separated string
   */

  handleErrorMR(summary, rcpts) {
    const { inputSummary } = summary;
    const { mapSummary } = summary;
    const { reduceSummary } = summary;

    if (inputSummary.error) {
      const e = error.create({
        name: 'INPUT_STAGE_FAILED',
        message: inputSummary.error
      });
      this.handleErrorAndSendNotification(e, 'Get Input Data', rcpts);
    }

    this.handleErrorInStage('Map', mapSummary, rcpts, summary);
    this.handleErrorInStage('Reduce', reduceSummary, rcpts, summary);
    this.createSummaryRecord(summary, rcpts);
    return true;
  },

  handleErrorAndSendNotification(e, stage, rcpts) {
    log.error('Stage: ' + stage + ' failed', e);

    const user = runtime.getCurrentUser().id;
    const author = -5;
    const recipients = rcpts ? rcpts.replace(/\s/g, '').split(',') : user;
    const subject =
      'Map/Reduce script ' + runtime.getCurrentScript().id + ' failed for stage: ' + stage;
    const body =
      'An error occurred with the following information:\n' +
      'Error code: ' +
      e.name +
      '\n' +
      'Error msg: ' +
      e.message;

    email.send({
      author,
      recipients,
      subject,
      body
    });
  },

  handleErrorInStage(stage, summary, rcpts) {
    const errorMsg = [];
    summary.errors.iterator().each((key, value) => {
      const msg = 'Map/Reduce Failure: ' + key + '. Error was: ' + JSON.parse(value).message + '\n';
      errorMsg.push(msg);
      return true;
    });

    if (errorMsg.length > 0) {
      const e = error.create({
        name: 'MAP_REDUCE_FAILED',
        message: JSON.stringify(errorMsg)
      });
      this.handleErrorAndSendNotification(e, stage, rcpts);
    }
  },

  createSummaryRecord(summary, rcpts) {
    try {
      const { seconds } = summary;
      const { usage } = summary;
      const { yields } = summary;

      log.audit(' Usage Consumed', usage);
      log.audit(' Concurrency Number ', summary.concurrency);
      log.audit(' Number of Yields', yields);
      log.audit(' Seconds', seconds);
    } catch (e) {
      this.handleErrorAndSendNotification(e, 'summarize', rcpts);
    }
  },

  /**
   * get query results
   * @param {String} q - query string
   * @param {String} p - query parameter
   * @returns {Array} - query results
   */
  getQueryResults(q, p) {
    return query
      .runSuiteQL({
        query: q,
        params: [p]
      })
      .asMappedResults();
  },

  /**
   * get unique list of objects
   * @param {String} list - array of objects
   * @param {String} keys - array of keys to match on
   * @returns {Array} - unique array of objects
   */
  getUniqueObjectList(list, keys) {
    const seen = new Set();
    return list.filter((el) => {
      const hash = keys.map((k) => el[k]).join('-');
      if (!seen.has(hash)) {
        seen.add(hash);
        return true;
      }

      return false;
    });
  },

  /**
   * round a number to specific decimal numbers
   * @param {Number} num - number to be rounded
   * @param {Number} decimals - decimal numbers
   * @returns {Number} - rounded number
   */
  roundToDecimals(num, decimals) {
    return +(Math.round(num + 'e' + decimals) + 'e-' + decimals);
  },

  /**
   * @param {Array|Object|String} input
   * @returns {Array|Object|String} escaped input
   * @description Escapes xml entities in an array, object, or string
   */
  xmlEscape(input) {
    if (Array.isArray(input)) {
      return input.map((item) => this.xmlEscape(item));
    }

    if (typeof input === 'object') {
      const newObj = {};
      Object.keys(input).forEach((key) => {
        newObj[key] = this.xmlEscape(input[key]);
      });

      return newObj;
    }

    if (typeof input === 'string') {
      return xml.escape({ xmlText: input });
    }

    return input;
  }
}));
