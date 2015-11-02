#!/bin/env/node

/**
 * Pizza My Mind API server - Handles endpoint requests,
 * request authentication, and dataflow
 * @juanvallejo
 */

// define runtime variables
var MYSQL_DB_HOST 	= process.env.OPENSHIFT_MYSQL_DB_HOST 	|| '127.0.0.1';
var MYSQL_DB_PORT 	= process.env.OPENSHIFT_MYSQL_DB_PORT 	|| '63966';
var APP_MAIN_HOST 	= process.env.OPENSHIFT_NODEJS_IP 		|| '0.0.0.0';
var APP_MAIN_PORT 	= process.env.OPENSHIFT_NODEJS_PORT 	|| 7777;

var fs 		= require('fs');
var socket 	= require('socket.io');
var http 	= require('http');
var mysql   = require('mysql').createConnection({
	host    : MYSQL_DB_HOST,
	port    : MYSQL_DB_PORT,
	user    : 'adminVhA9aks',
	password: 'WwnDBa9n2sNz',
	database: 'pmm'
});

var requestRouter = {
	'/': 'index.html'
};

var requestDefs = {
	'index.html': {
		'type': 'FILE',
		'mime': 'html'
	}
}

var typeDefs = {
	'css' 	: 'text/css' 				,
	'html' 	: 'text/html' 				,
	'ico' 	: 'image/x-icon'			,
	'jpg' 	: 'image/jpeg'				,
	'jpeg' 	: 'image/jpeg' 				,
	'js' 	: 'application/javascript' 	,
	'map' 	: 'application/x-navimap'	,
	'pdf' 	: 'application/pdf' 		,
	'png' 	: 'image/png'				,
	'ttf'	: 'application/octet-stream',
	'txt' 	: 'text/plain'				,
	'woff'	: 'application/x-font-woff'
}

// define env variables
var eventName 						= null;
var eventTableCreated 				= false;
var databaseSynced 					= false;
var databaseEntries 				= [];
var callbacksOnEventTableCreated 	= [];

// establish connection - handle errors if any
mysql.connect(function(error) {

	if(error) {
	    return console.log('MYSQL', error);
	}

	console.log('MYSQL', 'Successfully connected to the mysql server.', 'Setting up database...');
	initConfigureDatabase();

});

var httpServer = http.createServer(function(request, response) {

	var routedReq = requestRouter[request.url] || request.url;

	if(requestDefs[routedReq] && requestDefs[routedReq].type == 'FILE') {
		fs.readFile(__dirname + '/' + routedReq, function(err, data) {
			if(err) {
				return console.log('HTTP', 'FS', err);
			}

			var mime = typeDefs[requestDefs[routedReq].mime];
			if(!mime) {
				var ext = routedReq.split('.');
				ext 	= ext[ext.length - 1];
				mime 	= typeDefs[ext] || typeDefs['txt'];
			}

			response.writeHead(200, {'Content-Type': mime});
			response.end(data);
		});
	}

}).listen(APP_MAIN_PORT, APP_MAIN_HOST);

/**
 * Sets up database (for the first time if needed). Ensures correct
 * tables exist. Creates 'students' and 'events' table
 */
function initConfigureDatabase() {

	// create students table
	mysql.query('CREATE TABLE IF NOT EXISTS `students` (' +
		
			'`id` int(11) unsigned NOT NULL AUTO_INCREMENT,'	+
			'`student_id` varchar(25) DEFAULT NULL,'			+
			'`last` varchar(25) DEFAULT NULL,'					+
			'`first` varchar(25) DEFAULT NULL,'					+
			'`year` varchar(20) DEFAULT NULL,'					+
			'`major` varchar(30) DEFAULT NULL,'					+
			'`email` varchar(50) DEFAULT NULL,'					+
			'`date_added` varchar(25) DEFAULT NULL,'			+
			'PRIMARY KEY (`id`),'								+
			'UNIQUE KEY `student_id` (`student_id`)'			+

		') ENGINE=InnoDB AUTO_INCREMENT=537 DEFAULT CHARSET=utf8', function(err) {

			if(err) {
				// if an error occurrs creating table for current event, 
				return console.log('MYSQL', err);
			}

			console.log('MYSQL', '`students` table configured. Configuring `events` table...');

			// create events table
			mysql.query('CREATE TABLE IF NOT EXISTS `events` (' 						+

					'`id` int(11) unsigned NOT NULL AUTO_INCREMENT,' 	+
					'`table_name` varchar(50) DEFAULT NULL,' 			+
					'`event_name` varchar(50) DEFAULT NULL,'			+
					'`total` int(11) DEFAULT NULL,' 					+
					'`total_new` int(11) DEFAULT NULL,' 				+
					'PRIMARY KEY (`id`)' 								+

				') ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8', function(err) {

					if(err) {
						// if an error occurrs creating table for current event, 
						return console.log('MYSQL', err);
					}

					console.log('MYSQL', '`events` table configured.');

					// fetch previous data and populate local database
					initFetchDatabaseEntries();

				});

		});
}

/**
 * Fetches all saved entries (from table `students`)
 * from database for comparing with registered clients
 * Assumes initConfigureDatabase() has already been called
 */
function initFetchDatabaseEntries() {

	mysql.query('SELECT * FROM `students`', function(err, rows, fields) {

		if(err) {
			return console.log('MYSQL', err);
		}

		databaseEntries = rows;

		// init socket listener
		initSocketListener();

	});
}

/**
 * Opens socket connection to begin syncing data
 * with clients running PMM software
 * Assumes configureDatabase() has been called
 */
function initSocketListener() {

	console.log('SERVER', 'Database configured, ' + databaseEntries.length + ' rows found. Listening for connections...');

	var io = socket.listen(httpServer).on('connection', function(client) {

		console.log('SOCKET.IO', 'Client', client.id, ' has connected');

		client.emit('client_Register', {id: client.id});

		client.on('add_registeredstudent', function(data) {
			console.log('Adding registered student to database');
			console.log(data);
		});

		client.on('sync_eventName', function(data) {

			// tell console we're creating a table for our event instead of updating the mysql database. hopefully just this once.
			console.log('MYSQL', 'creating table in mysql database for the current event');

			eventName = data.eventName;
			mysql.query('CREATE TABLE IF NOT EXISTS ' + eventName + ' (' +
					
						'`id` int(11) unsigned NOT NULL AUTO_INCREMENT,'	+
						'`student_id` varchar(25) DEFAULT NULL,'			+
						'`is_new` varchar(2) DEFAULT NULL,'					+
						'PRIMARY KEY (`id`)'								+

					') ENGINE=InnoDB DEFAULT CHARSET=utf8', function(err) {

				if(err) {
					// if an error occurrs creating table for current event, 
					return console.log('MYSQL', 'An error occurred creating a mysql table for the current event -> ' + err);
				}

				eventTableCreated = true;

				console.log('ABOUT TO CALL CALLBACKS ', callbacksOnEventTableCreated.length);

				// call all onEventTableCreated callback functions
				for(var i = 0; i < callbacksOnEventTableCreated.lenght; i++) {
					callbacksOnEventTableCreated[i].call();
				}

				// reset callbacks
				callbacksOnEventTableCreated = [];

			});
		});

		// called at beginning of client program. client sends a copy of its local
		// database. it is matched with remote database, remote database is updated accordingly.
		client.on('sync_database', function(data) {

			if(eventTableCreated) {
				syncDatabase(data.entries);
			} else {
				callbacksOnEventTableCreated.push(function() {
					syncDatabase(data.entries);
				});
			}

		});

	});
}

/**
 * Takes an array of objects, compares entries passed
 * with current entries. Algorithm always prefers passed entries
 * as most recent. Cloud entries WILL be updated with client entries
 */
function syncDatabase(entries) {

	console.log('MYSQL', 'SYNC', 'Request received to sync ' + entries.length + ' entries for event ' + eventName);

	var _time = Date.now();
	var entriesSynced = 0;
	var errors = [];

	console.log('MYSQL', 'SYNC', 'Syncing...');

	for(var i = 0; i < entries.length; i++) {

		mysql.query(

			'INSERT INTO `students` (student_id, last, first, year, major, email, date_added) VALUES ' +
			'("' + entries[i].id + '", "' + entries[i].lname + '", "' + entries[i].fname + '", "' + entries[i].year + '", "' + entries[i].major + '", "' + entries[i].email + '", "' + eventName +'") ' +
			'ON DUPLICATE KEY ' +
			'UPDATE last="' + entries[i].lname + '", first="' + entries[i].fname + '", year="' + entries[i].year + '", major="' + entries[i].major + '", email="' + entries[i].email + '"',
		
		function(err) {

			entriesSynced++;

			if(err) {
				errors.push(('MYSQL' + ' SYNC ' + err));
			}

			if(entriesSynced >= entries.length) {
				_time = Date.now() - _time;
				console.log('Successfully synced', (entries.length - errors.length), 'entries in ', (_time / 1000), 'seconds');
				console.log(errors.length + ' errors found' + (errors.lenght ? (' last error: ' + errors[errors.length - 1]) : '.'));
			}

		});

	}

}