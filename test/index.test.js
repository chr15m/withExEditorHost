"use strict";
{
  /* api */
  const {assert} = require("chai");
  const {describe, it} = require("mocha");
  const sinon = require("sinon");
  const index = require("../index");
  const process = require("process");
  const {HOST} = require("../modules/constant.js");

  describe("hostMsg", () => {
    it("should get object", () => {
      const {hostMsg} = index;
      const msg = "test message";
      const stat = "log";
      assert.deepEqual(hostMsg(msg, stat), {
        [HOST]: {
          message: msg,
          status: stat,
        },
      });
    });
  });
}
