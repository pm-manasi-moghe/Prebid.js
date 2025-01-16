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

const REAL_TIME_MODULE = 'realTimeData';
const SUBMODULE_NAME = 'pubmatic';
const LOG_PRE_FIX = 'PubMatic-Rtd-Provider: ';
// const GVL_ID = 76;
// const TCF_PURPOSES = [1, 7]

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
    logMessage(LOG_PRE_FIX + 'The fetched floors data is empty.');
  }
};

export const setPriceFloors = async () => {
  try {
    const apiResponse = await fetchFloorRules();
    if (!apiResponse) {
      logError(LOG_PRE_FIX + 'Error while fetching floors: Empty response');
    }else{
      setFloorsConfig(apiResponse);
    }
  } catch (error) {
    logError(LOG_PRE_FIX + 'Error while fetching floors:', error);
  }
};

export const fetchFloorRules = async () => {
  return new Promise((resolve, reject) => {
    const url = 'https://hbopenbid.pubmatic.com/pubmaticRtdApi';
    
    ajax(url, {
      success: (responseText, response) => {
        try {
          if (!response || !response.response) {
            reject(new Error(LOG_PRE_FIX + ' Empty response'));
            return;
          }

          const apiResponse = JSON.parse(response.response);
         
          resolve(apiResponse);
        } catch (error) {
          reject(new SyntaxError(LOG_PRE_FIX + ' JSON parsing error: ' + error.message));
        }
      },
      error: (error) => {
        reject(new Error(LOG_PRE_FIX + 'Ajax error: ' + error));
      },
    });
  });
};

export const getGeolocation = async () => {
  return new Promise((resolve, reject) => {
    const url = 'https://ut.pubmatic.com/geo?pubid=5890';
    if (url) {
      ajax(url, {
        success: (response) => {
          try {
            if (!response) {
              logWarn(LOG_PRE_FIX + 'No response from geolocation API');
              resolve(null);
              return;
            }

            let apiResponse;
            try {
              apiResponse = JSON.parse(response);
            } catch (parseError) {
              logError(LOG_PRE_FIX + 'Error parsing geolocation API response - ', parseError);
              reject(parseError);
              return;
            }

            if (apiResponse) {
              setCountry(apiResponse.cc);
              setRegion(apiResponse.sc);
              resolve(apiResponse.cc);
            } else {
              logWarn(LOG_PRE_FIX + 'Invalid response from geolocation API');
              resolve(null);
            }
          } catch (error) {
            logError(LOG_PRE_FIX + 'Error processing geolocation API response - ', error);
            reject(error);
          }
        },
        error: (error) => {
          logError(LOG_PRE_FIX + 'Error calling geolocation API - ', error);
          reject(error);
        },
      });
    } else {
      logError(LOG_PRE_FIX + 'Invalid geolocation API URL');
      reject(new Error('Invalid URL'));
    }
  });
};

/**
 * Checks TCF and USP consents
 * @param {Object} userConsent
 * @returns {boolean}
 */
// function checkConsent (userConsent) {
//   let consent

//   if (userConsent) {
//     if (userConsent.gdpr && userConsent.gdpr.gdprApplies) {
//       const gdpr = userConsent.gdpr

//       if (gdpr.vendorData) {
//         const vendor = gdpr.vendorData.vendor
//         const purpose = gdpr.vendorData.purpose

//         let vendorConsent = false
//         if (vendor.consents) {
//           vendorConsent = vendor.consents[GVL_ID]
//         }

//         if (vendor.legitimateInterests) {
//           vendorConsent = vendorConsent || vendor.legitimateInterests[GVL_ID]
//         }

//         const purposes = TCF_PURPOSES.map(id => {
//           return (purpose.consents && purpose.consents[id]) || (purpose.legitimateInterests && purpose.legitimateInterests[id])
//         })
//         const purposesValid = purposes.filter(p => p === true).length === TCF_PURPOSES.length
//         consent = vendorConsent && purposesValid
//       }
//     } else if (userConsent.usp) {
//       const usp = userConsent.usp
//       consent = usp[1] !== 'N' && usp[2] !== 'Y'
//     }
//   }

//   return consent
// }

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
    logError(LOG_PRE_FIX + 'Missing publisher Id.');
    return false;
  }

  if (publisherId && !isStr(publisherId)) {
    logError(LOG_PRE_FIX + 'Publisher Id should be string.');
    return false;
  }

  if (!profileId) {
    logError(LOG_PRE_FIX + 'Missing profile Id.');
    return false;
  }

  if (profileId && !isStr(profileId)) {
    logError(LOG_PRE_FIX + 'Profile Id should be string.');
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

// With CMP FLow
// function getBidRequestData(reqBidsConfigObj, onDone, config, userConsent) {

//   //check user consent
//   const hasConsent = checkConsent(userConsent)
//   const initialize = hasConsent !== false

// if(initialize){
//   _pubmaticFloorRulesPromise = setPriceFloors(config);
//   __pubmaticGeolocationPromise__ = getGeolocation();
//   Promise.allSettled([_pubmaticFloorRulesPromise,__pubmaticGeolocationPromise__]).then(() => {
//   const hookConfig = {
//     reqBidsConfigObj,
//     context: this,
//     nextFn: ()=> true,
//     haveExited: false,
//     timer: null
//   };
//   continueAuction(hookConfig);
//   onDone();
// });
// }
// }

// Without CMP FLow
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
  name: SUBMODULE_NAME,
  init: init,
  getBidRequestData,
};

export function registerSubModule() {
  submodule(REAL_TIME_MODULE, pubmaticSubmodule);
}

registerSubModule();
