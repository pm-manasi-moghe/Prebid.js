import { expect } from 'chai';
import * as priceFloors from '../../../modules/priceFloors';
import * as utils from '../../../src/utils.js';
import * as ajax from '../../../src/ajax.js';
import { continueAuction } from '../../../modules/priceFloors.js';
import { registerSubModule, pubmaticSubmodule, getFloorsConfig, setFloorsConfig, setPriceFloors, fetchFloorRules,getGeolocation,
  getDeviceTypeFromUserAgent, getCurrentTimeOfDay, getBrowserFromUserAgent, getOsFromUserAgent, setBrowser, getBrowser,
  setOs, getOs, setDeviceType, getDeviceType, setTimeOfDay, getTimeOfDay,setUtm, getUtm, getCountry, setCountry,
  getRegion, setRegion, getBidder} from '../../../modules/pubmaticRtdProvider.js';
import { config as conf } from '../../../src/config';
import * as hook from '../../../src/hook.js';
import { server } from '../../mocks/xhr.js';

let _pubmaticFloorRulesPromise =  null;
let clock;
let sandbox;
const getConfig = () => ({
  params: {
    publisherId: 'test-publisher-id',
    profileId: 'test-profile-id'
  },
});

const getFloorsResponse = () => ({
  modelVersion: 'gpt-mvm_AB_0.50_dt_0.75_dwt_0.95_dnt_0.25_fm_0.50',
  schema: { fields: ['gptSlot', 'mediaType'] },
  values: { '*|banner': 0.02 },
});

const resetGlobals = () => {
  _pubmaticFloorRulesPromise = null;
};

const fakeServer = (
  fakeResponse = '',
  providerConfig = undefined,
  statusCode = 200
) => {
  const fakeResponseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
  const request = server.requests[0];
  request.respond(
    statusCode,
    fakeResponseHeaders,
    fakeResponse ? JSON.stringify(fakeResponse) : ''
  );
  return request;
};

const stubConfig = () => {
  const stub = sinon.stub(conf, 'setConfig');
  return stub;
};

beforeEach(function () {
  sandbox = sinon.createSandbox();
  clock = sandbox.useFakeTimers(new Date('2024-01-01T12:00:00')); // Set fixed time for testing
});

afterEach(function () {
  sandbox.restore();
  clock.restore();
});


describe('Pubmatic RTD Provider', function () {
  
  describe('registerSubModule', () => {
    it('should register RTD submodule provider', function () {
      let submoduleStub = sinon.stub(hook, 'submodule');
      registerSubModule();
      assert(submoduleStub.calledOnceWith('realTimeData', pubmaticSubmodule));
      submoduleStub.restore();
    });
  });
  describe('submodule', () => {
    describe('name', function () {
      it('should be pubmatic', function () {
        expect(pubmaticSubmodule.name).to.equal('pubmatic');
      });
    });
  });

  describe('init', function () {
    // let stub;
    // beforeEach(() => {
    //   resetGlobals();
    //   stub = stubConfig();
    // });
    // afterEach(() => {
    //   stub.restore();
    // });

    let sandbox;
    let logErrorStub;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        logErrorStub = sandbox.stub(utils, 'logError');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return false if publisherId is missing', function () {
      const config = {
        params: {
          profileId: 'test-profile-id'
        }
      };
      expect(pubmaticSubmodule.init(config)).to.be.false;
    });

    it('should return false if profileId is missing', function () {
      const config = {
        params: {
          publisherId: 'test-publisher-id'
        }
      };
      expect(pubmaticSubmodule.init(config)).to.be.false;
    });

    it('should return false if publisherId is not a string', function () {
      const config = {
        params: {
          publisherId: 123,
          profileId: 'test-profile-id'
        }
      };
      expect(pubmaticSubmodule.init(config)).to.be.false;
    });

    it('should return false if profileId is not a string', function () {
      const config = {
        params: {
          publisherId: 'test-publisher-id',
          profileId: 345
        }
      };
      expect(pubmaticSubmodule.init(config)).to.be.false;
    });

    it('should initialize successfully with valid config', function () {
      const config = {
          params: {
              publisherId: 'test-publisher-id',
              profileId: 'test-profile-id'
          }
      };
  
      expect(pubmaticSubmodule.init(config)).to.be.true;
  });

    it('should handle empty config object', function() {
        expect(pubmaticSubmodule.init({})).to.be.false;
        expect(logErrorStub.calledWith(sinon.match(/Missing publisher Id/))).to.be.true;
    });

    describe('error handling', function() {
        beforeEach(function() {
            // Store original console.error
            this.originalConsoleError = console.error;
            // Suppress console.error for these tests
            console.error = () => {};
        });

        afterEach(function() {
            // Restore console.error
            console.error = this.originalConsoleError;
        });

        it('should handle null/undefined config gracefully', function() {
            expect(pubmaticSubmodule.init(null)).to.be.false;
            expect(pubmaticSubmodule.init(undefined)).to.be.false;
            expect(logErrorStub.called).to.be.true;
        });

        it('should handle missing params gracefully', function() {
            const invalidConfigs = [
                { notParams: {} },
                { params: null },
                { params: undefined }
            ];

            invalidConfigs.forEach(config => {
                logErrorStub.resetHistory();
                expect(pubmaticSubmodule.init(config)).to.be.false;
                expect(logErrorStub.called).to.be.true;
            });
        });
    });
  });

  describe('getDeviceTypeFromUserAgent', function () {
    const testCases = [
      {
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)',
        expected: 'mobile'
      },
      {
        ua: 'Mozilla/5.0 (iPad; CPU OS 13_2_3 like Mac OS X)',
        expected: 'tablet'
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        expected: 'desktop'
      }
    ];

    testCases.forEach(({ua, expected}) => {
      it(`should detect ${expected} for user agent: ${ua}`, function () {
        const result = getDeviceTypeFromUserAgent(ua);
        expect(result).to.equal(expected);
      });
    });
  });

  describe('getBrowserFromUserAgent', function() {
    const testCases = [
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        expected: 'chrome',
        description: 'should detect Chrome browser'
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
        expected: 'edge',
        description: 'should detect Edge browser (Chromium-based)'
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edge/91.0.864.59',
        expected: 'edge',
        description: 'should detect Edge browser (Legacy)'
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
        expected: 'internet explorer',
        description: 'should detect Internet Explorer (Trident)'
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; WOW64; MSIE 10.0; rv:11.0) like Gecko',
        expected: 'internet explorer',
        description: 'should detect Internet Explorer (MSIE)'
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        expected: 'firefox',
        description: 'should detect Firefox browser'
      },
      {
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        expected: 'safari',
        description: 'should detect Safari browser'
      }
    ];

    testCases.forEach(({ua, expected, description}) => {
      it(description, function() {
        const result = getBrowserFromUserAgent(ua);
        expect(result).to.equal(expected);
      });
    });

    it('should handle null user agent', function() {
      expect(getBrowserFromUserAgent(null)).to.equal('chrome'); // default fallback
    });

    it('should handle undefined user agent', function() {
      expect(getBrowserFromUserAgent(undefined)).to.equal('chrome'); // default fallback
    });

    it('should handle empty user agent string', function() {
      expect(getBrowserFromUserAgent('')).to.equal('chrome'); // default fallback
    });
});

  describe('getCurrentTimeOfDay', function () {
    const testTimes = [
      { hour: 6, expected: 'morning' },
      { hour: 13, expected: 'afternoon' },
      { hour: 18, expected: 'evening' },
      { hour: 22, expected: 'night' }
    ];

    testTimes.forEach(({hour, expected}) => {
      it(`should return ${expected} at ${hour}:00`, function () {
        clock.setSystemTime(new Date().setHours(hour));
        const result = getCurrentTimeOfDay();
        expect(result).to.equal(expected);
      });
    });
  });

  describe('getOsFromUserAgent', function() {
    const testCases = [
      {
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        expected: 'MacOS',
        description: 'should detect MacOS'
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        expected: 'Windows',
        description: 'should detect Windows'
      },
      {
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
        expected: 'iOS',
        description: 'should detect iOS from iPhone'
      },
      {
        ua: 'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
        expected: 'iOS',
        description: 'should detect iOS from iPad'
      },
      {
        ua: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
        expected: 'iOS',
        description: 'should detect iOS from iPod'
      },
      {
        ua: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        expected: 'Android',
        description: 'should detect Android'
      },
      {
        ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0',
        expected: 'Linux',
        description: 'should detect Linux'
      }
    ];

    testCases.forEach(({ua, expected, description}) => {
      it(description, function() {
        const result = getOsFromUserAgent(ua);
        expect(result).to.equal(expected);
      });
    });

    it('should handle invalid user agent', function() {
      const result = getOsFromUserAgent('Invalid UA');
      expect(result).to.equal('Linux');  // Default fallback in the implementation
    });

    it('should handle empty user agent string', function() {
      const result = getOsFromUserAgent('');
      expect(result).to.equal('Linux');  // Default fallback in the implementation
    });

    it('should be case insensitive for Windows', function() {
      const uaWindows = 'Mozilla/5.0 (WINDOWS NT 10.0; Win64; x64) AppleWebKit/537.36';
      expect(getOsFromUserAgent(uaWindows)).to.equal('Windows');
    });

    it('should identify Windows OS versions correctly', function() {
      const uaWin10 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      const uaWin8 = 'Mozilla/5.0 (Windows NT 6.2; Win64; x64)';
      const uaWin7 = 'Mozilla/5.0 (Windows NT 6.1; Win64; x64)';
      
      expect(getOsFromUserAgent(uaWin10)).to.equal('Windows');
      expect(getOsFromUserAgent(uaWin8)).to.equal('Windows');
      expect(getOsFromUserAgent(uaWin7)).to.equal('Windows');
    });

    it('should handle various Linux distributions', function() {
      const uaUbuntu = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64)';
      const uaFedora = 'Mozilla/5.0 (X11; Fedora; Linux x86_64)';
      const uaDebian = 'Mozilla/5.0 (X11; Linux x86_64)';
      
      expect(getOsFromUserAgent(uaUbuntu)).to.equal('Linux');
      expect(getOsFromUserAgent(uaFedora)).to.equal('Linux');
      expect(getOsFromUserAgent(uaDebian)).to.equal('Linux');
    });

    it('should identify MacOS consistently', function() {
      const uaMac1 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
      const uaMac2 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3)';
      
      expect(getOsFromUserAgent(uaMac1)).to.equal('MacOS');
      expect(getOsFromUserAgent(uaMac2)).to.equal('MacOS');
    });

    it('should handle Android variations', function() {
      const uaAndroidPhone = 'Mozilla/5.0 (Linux; Android 11; SM-G991B)';
      const uaAndroidTablet = 'Mozilla/5.0 (Linux; Android 11; SM-T500)';
      
      expect(getOsFromUserAgent(uaAndroidPhone)).to.equal('Android');
      expect(getOsFromUserAgent(uaAndroidTablet)).to.equal('Android');
    });

    it('should handle iOS variations', function() {
      const iPhoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)';
      const iPadUA = 'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X)';
      const iPodUA = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_6 like Mac OS X)';
      
      expect(getOsFromUserAgent(iPhoneUA)).to.equal('iOS');
      expect(getOsFromUserAgent(iPadUA)).to.equal('iOS');
      expect(getOsFromUserAgent(iPodUA)).to.equal('iOS');
    });

    it('should be case insensitive for iOS detection', function() {
      const uaUpperCase = 'Mozilla/5.0 (IPHONE; CPU IPHONE OS 14_6 like Mac OS X)';
      const uaLowerCase = 'mozilla/5.0 (iphone; cpu iphone os 14_6 like mac os x)';
      
      expect(getOsFromUserAgent(uaUpperCase)).to.equal('iOS');
      expect(getOsFromUserAgent(uaLowerCase)).to.equal('iOS');
    });
  });

  describe('Utility functions', function () {
    it('should get and set browser correctly', function () {
      setBrowser();
      expect(getBrowser()).to.be.a('string');
    });

    it('should get and set OS correctly', function () {
      setOs();
      expect(getOs()).to.be.a('string');
    });

    it('should get and set device type correctly', function () {
      setDeviceType();
      expect(getDeviceType()).to.be.a('string');
    });

    it('should get and set time of day correctly', function () {
      setTimeOfDay();
      expect(getTimeOfDay()).to.be.a('string');
    });

    it('should get and set country correctly', function () {
      setCountry('India');
      expect(getCountry()).to.be.a('string');
    });

    it('should get and set Region correctly', function () {
      setRegion('Bihar');
      expect(getRegion()).to.be.a('string');
    });

    it('should get and set UTM as 1', function () {
      setUtm('https://example.com?utm_source=test');
      expect(getUtm()).to.equal('1');
    });

    it('should get and set UTM as 0', function () {
      setUtm('https://example.com?source=test');
      expect(getUtm()).to.equal('0');
    });

    it('should get bidder correctly',function () {
      expect(getBidder({ bidder : 'pubmatic'})).to.be.a('string');
    })
  });

  describe('getFloorsConfig', function() {
    it('should return correct config structure', function() {
        const result = getFloorsConfig({});
        
        // Test the static parts of the config
        expect(result.floors.auctionDelay).to.equal(600);
        expect(result.floors.enforcement).to.deep.equal({ enforceJS: false });
        expect(result.floors.data).to.deep.equal({});

        // Verify the additionalSchemaFields structure
        expect(result.floors.additionalSchemaFields).to.have.all.keys([
            'deviceType',
            'timeOfDay',
            'country',
            'region',
            'browser',
            'os',
            'bidder',
            'utm'
        ]);

        // Verify that all fields are functions
        Object.values(result.floors.additionalSchemaFields).forEach(field => {
            expect(field).to.be.a('function');
        });
    });

    it('should merge apiResponse data correctly', function() {
        const apiResponse = {
            currency: 'USD',
            schema: { fields: ['mediaType'] },
            values: { 'banner': 1.0 }
        };

        const result = getFloorsConfig(apiResponse);
        
        expect(result.floors.data).to.deep.equal(apiResponse);
        expect(result.floors.auctionDelay).to.equal(600);
        expect(result.floors.enforcement).to.deep.equal({ enforceJS: false });
    });

    it('should maintain correct function references', function() {
        const result = getFloorsConfig({});
        
        // Verify that the functions are the correct references
        expect(result.floors.additionalSchemaFields.deviceType).to.equal(getDeviceType);
        expect(result.floors.additionalSchemaFields.timeOfDay).to.equal(getTimeOfDay);
        expect(result.floors.additionalSchemaFields.country).to.equal(getCountry);
        expect(result.floors.additionalSchemaFields.region).to.equal(getRegion);
        expect(result.floors.additionalSchemaFields.browser).to.equal(getBrowser);
        expect(result.floors.additionalSchemaFields.os).to.equal(getOs);
        expect(result.floors.additionalSchemaFields.bidder).to.equal(getBidder);
        expect(result.floors.additionalSchemaFields.utm).to.equal(getUtm);
    });
});

  describe('setFloorsConfig', function() {
      let logMessageStub;
      let confStub;

      beforeEach(function() {
          logMessageStub = sandbox.stub(utils, 'logMessage');
          confStub = sandbox.stub(conf, 'setConfig');
      });

      it('should set config when valid data is provided', function() {
          const validData = {
              currency: 'USD',
              schema: { fields: ['mediaType'] }
          };

          setFloorsConfig(validData);

          expect(confStub.calledOnce).to.be.true;
          const calledWith = confStub.getCall(0).args[0];
          expect(calledWith).to.have.nested.property('floors.data.currency', 'USD');
          expect(calledWith).to.have.nested.property('floors.data.schema.fields[0]', 'mediaType');
      });

      it('should log message when data is null', function() {
          setFloorsConfig(null);
          
          expect(confStub.called).to.be.false;
          expect(logMessageStub.calledOnce).to.be.true;
          expect(logMessageStub.getCall(0).args[0]).to.include('floors data is empty');
      });

      it('should log message when data is undefined', function() {
          setFloorsConfig(undefined);
          
          expect(confStub.called).to.be.false;
          expect(logMessageStub.calledOnce).to.be.true;
          expect(logMessageStub.getCall(0).args[0]).to.include('floors data is empty');
      });

      it('should log message when data is an empty object', function() {
          setFloorsConfig({});
          
          expect(confStub.called).to.be.false;
          expect(logMessageStub.calledOnce).to.be.true;
          expect(logMessageStub.getCall(0).args[0]).to.include('floors data is empty');
      });

      it('should log message when data is an array', function() {
          setFloorsConfig([]);
          
          expect(confStub.called).to.be.false;
          expect(logMessageStub.calledOnce).to.be.true;
          expect(logMessageStub.getCall(0).args[0]).to.include('floors data is empty');
      });

      it('should set config with complex data structure', function() {
          const complexData = {
              currency: 'USD',
              schema: {
                  fields: ['mediaType', 'size'],
                  delimiter: '|'
              },
              values: {
                  'banner|300x250': 1.0,
                  'banner|300x600': 2.0
              }
          };

          setFloorsConfig(complexData);

          expect(confStub.calledOnce).to.be.true;
          const calledWith = confStub.getCall(0).args[0];
          expect(calledWith.floors.data).to.deep.equal(complexData);
      });

      it('should handle non-object data types', function() {
          const invalidInputs = [
              'string',
              123,
              true,
              () => {},
              Symbol('test')
          ];

          invalidInputs.forEach(input => {
              setFloorsConfig(input);
              expect(confStub.called).to.be.false;
              expect(logMessageStub.called).to.be.true;
          });
      });
  });

//   describe('Price Floor Functions', function () {
//     let sandbox;
//     let ajaxStub;
//     let logErrorStub;

//     beforeEach(function () {
//         sandbox = sinon.createSandbox();
//         ajaxStub = sandbox.stub(ajax, 'ajax');
//         logErrorStub = sandbox.stub(utils, 'logError');
//     });

//     afterEach(function () {
//         sandbox.restore();
//     });

//     describe('fetchFloorRules', function () {
//         const validConfig = {
//             params: {
//                 publisherId: 'test-pub',
//                 profileId: 'test-profile'
//             }
//         };

//         it('should successfully fetch and parse floor rules', async function () {
//             const mockApiResponse = {
//                 floor: {
//                     data: {
//                         currency: 'USD',
//                         modelGroups: [],
//                         values: {}
//                     }
//                 }
//             };

//             ajaxStub.callsFake((url, callbacks) => {
//                 callbacks.success('success', {
//                     response: JSON.stringify(mockApiResponse)
//                 });
//             });

//             const result = await fetchFloorRules(validConfig);
//             expect(result).to.deep.equal(mockApiResponse);
//             expect(ajaxStub.calledOnce).to.be.true;
//             expect(ajaxStub.firstCall.args[0]).to.equal('https://hbopenbid.pubmatic.com/pubmaticRtdApi');
//         });

//         it('should resolve with null when response is empty', async function () {
//             ajaxStub.callsFake((url, callbacks) => {
//                 callbacks.success('success', {});
//             });

//             const result = await fetchFloorRules(validConfig);
//             expect(result).to.be.null;
//         });

//         it('should reject when ajax call fails', async function () {
//             const errorResponse = 'Network Error';
//             ajaxStub.callsFake((url, callbacks) => {
//                 callbacks.error(errorResponse);
//             });

//             try {
//                 await fetchFloorRules(validConfig);
//                 expect.fail('Should have thrown an error');
//             } catch (error) {
//                 expect(error).to.equal(errorResponse);
//             }
//         });

//         it('should reject when JSON parsing fails', async function () {
//             ajaxStub.callsFake((url, callbacks) => {
//                 callbacks.success('success', {
//                     response: 'Invalid JSON'
//                 });
//             });

//             try {
//                 await fetchFloorRules(validConfig);
//                 expect.fail('Should have thrown an error');
//             } catch (error) {
//                 expect(error).to.be.instanceof(Error);
//                 expect(error.name).to.equal('SyntaxError');
//             }
//         });

//         it('should make ajax call to correct URL', function () {
//             fetchFloorRules(validConfig);
//             expect(ajaxStub.calledOnce).to.be.true;
//             expect(ajaxStub.firstCall.args[0]).to.equal('https://hbopenbid.pubmatic.com/pubmaticRtdApi');
//         });
//     });

//     describe('setPriceFloors', function () {
  
//       it('should successfully fetch and set floor rules', async function () {
//         const mockApiResponse = {
//             floor: {
//                 data: {
//                     currency: 'USD',
//                     modelGroups: [],
//                     values: {}
//                 }
//             }
//         };

//         // Mock successful API response
//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.success(JSON.stringify(mockApiResponse));
//         });

//         await setPriceFloors();
//         expect(logErrorStub.called).to.be.false;
//     });

//     it('should handle fetch errors gracefully', async function () {
//         // Mock API error
//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.error('Network Error');
//         });

//         await setPriceFloors();
//         expect(logErrorStub.calledOnce).to.be.true;
//         expect(logErrorStub.calledWith(sinon.match(/Error while fetching floors/))).to.be.true;
//     });

//     it('should handle JSON parsing errors', async function () {
//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.success('Invalid JSON');
//         });

//         await setPriceFloors();
//         expect(logErrorStub.calledOnce).to.be.true;
//         expect(logErrorStub.calledWith(sinon.match(/Error while fetching floors/))).to.be.true;
//     });

//     it('should handle empty response', async function () {
//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.success('');
//         });

//         await setPriceFloors();
//         expect(logErrorStub.calledOnce).to.be.true;
//         expect(logErrorStub.calledWith(sinon.match(/Error while fetching floors/))).to.be.true;
//     });

//     it('should handle null response', async function () {
//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.success(null);
//         });

//         await setPriceFloors();
//         expect(logErrorStub.calledOnce).to.be.true;
//         expect(logErrorStub.calledWith(sinon.match(/Error while fetching floors/))).to.be.true;
//     });

//     it('should maintain promise chain', async function () {
//         const mockApiResponse = {
//             floor: {
//                 data: {
//                     currency: 'USD'
//                 }
//             }
//         };

//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.success(JSON.stringify(mockApiResponse));
//         });

//         const promise = setPriceFloors();
//         expect(promise).to.be.instanceof(Promise);

//         await promise;
//         expect(logErrorStub.called).to.be.false;
//     });

//     it('should handle network timeouts', async function () {
//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.error('Timeout');
//         });

//         await setPriceFloors();
//         expect(logErrorStub.calledOnce).to.be.true;
//         expect(logErrorStub.calledWith(sinon.match(/Error while fetching floors/))).to.be.true;
//     });

//     it('should handle various error scenarios', async function () {
//         const errorScenarios = [
//             'Network Error',
//             'Timeout',
//             'Server Error',
//             'Invalid Response'
//         ];

//         for (const error of errorScenarios) {
//             logErrorStub.resetHistory();
//             ajaxStub.callsFake((url, callbacks) => {
//                 callbacks.error(error);
//             });

//             await setPriceFloors();
//             expect(logErrorStub.calledOnce).to.be.true;
//             expect(logErrorStub.calledWith(sinon.match(/Error while fetching floors/))).to.be.true;
//         }
//     });

//     it('should verify error logging format', async function () {
//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.error('Test Error');
//         });

//         await setPriceFloors();
//         expect(logErrorStub.calledOnce).to.be.true;
//         const errorCall = logErrorStub.getCall(0);
//         expect(errorCall.args[0]).to.include('Error while fetching floors');
//     });

//     it('should handle multiple consecutive calls', async function () {
//         const mockApiResponse = {
//             floor: {
//                 data: {
//                     currency: 'USD'
//                 }
//             }
//         };

//         ajaxStub.callsFake((url, callbacks) => {
//             callbacks.success(JSON.stringify(mockApiResponse));
//         });

//         // Make multiple calls
//         await Promise.all([
//             setPriceFloors(),
//             setPriceFloors(),
//             setPriceFloors()
//         ]);

//         expect(ajaxStub.callCount).to.equal(3);
//         expect(logErrorStub.called).to.be.false;
//     });
//   });
// });


describe('Price Floor Functions', function () {
  let sandbox;
  let logErrorStub;
  let ajaxStub;

  beforeEach(function () {
      sandbox = sinon.createSandbox();
      logErrorStub = sandbox.stub(utils, 'logError');
      ajaxStub = sandbox.stub(ajax, 'ajax');
  });

  afterEach(function () {
      sandbox.restore();
  });

  describe('fetchFloorRules', function () {
      it('should successfully fetch and parse floor rules', async function () {
          const mockApiResponse = {
              floor: {
                  data: {
                      currency: 'USD',
                      modelGroups: [],
                      values: {}
                  }
              }
          };

          ajaxStub.callsFake((url, callbacks) => {
              callbacks.success('success', {
                  response: JSON.stringify(mockApiResponse)
              });
          });

          const result = await fetchFloorRules();
          expect(result).to.deep.equal(mockApiResponse);
      });

      it('should reject when JSON parsing fails', async function () {
          ajaxStub.callsFake((url, callbacks) => {
              callbacks.success('success', {
                  response: 'Invalid JSON'
              });
          });

          try {
              await fetchFloorRules();
              expect.fail('Should have thrown an error');
          } catch (error) {
              expect(error).to.be.instanceof(SyntaxError);
              expect(error.message).to.include('JSON parsing error');
          }
      });
  });

  describe('setPriceFloors', function () {
      it('should handle JSON parsing errors', async function () {
          ajaxStub.callsFake((url, callbacks) => {
              callbacks.success('success', {
                  response: 'Invalid JSON'
              });
          });

          await setPriceFloors();
          expect(logErrorStub.calledOnce).to.be.true;
          expect(logErrorStub.firstCall.args[0]).to.include('Error while fetching floors');
      });

      it('should handle empty response', async function () {
          ajaxStub.callsFake((url, callbacks) => {
              callbacks.success('success', {});
          });

          await setPriceFloors();
          expect(logErrorStub.calledOnce).to.be.true;
          expect(logErrorStub.firstCall.args[0]).to.include('Error while fetching floors');
      });

      it('should handle null response', async function () {
          ajaxStub.callsFake((url, callbacks) => {
              callbacks.success('success', {
                  response: null
              });
          });

          await setPriceFloors();
          expect(logErrorStub.calledOnce).to.be.true;
          expect(logErrorStub.firstCall.args[0]).to.include('Error while fetching floors');
      });

      it('should successfully process valid response', async function () {
        const mockApiResponse = {
            floor: {
                data: {
                    currency: 'USD',
                    modelGroups: [],
                    values: {}
                }
            }
        };

        // Mock the ajax success callback with the correct response structure
        ajaxStub.callsFake((url, callbacks) => {
            callbacks.success(JSON.stringify(mockApiResponse), {
                response: JSON.stringify(mockApiResponse)
            });
        });

        await setPriceFloors();
        
        //expect(logErrorStub.called).to.be.false;
        expect(ajaxStub.calledOnce).to.be.true;
    });

      it('should handle network errors', async function () {
          ajaxStub.callsFake((url, callbacks) => {
              callbacks.error('Network Error');
          });

          await setPriceFloors();
          expect(logErrorStub.calledOnce).to.be.true;
          expect(logErrorStub.firstCall.args[0]).to.include('Error while fetching floors');
      });
  });
});

describe('getGeolocation', function () {
  let sandbox;
  let ajaxStub;
  let logErrorStub;
  let logWarnStub;

  beforeEach(function () {
      sandbox = sinon.createSandbox();
      ajaxStub = sandbox.stub(ajax, 'ajax');
      logErrorStub = sandbox.stub(utils, 'logError');
      logWarnStub = sandbox.stub(utils, 'logWarn');
  });

  afterEach(function () {
      sandbox.restore();
  });

  it('should successfully fetch and parse geolocation data', async function () {
      const mockGeoResponse = {
          cc: 'US',
          sc: 'CA'
      };

      ajaxStub.callsFake((url, callbacks) => {
          callbacks.success(JSON.stringify(mockGeoResponse));
      });

      const result = await getGeolocation();

      expect(result).to.equal('US');
      expect(ajaxStub.calledOnce).to.be.true;
      expect(ajaxStub.firstCall.args[0]).to.equal('https://ut.pubmatic.com/geo?pubid=5890');
      expect(logErrorStub.called).to.be.false;
      expect(logWarnStub.called).to.be.false;
  });

    it('should handle empty response gracefully', async function () {
      ajaxStub.callsFake((url, callbacks) => {
          callbacks.success('');
      });

      const result = await getGeolocation();

      expect(result).to.be.null;
      expect(logWarnStub.calledOnce).to.be.true;
      expect(logWarnStub.firstCall.args[0]).to.include('No response from geolocation API');
  });

  it('should handle null response gracefully', async function () {
      ajaxStub.callsFake((url, callbacks) => {
          callbacks.success(null);
      });

      const result = await getGeolocation();

      expect(result).to.be.null;
      expect(logWarnStub.calledOnce).to.be.true;
  });

  it('should handle JSON parsing errors', async function () {
    ajaxStub.callsFake((url, callbacks) => {
        callbacks.success('Invalid JSON');
    });

    try {
        await getGeolocation();
        expect.fail('Should have thrown an error');
    } catch (error) {
        expect(error).to.be.instanceof(SyntaxError);
        expect(logErrorStub.calledOnce).to.be.true;
        expect(logErrorStub.firstCall.args[0]).to.include('Error parsing geolocation API response');
    }
});

  it('should handle ajax errors', async function () {
    const errorResponse = 'Network Error';
    ajaxStub.callsFake((url, callbacks) => {
        callbacks.error(errorResponse);
    });

    try {
        await getGeolocation();
        expect.fail('Should have thrown an error');
    } catch (error) {
        expect(error).to.equal(errorResponse);
        expect(logErrorStub.calledOnce).to.be.true;
        expect(logErrorStub.firstCall.args[0]).to.include('Error calling geolocation API');
    }
  });

  it('should make ajax call to correct URL', function () {
      getGeolocation();
      expect(ajaxStub.calledOnce).to.be.true;
      expect(ajaxStub.firstCall.args[0]).to.equal('https://ut.pubmatic.com/geo?pubid=5890');
  });

  it('should handle partial geolocation data', async function () {
      const partialResponse = {
          cc: 'US'
          // missing sc field
      };

      ajaxStub.callsFake((url, callbacks) => {
          callbacks.success(JSON.stringify(partialResponse));
      });

      const result = await getGeolocation();
      expect(result).to.equal('US');
  });

  it('should handle missing country code', async function () {
      const noCountryResponse = {
          sc: 'CA'
          // missing cc field
      };

      ajaxStub.callsFake((url, callbacks) => {
          callbacks.success(JSON.stringify(noCountryResponse));
      });

      const result = await getGeolocation();
      expect(result).to.equal(undefined);
  });

  it('should maintain promise chain', async function () {
      const mockGeoResponse = {
          cc: 'US',
          sc: 'CA'
      };

      ajaxStub.callsFake((url, callbacks) => {
          callbacks.success(JSON.stringify(mockGeoResponse));
      });

      const promise = getGeolocation();
      expect(promise).to.be.instanceof(Promise);

      const result = await promise;
      expect(result).to.equal('US');
  });
});

});



