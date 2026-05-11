"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

global.window = global;
eval(fs.readFileSync(path.join(__dirname, "..", "utils", "parser.js"), "utf8"));

const cases = [
  ["Try again after 5 minutes", 300],
  ["Login after 9 minutes", 540],
  ["Please wait 30 seconds", 30],
  ["Try again after 1 minute 20 seconds", 80],
  ["Please wait 07:30", 450],
  ["Login after 7/8", 480],
  ["Try later", null]
];

for (const [input, expected] of cases) {
  const result = window.VisaFlowXParser.parseCooldownText(input);
  assert.strictEqual(result ? result.seconds : null, expected, input);
}

console.log("parser.test.js passed");
