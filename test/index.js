const t = require('../src/');
const expect = require('chai').expect;

const skipTests = [
  [ '{keys:1}' ],
  [ '{+keys:1}' ]
];

function testSuite(title, data) {
  describe(title, () => {
    Object.keys(data).forEach(section => {
      describe(section, () => {
        data[section].testcases.forEach(testcase => {
          const skip = skipTests.some(skipcase => {
            if (skipcase[0] !== testcase[0]) {
              return false
            }
            return true;
          });

          (skip ? xit : it)(testcase[0], () => {
            let template;
            try {
              template = t.compile(testcase[0]);
            }
            catch (e) {
              if (testcase[1] !== false) {
                throw e;
              }
              return;
            }

            const url = template.render(data[section].variables);

            if (Array.isArray(testcase[1])) {
              expect(url).to.be.oneOf(testcase[1]);
            }
            else {
              expect(url).to.equal(testcase[1]);
            }
          });
        });
      });
    });
  });
}

testSuite('Spec Examples by Section', require('./spec/spec-examples-by-section.json'));
testSuite('Extended Tests', Object.assign({},
  require('./spec/extended-tests.json'),
  require('./spec/negative-tests.json')));
testSuite('Geraint\'s tests', Object.assign({},
  require('./geraint/test/custom-tests.json'),
  require('./geraint/test/custom-tests-2.json')));
