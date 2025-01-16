import { submodule } from '../src/hook.js';
import { logError, isStr, logWarn, logMessage } from '../src/utils.js';
import {config as conf} from '../src/config.js';
import { ajax } from '../src/ajax.js';

/**
 * @typedef {import('../modules/rtdModule/index.js').RtdSubmodule} RtdSubmodule
 */

/**
 * This RTD module has a dependency on the priceFloors module.
 * We utilize the continueAuction function from the priceFloors module to incorporate price floors data into the current auction.
 */
import { continueAuction } from './priceFloors.js';

// Constants consolidated
const CONSTANTS = Object.freeze({
  SUBMODULE_NAME: 'pubmatic',
  REAL_TIME_MODULE: 'realTimeData',
  LOG_PRE_FIX: 'PubMatic-Rtd-Provider: '
});

// Endpoints consolidated
const ENDPOINTS = Object.freeze({
  FLOORS_ENDPOINT: `https://hbopenbid.pubmatic.com/pubmaticRtdApi`,
  GEOLOCATION: `https://ut.pubmatic.com/geo?pubid=5890`
});

let _timeOfDay = 'evening';
let _deviceType = 'mobile';
let _country = 'Australia';
let _region = 'Delhi';
let _browser = 'Chrome';
let _os = 'Android';
let _utm = '0';

let _pubmaticFloorRulesPromise = null;

//Utility Functions
export function getDeviceTypeFromUserAgent(userAgent) {
  const ua = userAgent.toLowerCase();

  if (/mobile|iphone|ipod|android.*mobile|blackberry|windows phone/.test(ua)) {
    return 'mobile';
  }
  if (/tablet|ipad|android(?!.*mobile)/.test(ua)) {
    return 'tablet';
  }

  return 'desktop';
}

export function getCurrentTimeOfDay() {
  const currentHour = new Date().getHours();

  if (currentHour >= 5 && currentHour < 12) {
    return 'morning';
  } else if (currentHour >= 12 && currentHour < 17) {
    return 'afternoon';
  } else if (currentHour >= 17 && currentHour < 19) {
    return 'evening';
  } else {
    return 'night';
  }
}

export function getBrowserFromUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return 'chrome';
  }

  userAgent = userAgent.toLowerCase();

  if (userAgent.includes('edge/') || userAgent.includes('edg/')) {
    return 'edge';
  }
  if (userAgent.includes('msie') || userAgent.includes('trident/')) {
    return 'internet explorer';
  }
  if (userAgent.includes('chrome')) {
    return 'chrome';
  }
  if (userAgent.includes('firefox')) {
    return 'firefox';
  }
  if (userAgent.includes('safari')) {
    return 'safari';
  }

  return 'chrome'; 
}

export function getOsFromUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return 'Linux';
  }

  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return 'iOS';
  }
  if (/android/i.test(userAgent)) {
    return 'Android';
  }
  if (/macintosh|mac os x/i.test(userAgent)) {
    return 'MacOS'; 
  }

  if (/windows|win32|win64/i.test(userAgent)) {
    return 'Windows';  
  }

  if (/linux/i.test(userAgent)) {
    return 'Linux';  
  }

  return 'Linux'; 
}

//Getter-Setter Functions
export function getBrowser() {
  return _browser;
}

export function setBrowser() {
  let browser = getBrowserFromUserAgent(navigator.userAgent);
  _browser = browser;
}

export function getOs() {
  return _os;
}

export function setOs() {
  let os = getOsFromUserAgent(navigator.userAgent);
  _os = os;
}

export function getDeviceType() {
  return _deviceType;
}

export function setDeviceType() {
  let deviceType = getDeviceTypeFromUserAgent(navigator.userAgent);
  _deviceType = deviceType;
}

export function getTimeOfDay() {
  return _timeOfDay;
}

export function setTimeOfDay() {
  let timeOfDay = getCurrentTimeOfDay();
  _timeOfDay = timeOfDay;
}

export function getCountry() {
  return _country;
}

export function setCountry(value) {
  _country = value;
}

export function getRegion() {
  return _region;
}

export function setRegion(value) {
  _region = value;
}

export function getBidder(bidderDetail) {
  return bidderDetail?.bidder;
}

export function getUtm() {
  return _utm;
}

export function setUtm(url) {
  const queryString = url?.split('?')[1];
  _utm = queryString?.includes('utm') ? '1' : '0';
}

export const getFloorsConfig = (apiResponse) => {
  const floor = {
    auctionDelay: 600,
    enforcement: {
      enforceJS: false
    },
    data : {
      ...apiResponse
    }
  }
  const floorsConfig = {
    floors: {
      ...floor,
      additionalSchemaFields: {
        deviceType: getDeviceType,
        timeOfDay: getTimeOfDay,
        country: getCountry,
        region: getRegion,
        browser: getBrowser,
        os: getOs,
        bidder: getBidder,
        utm: getUtm
      }
    },
  };

  return floorsConfig;
};

export const setFloorsConfig = (data) => {
  if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0) {
    const floorsConfig = getFloorsConfig(data);
    conf.setConfig(floorsConfig);
  }else{
    logMessage(CONSTANTS.LOG_PRE_FIX + 'The fetched floors data is empty.');
  }
};

export const setPriceFloors = async () => {
  try {
    const apiResponse = await fetchFloorRules();
    if (!apiResponse) {
      logError(CONSTANTS.LOG_PRE_FIX + 'Error while fetching floors: Empty response');
    }else{
      setFloorsConfig(apiResponse);
    }
  } catch (error) {
    logError(CONSTANTS.LOG_PRE_FIX + 'Error while fetching floors:', error);
  }
};

export const fetchFloorRules = async () => {
  return new Promise((resolve, reject) => {
    const url = ENDPOINTS.FLOORS_ENDPOINT;
    
    ajax(url, {
      success: (responseText, response) => {
        try {
          if (!response || !response.response) {
            reject(new Error(CONSTANTS.LOG_PRE_FIX + ' Empty response'));
            return;
          }

          const apiResponse = JSON.parse(response.response);
         
          resolve(apiResponse);
        } catch (error) {
          reject(new SyntaxError(CONSTANTS.LOG_PRE_FIX + ' JSON parsing error: ' + error.message));
        }
      },
      error: (error) => {
        reject(new Error(CONSTANTS.LOG_PRE_FIX + 'Ajax error: ' + error));
      },
    });
  });
};

export const getGeolocation = async () => {
  return new Promise((resolve, reject) => {
    const url = ENDPOINTS.GEOLOCATION;
    if (url) {
      ajax(url, {
        success: (response) => {
          try {
            if (!response) {
              logWarn(CONSTANTS.LOG_PRE_FIX + 'No response from geolocation API');
              resolve(null);
              return;
            }

            let apiResponse;
            try {
              apiResponse = JSON.parse(response);
            } catch (parseError) {
              logError(CONSTANTS.LOG_PRE_FIX + 'Error parsing geolocation API response - ', parseError);
              reject(parseError);
              return;
            }

            if (apiResponse) {
              setCountry(apiResponse.cc);
              setRegion(apiResponse.sc);
              resolve(apiResponse.cc);
            } else {
              logWarn(CONSTANTS.LOG_PRE_FIX + 'Invalid response from geolocation API');
              resolve(null);
            }
          } catch (error) {
            logError(CONSTANTS.LOG_PRE_FIX + 'Error processing geolocation API response - ', error);
            reject(error);
          }
        },
        error: (error) => {
          logError(CONSTANTS.LOG_PRE_FIX + 'Error calling geolocation API - ', error);
          reject(error);
        },
      });
    } else {
      logError(CONSTANTS.LOG_PRE_FIX + 'Invalid geolocation API URL');
      reject(new Error('Invalid URL'));
    }
  });
};

/**
 * Initialize the Pubmatic RTD Module.
 * @param {Object} config
 * @param {Object} _userConsent
 * @returns {boolean}
 */
function init(config, _userConsent) {
  const publisherId = config?.params?.publisherId;
  const profileId = config?.params?.profileId;

  if (!publisherId) {
    logError(CONSTANTS.LOG_PRE_FIX + 'Missing publisher Id.');
    return false;
  }

  if (publisherId && !isStr(publisherId)) {
    logError(CONSTANTS.LOG_PRE_FIX + 'Publisher Id should be string.');
    return false;
  }

  if (!profileId) {
    logError(CONSTANTS.LOG_PRE_FIX + 'Missing profile Id.');
    return false;
  }

  if (profileId && !isStr(profileId)) {
    logError(CONSTANTS.LOG_PRE_FIX + 'Profile Id should be string.');
    return false;
  }

  _pubmaticFloorRulesPromise = setPriceFloors(config);
  getGeolocation();
  setBrowser();
  setOs();
  setTimeOfDay();
  setDeviceType();
  setUtm(window.location?.href);
  return true;
}

/**
 * @param {Object} reqBidsConfigObj
 * @param {function} callback
 * @param {Object} config
 * @param {Object} userConsent
 */

const getBidRequestData = (() => {
  let floorsAttached = false;
  return (reqBidsConfigObj, onDone) => {
    if (!floorsAttached) {
      _pubmaticFloorRulesPromise.then(() => {
        const hookConfig = {
          reqBidsConfigObj,
          context: this,
          nextFn: () => true,
          haveExited: false,
          timer: null
        };
        continueAuction(hookConfig);
        onDone();
      });

      floorsAttached = true;
    }
  };
})();

/** @type {RtdSubmodule} */
export const pubmaticSubmodule = {
  /**
   * used to link submodule with realTimeData
   * @type {string}
   */
  name: CONSTANTS.SUBMODULE_NAME,
  init: init,
  getBidRequestData,
};

export function registerSubModule() {
  submodule(CONSTANTS.REAL_TIME_MODULE, pubmaticSubmodule);
}

registerSubModule();
