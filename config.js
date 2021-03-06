/**
 * Configuration variables. These can be overridden in the per-system config file 
 */

var log = require('winston');

var env = process.env.NODE_ENV || 'development'

var settings = {
  // Port that the web server will bind to
  web_port: 37760,
  
  // Database settings
  solr_hostname: 'localhost',
  solr_port: 8983,
  solr_max_boolean_terms: 1024,
  solr_corename: 'echoprint',
  
  // Set this to a system username to drop root privileges
  run_as_user: '',
  
  // Filename to log to
  log_path: __dirname + '/logs/echoprint.log',
  // Log level. Valid values are debug, info, warn, error
  log_level: 'debug',
  
  // Minimum number of codes that must be matched to consider a fingerprint
  // match valid
  code_threshold: 10,
  
  // Supported version of echoprint-codegen codes
  codever: '4.12',

  // Application environment
  environment: env
};

// Override default settings with any local settings
try {
  localSettings = require('./config.' + env);
  
  for (var property in localSettings) {
    if (localSettings.hasOwnProperty(property))
      settings[property] = localSettings[property];
  }
  
  log.info('Loaded settings from config.' + env + '.js. Database is Solr on ' +
    settings.solr_hostname + ':' + settings.solr_port + ' - core: ' + settings.solr_corename);
} catch (err) {
  log.warn('Using default settings from config.js. Database is Solr on ' +
    settings.solr_hostname + ':' + settings.solr_port);
}

module.exports = settings;
