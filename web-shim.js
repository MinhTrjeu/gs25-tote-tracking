// =============================================================================
// web-shim.js
// Thay thế cho google.script.run (chỉ tồn tại khi HTML được chính Apps
// Script host) - dùng khi frontend.html được host RIÊNG (GitHub Pages...)
// và gọi vào Apps Script Web App qua fetch() thường thay vì RPC nội bộ.
//
// Toàn bộ code còn lại trong frontend.html KHÔNG cần sửa gì - vẫn viết
// google.script.run.withSuccessHandler(...).withFailureHandler(...).tenHam(...)
// y hệt như cũ, vì shim này dựng lại đúng API đó, chỉ đổi cách gửi đi.
//
// QUAN TRỌNG: gửi Content-Type: text/plain (KHÔNG phải application/json) để
// trình duyệt không bắn preflight OPTIONS - Apps Script không xử lý được
// OPTIONS (không có doOptions()), preflight sẽ luôn lỗi nếu bật lên.
// =============================================================================
(function () {
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzQpl2baXZGRIbYrIBM8ccUEJP6fybYD9KhE9FTvQDtgu9FtBIV3bV6f2r7q25S_VLE/exec';

  // Danh sách hàm được phép gọi qua RPC - PHẢI khớp với RPC_FUNCTIONS trong
  // backkend.gs (doPost). Thêm hàm mới thì thêm ở cả 2 nơi.
  var FUNCTION_NAMES = [
    'login', 'logout', 'getSession', 'getStores', 'addStore', 'scanBatch',
    'getDashboard', 'getInTransitSummary', 'getToteHistory', 'getDailyOutSummary',
    'getAbnormalSummary', 'submitStoreAudit', 'getStoreAuditHistory', 'getHomeSummary'
  ];

  function callServer(fnName, args, successHandler, failureHandler) {
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fnName, args: args })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (successHandler) successHandler(data);
      })
      .catch(function (err) {
        if (failureHandler) failureHandler(err);
        else if (window.console) console.error('google.script.run (' + fnName + ') lỗi:', err);
      });
  }

  function createChain(successHandler, failureHandler) {
    var proxy = {};

    FUNCTION_NAMES.forEach(function (name) {
      proxy[name] = function () {
        var args = Array.prototype.slice.call(arguments);
        callServer(name, args, successHandler, failureHandler);
      };
    });

    proxy.withSuccessHandler = function (fn) {
      return createChain(fn, failureHandler);
    };
    proxy.withFailureHandler = function (fn) {
      return createChain(successHandler, fn);
    };

    return proxy;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createChain(null, null);
})();
