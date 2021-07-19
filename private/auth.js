/**
 * Hidden from public view, contains API server credentials
 * for authenticating app requests
 */

var os = require('os');
var fs = require('fs');
var path = require('path');

const PROD = os.hostname() == 'fenrir';
const HOME_PATH = PROD ? '/home/juan' : process.env.HOME;
const CONFIG_FILE = HOME_PATH + '/.cnuapps/api/secrets.json';

var auth = {
	db: {},
	email : {},

	getDatabasePort : function() {
		return this.db.port;
	},
	getDatabaseUser : function() {
		return this.db.user;
	},
	getDatabasePassword : function() {
		return this.db.pass;
	},

	getEmailUser : function() {
		return this.email.user;
	},
	getEmailPassword : function() {
		return this.email.pass;
	},
	getEmailHost : function() {
		return this.email.host;
	},

	init : function() {
		const data = fs.readFileSync(CONFIG_FILE, 'utf8');
		var configObj = JSON.parse(data);
		this.db = configObj.db;
		this.email = configObj.email;
	}

};

module.exports = auth;