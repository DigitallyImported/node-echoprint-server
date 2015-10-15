/**
 * Simple HTTP server module
 */

var newrelic = require('newrelic');
var http = require('http');
var urlParser = require('url');
var qs = require('querystring');
var log = require('winston');
var jade = require('jade');
var config = require('./config');
var api = require('./controllers/api');
var debug = require('./controllers/debug');

exports.init = init;
exports.renderView = renderView;
exports.respond = respond;

var TIMEOUT = 1000 * 320;
var POST_SIZE_LIMIT = 10 * 1024 * 1024; // 10 megabytes

/**
 * Initialize the HTTP endpoints.
 */
function init() {
  var server = http.createServer(function(req, res) {
    req.start = new Date();
    req.timer = setTimeout(function() { timeout(req, res); }, TIMEOUT);

    var url = urlParser.parse(req.url, true);
    var path = url.pathname.split('/', 16);
    var size = 0;

    if (req.method === 'GET')
    {
      try {
        switch(path[1]) {

        case "query":
          newrelic.setTransactionName('query');
          return api.query(req, res);
          break;

        case "debug":
          newrelic.setTransactionName('debug');
          return debug.debugQuery(req, res);
          break;
        }
      } catch(err) {
        var msg = 'An unknown error has occured: ' + err;
        log.error(msg);
        respond(req, res, 500, {error: msg});
      }
    }
    else if (req.method === 'POST')
    {
      req.body = '';
      req.on('data', function(data) {
        size += data.length;
        req.body += data;

        // Limit POST size
        if (size > POST_SIZE_LIMIT) {
          req.abort();
          return respond(req, res, 422, { error: 'POST size cannot exceed 10MB' });
        }
      });

      req.on('end', function() {
        if (req.body.length === 0) {
	        return respond(req, res, 422, { error: 'POST query must contain body' });
        }

        try {
  	      switch(path[1]) {

          case "ingest":
            newrelic.setTransactionName('ingest');
            req.body = JSON.parse(req.body);
            return api.ingest(req, res);
            break;

          case "ingestAll":
            newrelic.setTransactionName('ingestAll');
            req.body = JSON.parse(req.body);
            return api.ingestAll(req, res);
            break;

          case "debug":
            newrelic.setTransactionName('debug');
            req.body = qs.parse(req.body);
            return debug.debugQuery(req, res);
            break;

          case "query":
            newrelic.setTransactionName('query');
            req.body = JSON.parse(req.body)
            return api.query(req, res);
            break;

          case "queryAll":
            newrelic.setTransactionName('queryAll');
            req.body = JSON.parse(req.body);
            return api.queryAll(req, res);
            break;

          default:
            respond(req, res, 404, {error: 'Invalid API endpoint'});
          }
        }
        catch (err) {
          var msg = 'An unknown error has occured: ' + err;
          log.error(msg);
          respond(req, res, 500, {error: msg});
        }
      });
      return;
    }

    respond(req, res, 404, { error: 'Invalid API endpoint' });
  })

  server.addListener('clientError', function(ex) {
    newrelic.noticeError(ex);
    log.error('Client error: ' + ex);
  });

  server.listen(config.web_port);

  log.info('HTTP listening on port ' + config.web_port);
}

/**
 * Render a view template and send it as an HTTP response.
 */
function renderView(req, res, statusCode, view, options, headers) {
  jade.renderFile(__dirname + '/views/' + view, options, function(err, html) {
    if (err) {
      log.error('Failed to render ' + view + ': ' + err);
      return respond(req, res, 500, 'Internal server error', headers);
    }

    respond(req, res, 200, html, headers);
  });
}

/**
 * Send an HTTP response to a client.
 */
function respond(req, res, statusCode, body, headers) {
  // Destroy the response timeout timer
  clearTimeout(req.timer);

  statusCode = statusCode || 200;

  if (!headers)
    headers = {};

  if (typeof body !== 'string') {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  } else {
    headers['Content-Type'] = 'text/html';
  }

  var contentLength = body ? Buffer.byteLength(body, 'utf8') : '-';
  if (body)
    headers['Content-Length'] = contentLength;

  var remoteAddress =
    (req.socket && (req.socket.remoteAddress || (req.socket.socket && req.socket.socket.remoteAddress)));

  var referrer = req.headers.referer || req.headers.referrer || '';
  if (referrer.length > 128)
    referrer = referrer.substr(0, 128) + ' ...';

  var url = req.url;
  if (url.length > 128)
    url = url.substr(0, 128) + ' ...';

  log.info(
    remoteAddress +
      ' - - [' + (new Date()).toUTCString() + ']' +
      ' "' + req.method + ' ' + url +
      ' HTTP/' + req.httpVersionMajor + '.' + req.httpVersionMinor + '" ' +
      statusCode + ' ' + contentLength +
      ' "' + referrer +
      '" "' + (req.headers['user-agent'] || '') + '"');

  try {
    res.writeHead(200, headers);
    res.end(body);
  } catch (ex) {
    newrelic.noticeError(ex);
    log.error('Error sending response to ' + remoteAddress + ': ' + ex);
  }
}

/**
 * Handles server timeouts by logging an error and responding with a 503.
 */
function timeout(req, res) {
  var remoteAddress =
    (req.socket && (req.socket.remoteAddress || (req.socket.socket && req.socket.socket.remoteAddress)));
  log.error('Timed out while responding to a request from ' + remoteAddress);

  try {
    res.writeHead(503);
    res.end();
  } catch (ex) {
    newrelic.noticeError(ex);
  }
}
